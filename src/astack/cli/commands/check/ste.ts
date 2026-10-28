import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { canonicalRelative } from "../../../paths.ts";
import { checkText, denied } from "../../../ste/check.ts";
import { commitProse, SUBJECT_LINES } from "../../../ste/commit.ts";
import { findingLine } from "../../../ste/format.ts";
import {
	hasHeaderFields,
	isExcluded,
	loadSettings,
	type SteSettings,
	settingsFor,
	settingsRootFrom,
} from "../../../ste/profile.ts";
import type { Enforcement, Surface } from "../../../ste/types.ts";
import type { Command } from "../../command.ts";
import { type Io, usageError } from "../../io.ts";
import { readInput } from "./body.ts";

const NAME = "astack check-ste";
const SURFACES: readonly Surface[] = [
	"doc",
	"pr",
	"ticket",
	"commit",
	"comment",
	"reply",
];
const VALUE_FLAGS = ["--mode", "--profile", "--surface", "--old"];

type Args = {
	readonly source: string;
	readonly json: boolean;
	readonly mode: Enforcement;
	readonly profile: string | undefined;
	readonly surface: Surface;
	readonly old: string | undefined;
};

function parse(args: readonly string[]): Args | string {
	const values = new Map<string, string>();
	const positional: string[] = [];
	let json = false;
	for (let index = 0; index < args.length; index++) {
		const arg = args[index] ?? "";
		if (arg === "--json") json = true;
		else if (VALUE_FLAGS.includes(arg)) {
			const value = args[++index];
			if (value === undefined) return `${arg} needs a value`;
			values.set(arg, value);
		} else if (arg.startsWith("--") && arg !== "-")
			return `unknown flag ${arg}`;
		else positional.push(arg);
	}
	const source = positional[0];
	if (source === undefined || positional.length > 1)
		return "give one file, or - for stdin";
	const mode = values.get("--mode") ?? "deny";
	if (mode !== "deny" && mode !== "advise") return "--mode is deny or advise";
	const surface = SURFACES.find(
		(candidate) => candidate === (values.get("--surface") ?? "doc"),
	);
	if (!surface) return `--surface is one of ${SURFACES.join(", ")}`;
	return {
		source,
		json,
		mode,
		profile: values.get("--profile"),
		surface,
		old: values.get("--old"),
	};
}

function settingsOf(io: Io, args: Args): SteSettings | string {
	if (args.profile === undefined) {
		const start =
			args.source === "-" ? io.cwd : dirname(resolve(io.cwd, args.source));
		return loadSettings(settingsRootFrom(start, io.cwd));
	}
	try {
		const path = resolve(io.cwd, args.profile);
		return settingsFor(dirname(path), JSON.parse(readFileSync(path, "utf8")));
	} catch {
		return `cannot read the profile ${args.profile}`;
	}
}

function run(argv: readonly string[], io: Io): number {
	const args = parse(argv);
	if (typeof args === "string") return usageError(io, `${NAME}: ${args}`);
	const settings = settingsOf(io, args);
	if (typeof settings === "string")
		return usageError(io, `${NAME}: ${settings}`);
	const relPath =
		args.source === "-"
			? undefined
			: canonicalRelative(settings.root, resolve(io.cwd, args.source));
	if (relPath !== undefined && isExcluded(relPath, settings.profile)) {
		io.out(`skipped: the STE excludes cover ${relPath}\n`);
		return 0;
	}
	const input = readInput(io, args.source);
	if (input === undefined)
		return usageError(io, `${NAME}: cannot read ${args.source}`);
	const old = args.old === undefined ? undefined : readInput(io, args.old);
	if (args.old !== undefined && old === undefined)
		return usageError(io, `${NAME}: cannot read ${args.old}`);
	const text = args.surface === "commit" ? commitProse(input) : input;
	if (text === undefined) {
		io.out("skipped: git makes this commit message\n");
		return 0;
	}
	const report = checkText(text, {
		surface: args.surface,
		enforcement: args.mode,
		glossary: settings.glossary,
		old,
		titleLines: args.surface === "commit" ? SUBJECT_LINES : undefined,
		headerFields:
			relPath !== undefined && hasHeaderFields(relPath, settings.profile),
	});
	const blocking = denied(report);
	if (args.json) {
		io.out(
			`${JSON.stringify(
				{
					findings: report.findings,
					deny: blocking.length,
					advise: report.findings.length - blocking.length,
					sentences: report.sentences,
					skipped: report.skipped,
				},
				null,
				2,
			)}\n`,
		);
		return blocking.length > 0 ? 1 : 0;
	}
	for (const finding of report.findings)
		io.out(`${finding.severity} ${findingLine(finding)}\n`);
	if (report.skipped === "language")
		io.out("skipped: most letters are not Latin letters\n");
	io.out(
		`${blocking.length} deny, ${report.findings.length - blocking.length} advise, ${report.sentences} sentences\n`,
	);
	return blocking.length > 0 ? 1 : 0;
}

export const command: Command = {
	name: "ste",
	summary:
		"Examines prose with the ASD-STE100 rules. Exits 1 when a deny rule fires.",
	usage:
		"check ste <file|-> [--json] [--mode deny|advise] [--profile <file>] [--surface doc|pr|ticket|commit|comment|reply] [--old <file>]",
	run,
};
