import { writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { sessionAttended } from "../../attended.ts";
import { repoRoot } from "../../git.ts";
import { driftReport, driftText } from "../../plan/drift.ts";
import {
	planCommit,
	planSettings,
	readSnapshot,
	readText,
	renderAt,
} from "../../plan/edge.ts";
import { exportPlan, importPlan, writePlanText } from "../../plan/export.ts";
import { planProfileFor } from "../../plan/files.ts";
import { parseKeys, setFrontmatter, writeKeys } from "../../plan/keys.ts";
import { frontmatterValue } from "../../plan/parse.ts";
import {
	loadPlanSet,
	type PlanSet,
	planSetFromText,
} from "../../plan/planset.ts";
import { type Snapshot, TARGETS, type Target } from "../../plan/tracker.ts";
import {
	appendDraft,
	appendTrail,
	draftEntry,
	draftsPath,
	readTrail,
	SLUG,
	sinceLastStart,
	TRAIL_HEADER,
	TRAIL_KINDS,
	trailPath,
} from "../../plan/trail.ts";
import type { TrailRow } from "../../plan/types.ts";
import { extractCopy } from "../../plan/units.ts";
import { checkText, denied } from "../../ste/check.ts";
import { denyMessage } from "../../ste/format.ts";
import { loadSettings } from "../../ste/profile.ts";
import { positional, valueAfter } from "../args.ts";
import type { Command } from "../command.ts";
import { type Io, usageError } from "../io.ts";

const USAGE = [
	"plan attended",
	"plan trail <slug> [<phase> <decision> <why> <evidence> <result>]",
	"plan draft <slug> [<title> <why>]",
	"plan delegate <plan> on|off",
	"plan export <plan> --to linear|github [--team <name>] [--repo <owner/repo>] [--initiative <name>] [--tracker <file|->] [--overwrite] [--json]",
	"plan move <plan> --to linear|github [the export flags]",
	"plan import <slug> --from linear|github [--tracker <file|->] [--json]",
	"plan drift <plan or slug> [--tracker <file|->] [--json]",
	"plan keys <plan>",
];

export const VALUE_FLAGS = [
	"--to",
	"--from",
	"--team",
	"--repo",
	"--initiative",
	"--tracker",
	"--wip",
];

function attended(args: readonly string[], io: Io): number {
	if (args.length !== 0)
		return usageError(io, "astack plan attended: takes no arguments");
	io.out(sessionAttended(io.env) ? "attended\n" : "unattended\n");
	return 0;
}

function trail(args: readonly string[], io: Io): number {
	const [slug, ...cells] = args;
	if (!slug || !SLUG.test(slug))
		return usageError(
			io,
			"astack plan trail: give the plan slug, such as member-export",
		);
	const path = trailPath(io.cwd, slug);
	if (!path)
		return usageError(io, "astack plan trail: not inside a git repository");
	if (cells.length === 0) {
		const rows = readTrail(path);
		io.out(`${path}\n`);
		for (const row of sinceLastStart(rows ?? []))
			io.out(`${TRAIL_HEADER.map((key) => row[key]).join("\t")}\n`);
		return 0;
	}
	if (cells.length !== 5)
		return usageError(
			io,
			"astack plan trail: give <phase> <decision> <why> <evidence> <result>, quoted",
		);
	const kinds: readonly string[] = TRAIL_KINDS;
	if (!kinds.includes(cells[0] ?? ""))
		return usageError(
			io,
			`astack plan trail: phase is one of ${TRAIL_KINDS.join(", ")}`,
		);
	appendTrail(path, cells, io.now);
	io.out(`${path}\n`);
	return 0;
}

function draft(args: readonly string[], io: Io): number {
	const [slug, title, why, ...rest] = args;
	if (
		!slug ||
		!SLUG.test(slug) ||
		rest.length > 0 ||
		(title !== undefined && why === undefined)
	)
		return usageError(
			io,
			"astack plan draft: give <slug>, or <slug> <title> <why>, quoted",
		);
	const path = draftsPath(io.cwd, slug);
	if (!path)
		return usageError(io, "astack plan draft: not inside a git repository");
	if (title !== undefined && why !== undefined) {
		const blocked = denied(
			checkText(`${title}\n\n${why}`, {
				surface: "ticket",
				enforcement: "deny",
				glossary: loadSettings(rootOf(io)).glossary,
				titleLines: [1],
			}),
		);
		if (blocked.length > 0) {
			io.err(`${denyMessage("this draft", blocked)}\n`);
			return 1;
		}
		appendDraft(path, draftEntry(title, why, io.now));
	}
	io.out(`${path}\n`);
	if (title === undefined) io.out(readText(path) ?? "No drafts yet.\n");
	return 0;
}

export function rootOf(io: Io): string {
	return repoRoot(io.cwd) ?? io.cwd;
}

function delegate(args: readonly string[], io: Io): number {
	const [file, value] = args;
	if (!file || (value !== "on" && value !== "off") || args.length !== 2)
		return usageError(io, "astack plan delegate: give <plan> on|off");
	const path = resolve(io.cwd, file);
	const text = readText(path);
	if (text === undefined)
		return usageError(io, `astack plan delegate: cannot read ${file}`);
	const set = planSetFromText(file, text, () => undefined);
	const trailFile = trailPath(
		io.cwd,
		(frontmatterValue(set.root, "programme") ?? set.slug).toLowerCase(),
	);
	const prior = frontmatterValue(set.root, "checkpoints") ?? "report";
	const restored =
		value === "off" ? checkpointsBefore(readTrail(trailFile)) : undefined;
	const checkpoints = value === "on" ? "report" : restored;
	const next = setFrontmatter(
		checkpoints === undefined
			? text
			: setFrontmatter(text, "checkpoints", checkpoints),
		"delegate",
		value,
	);
	writeFileSync(path, next);
	if (trailFile)
		appendTrail(
			trailFile,
			[
				"delegated",
				`delegate ${value}`,
				value === "on"
					? "the owner granted delegation"
					: "the owner asked to be asked",
				value === "on"
					? `owner prompt, checkpoints were ${prior}`
					: "owner prompt",
				value,
			],
			io.now,
		);
	io.out(
		`${file}: delegate ${value}${checkpoints === undefined ? "" : `, checkpoints ${checkpoints}`}\n`,
	);
	return 0;
}

export function checkpointsBefore(
	rows: readonly TrailRow[] | undefined,
): string | undefined {
	const grant = [...(rows ?? [])]
		.reverse()
		.find((row) => row.phase === "delegated" && row.decision === "delegate on");
	return /checkpoints were (report|approve)\b/.exec(grant?.evidence ?? "")?.[1];
}

function targetFlag(
	args: readonly string[],
	flag: string,
	io: Io,
): Target | undefined {
	const value = valueAfter(args, flag);
	const target = TARGETS.find((candidate) => candidate === value);
	if (!target) usageError(io, `astack plan: ${flag} takes linear or github`);
	return target;
}

export function snapshotFrom(
	args: readonly string[],
	io: Io,
	stdinDefault: boolean,
): Snapshot | undefined {
	const flag = valueAfter(args, "--tracker");
	if (flag === null) {
		usageError(io, "astack plan: --tracker needs a file, or - for stdin");
		return undefined;
	}
	const result = readSnapshot(
		flag ?? (stdinDefault ? "-" : undefined),
		io.input,
		io.cwd,
	);
	if (!result.ok) {
		io.err(
			`${result.error.map((problem) => `astack plan: ${problem}`).join("\n")}\n`,
		);
		return undefined;
	}
	return result.value;
}

export function setFor(
	file: string,
	io: Io,
): { set: PlanSet; root: string } | undefined {
	const root = rootOf(io);
	const loaded = loadPlanSet(root, resolve(io.cwd, file), readText);
	if (!loaded.ok) {
		usageError(io, `astack plan: ${loaded.error}`);
		return undefined;
	}
	return { set: loaded.value, root };
}

function shaOf(root: string, set: PlanSet): string {
	return planCommit(root, [
		set.path,
		...[...set.briefs.values()].map((brief) => brief.path),
	]);
}

export function printPlan(
	io: Io,
	args: readonly string[],
	value: unknown,
	text: string,
): void {
	io.out(
		args.includes("--json") ? `${JSON.stringify(value, null, 2)}\n` : text,
	);
}

function exportCommand(args: readonly string[], io: Io, move: boolean): number {
	const [file] = positional(args, VALUE_FLAGS);
	if (!file)
		return usageError(
			io,
			`astack plan ${move ? "move" : "export"}: give the plan file`,
		);
	const target = targetFlag(args, "--to", io);
	if (!target) return 2;
	const loaded = setFor(file, io);
	if (!loaded) return 2;
	const snapshot = snapshotFrom(args, io, false);
	if (!snapshot) return 2;
	const edited = new Set(
		driftReport(loaded.set, snapshot, {
			target,
			today: io.today,
			now: io.now,
			renderAt: renderAt(loaded.root, loaded.set),
		})
			.filter((found) => found.kind === "edited-in-tracker")
			.map((found) => found.unit),
	);
	const result = exportPlan(loaded.set, snapshot, {
		target,
		sha: shaOf(loaded.root, loaded.set),
		team:
			valueAfter(args, "--team") ?? planSettings(loaded.root).team ?? undefined,
		repo: valueAfter(args, "--repo") ?? undefined,
		initiative: valueAfter(args, "--initiative") ?? undefined,
		move,
		edited,
		overwrite: args.includes("--overwrite"),
	});
	if (!result.ok) {
		io.err(
			`${result.error.map((problem) => `astack plan export: ${problem}`).join("\n")}\n`,
		);
		return 1;
	}
	printPlan(io, args, result.value, writePlanText(result.value));
	return 0;
}

function importCommand(args: readonly string[], io: Io): number {
	const [slug] = positional(args, VALUE_FLAGS);
	if (!slug) return usageError(io, "astack plan import: give the plan slug");
	const target = targetFlag(args, "--from", io);
	if (!target) return 2;
	const snapshot = snapshotFrom(args, io, true);
	if (!snapshot) return 2;
	const result = importPlan(slug, snapshot, target, "import");
	if (!result.ok) {
		io.err(
			`${result.error.map((problem) => `astack plan import: ${problem}`).join("\n")}\n`,
		);
		return 1;
	}
	printPlan(io, args, result.value, writePlanText(result.value));
	return 0;
}

function setFromSnapshot(
	slug: string,
	snapshot: Snapshot,
): PlanSet | undefined {
	const copies = new Map(
		snapshot.objects.flatMap((object) => {
			const copy = object.link?.endsWith("/copy")
				? extractCopy(object.body)
				: undefined;
			return copy ? [[copy.path, copy.text] as const] : [];
		}),
	);
	const root = snapshot.objects.find(
		(object) => object.link === `${slug}/copy`,
	);
	const copy = root ? extractCopy(root.body) : undefined;
	return copy
		? planSetFromText(copy.path, copy.text, (path) => copies.get(path))
		: undefined;
}

function slugFile(root: string, slug: string): string | undefined {
	if (!SLUG.test(slug)) return undefined;
	const dir = join(root, planProfileFor(root).dir);
	return [join(dir, `${slug}.md`), join(dir, slug, "index.md")].find(
		(candidate) => readText(candidate) !== undefined,
	);
}

function drift(args: readonly string[], io: Io): number {
	const [file] = positional(args, VALUE_FLAGS);
	if (!file)
		return usageError(
			io,
			"astack plan drift: give the plan file, or the slug of a moved plan",
		);
	const snapshot = snapshotFrom(args, io, true);
	if (!snapshot) return 2;
	const root = rootOf(io);
	const path =
		readText(resolve(io.cwd, file)) !== undefined ? file : slugFile(root, file);
	const loaded = path === undefined ? undefined : setFor(path, io);
	if (path !== undefined && !loaded) return 2;
	const set = loaded?.set ?? setFromSnapshot(file, snapshot);
	if (!set)
		return usageError(
			io,
			`astack plan drift: ${file} is not a file, and the snapshot holds no plan copy for it`,
		);
	const drifts = driftReport(set, snapshot, {
		target: snapshot.target ?? "linear",
		today: io.today,
		now: io.now,
		renderAt: renderAt(root, set),
	});
	printPlan(io, args, { slug: set.slug, drifts }, driftText(set.slug, drifts));
	return drifts.length > 0 ? 1 : 0;
}

function keys(args: readonly string[], io: Io): number {
	const [file] = args;
	if (!file || args.length !== 1)
		return usageError(
			io,
			'astack plan keys: give the plan file and pipe {"<unit>": "<key>"} on stdin',
		);
	const parsed = parseKeys(io.input?.() ?? "");
	if (!parsed)
		return usageError(
			io,
			"astack plan keys: stdin is a JSON object of unit to key",
		);
	const loaded = setFor(file, io);
	if (!loaded) return 2;
	const applied = new Set<string>();
	for (const path of [
		loaded.set.path,
		...[...loaded.set.briefs.values()].map((brief) => brief.path),
	]) {
		const absolute = resolve(loaded.root, path);
		const text = readText(absolute) ?? "";
		const result = writeKeys(text, loaded.set.slug, parsed, {
			root: path === loaded.set.path,
		});
		if (result.text !== text) writeFileSync(absolute, result.text);
		for (const unit of result.applied) applied.add(unit);
		if (result.text !== text)
			io.out(`${relative(io.cwd, absolute) || absolute}\n`);
	}
	const skipped = [...parsed.keys()].filter((unit) => !applied.has(unit));
	io.out(
		`${applied.size} keys written${skipped.length > 0 ? `; ${skipped.length} kept only in the tracker back-links (${skipped.join(", ")})` : ""}. Commit the plan files in one commit.\n`,
	);
	return 0;
}

function run(args: readonly string[], io: Io): number {
	const [sub, ...rest] = args;
	switch (sub) {
		case "attended":
			return attended(rest, io);
		case "trail":
			return trail(rest, io);
		case "draft":
			return draft(rest, io);
		case "delegate":
			return delegate(rest, io);
		case "export":
			return exportCommand(rest, io, false);
		case "move":
			return exportCommand(rest, io, true);
		case "import":
			return importCommand(rest, io);
		case "drift":
			return drift(rest, io);
		case "keys":
			return keys(rest, io);
		default:
			return usageError(
				io,
				`astack plan: give one of\n${USAGE.map((line) => `  astack ${line}`).join("\n")}`,
			);
	}
}

export const command: Command = {
	name: "plan",
	summary:
		"Keeps the plan trail and drafts, sets the delegation grant, and prints tracker write plans (export, move, import), drift and key write-back. It never calls a tracker.",
	usage: USAGE.join("\n"),
	run,
};
