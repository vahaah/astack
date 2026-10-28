import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../../git.ts";
import {
	detectTracker,
	type InitFlags,
	initProfile,
	initReport,
	parseTrackerFlag,
} from "../../init.ts";
import { formatJson } from "../../json-format.ts";
import { canonical } from "../../paths.ts";
import { PROFILE_PATH, profileProblems } from "../../profile.ts";
import { kindOf, readFacts } from "../../repo-facts.ts";
import { err, ok, type Result } from "../../result.ts";
import type { Command } from "../command.ts";
import { type Io, usageError } from "../io.ts";

const NAME = "astack init";
const PROFILE_DIR = ".astack";

function parseFlags(args: readonly string[]): Result<InitFlags, string> {
	let tracker: InitFlags["tracker"];
	let requirePartOf = false;
	let ste: InitFlags["ste"];
	let dryRun = false;
	let force = false;
	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (arg === "--require-part-of") requirePartOf = true;
		else if (arg === "--dry-run") dryRun = true;
		else if (arg === "--force") force = true;
		else if (arg === "--tracker") {
			index++;
			const parsed = parseTrackerFlag(args[index] ?? "");
			if (!parsed.ok) return parsed;
			tracker = parsed.value;
		} else if (arg === "--ste") {
			index++;
			const mode = args[index];
			if (mode !== "deny" && mode !== "advise")
				return err("--ste takes deny or advise");
			ste = mode;
		} else return err(`unknown argument ${arg}`);
	}
	return ok({ tracker, requirePartOf, ste, dryRun, force });
}

function writeRefusal(root: string, force: boolean): string | undefined {
	const dir = kindOf(join(root, PROFILE_DIR));
	if (dir !== "missing" && dir !== "directory")
		return `${PROFILE_DIR} is not a folder, so astack init does not write through it.`;
	const file = kindOf(join(root, PROFILE_PATH));
	if (file === "missing") return undefined;
	if (file !== "file")
		return `${PROFILE_PATH} is not a regular file, so astack init does not replace it.`;
	return force
		? undefined
		: `${PROFILE_PATH} exists. Edit it, or run astack init again with --force to replace it.`;
}

function run(args: readonly string[], io: Io): number {
	const flags = parseFlags(args);
	if (!flags.ok) return usageError(io, `${NAME}: ${flags.error}`);
	const root = repoRoot(io.cwd);
	if (root === undefined) {
		io.err(`${NAME}: ${io.cwd} is not in a git repo.\n`);
		return 1;
	}
	if (canonical(root) !== canonical(io.cwd)) {
		io.err(`${NAME}: run it in the repo root, ${root}.\n`);
		return 1;
	}
	const facts = readFacts(root);
	const finding = detectTracker(facts);
	const profile = initProfile(
		facts,
		flags.value.tracker ?? finding.choice,
		flags.value,
	);
	if (!profile.ok) return usageError(io, `${NAME}: ${profile.error}`);
	const problems = profileProblems(profile.value);
	if (problems.length > 0) {
		io.err(`${NAME}: the profile is not valid. ${problems.join(". ")}.\n`);
		return 1;
	}
	if (!flags.value.dryRun) {
		const refusal = writeRefusal(root, flags.value.force);
		if (refusal !== undefined) {
			io.err(`${NAME}: ${refusal}\n`);
			return 1;
		}
		mkdirSync(join(root, PROFILE_DIR), { recursive: true });
		writeFileSync(
			join(root, PROFILE_PATH),
			formatJson(profile.value, facts.indent),
		);
	}
	io.out(initReport(facts, finding, flags.value, profile.value));
	return 0;
}

export const command: Command = {
	name: "init",
	summary:
		"Writes .astack/profile.json in the repo root from what it finds in the repo, and prints the next steps. It never makes a commit, and it does not replace a profile without --force.",
	usage:
		"init [--tracker linear:<TEAM>|github|none] [--require-part-of] [--ste deny|advise] [--dry-run] [--force]",
	run,
};
