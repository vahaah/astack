import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	gateLabel,
	outcomeText,
	profileBlobs,
	recordOf,
	runGates,
	saveGateRecord,
} from "../../gates.ts";
import { repoRoot, runGit } from "../../git.ts";
import { MANAGED_PATHS } from "../../managed.ts";
import { processPorts } from "../../ports.ts";
import { parseProfile, profileGates } from "../../pr-review-profile.ts";
import { valueAfter } from "../args.ts";
import type { Command } from "../command.ts";
import { type Io, usageError } from "../io.ts";

const NAME = "astack gates run";

function gitText(root: string, args: string[]): string | undefined {
	const result = runGit(root, args);
	return result.ok ? result.stdout.toString("utf8").trim() : undefined;
}

function readProfile(path: string): string | undefined {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return undefined;
	}
}

function runAll(args: readonly string[], io: Io): number {
	const base = valueAfter(args, "--base");
	if (typeof base !== "string")
		return usageError(io, `${NAME}: give --base <ref>`);
	const root = repoRoot(io.cwd);
	if (root === undefined)
		return usageError(io, `${NAME}: ${io.cwd} is not in a git repository`);
	const path = join(root, MANAGED_PATHS.reviewProfile);
	const text = readProfile(path);
	if (text === undefined)
		return usageError(io, `${NAME}: ${path} does not exist`);
	const profile = parseProfile(text);
	if (profile.issues.length > 0)
		return usageError(
			io,
			[
				`${NAME}: ${path} is not valid:`,
				...profile.issues.map((issue) => `- ${issue.path}: ${issue.message}`),
			].join("\n"),
		);
	const head = gitText(root, ["rev-parse", "HEAD"]);
	const baseSha = gitText(root, [
		"rev-parse",
		"--verify",
		"--quiet",
		`${base}^{commit}`,
	]);
	if (head === undefined || baseSha === undefined)
		return usageError(io, `${NAME}: git cannot resolve HEAD or ${base}`);
	const dirty = gitText(root, [
		"status",
		"--porcelain",
		"--untracked-files=all",
	]);
	if (dirty !== "") {
		io.err(
			`${NAME}: the tree has changes, so astack ran no gate and recorded nothing. Commit or remove them:\n${dirty ?? "git status failed"}\n`,
		);
		return 1;
	}
	const blobs = profileBlobs(processPorts().git, root, head, baseSha);
	if (blobs === undefined || blobs.source !== blobs.base) {
		io.err(
			`${NAME}: HEAD holds another ${MANAGED_PATHS.reviewProfile} than the merge base ${blobs?.mergeBase ?? `of ${base}`}, or one of them holds none, so astack ran no gate and recorded nothing. A gate run judges a branch only by the profile of its base.\n`,
		);
		return 1;
	}
	const say = (line: string) => io.out(`${line}\n`);
	const runs = runGates(
		{ root, env: io.env, say },
		profileGates(profile.data),
		base,
	);
	for (const run of runs)
		say(`${gateLabel(run.name)}_EXIT=${outcomeText(run.outcome)}`);
	const changed = gitText(root, [
		"status",
		"--porcelain",
		"--untracked-files=no",
	]);
	if (changed !== "") {
		say(
			`A gate changed tracked files that its rewrites do not name, so astack recorded nothing:\n${changed ?? "git status failed"}`,
		);
		return 1;
	}
	if (gitText(root, ["rev-parse", "HEAD"]) !== head) {
		say(`HEAD moved from ${head} during the run, so astack recorded nothing.`);
		return 1;
	}
	const record = recordOf(runs, head, base, baseSha, blobs.base);
	if (record === undefined) {
		say("A gate did not pass, so astack recorded nothing.");
		return 1;
	}
	const saved = saveGateRecord(io.env, record);
	if (saved === undefined)
		return usageError(
			io,
			`${NAME}: no state folder, so astack recorded nothing`,
		);
	say(`astack recorded green gates at ${head} on ${base} in ${saved}.`);
	return 0;
}

function run(args: readonly string[], io: Io): number {
	const [action, ...rest] = args;
	if (action === "run") return runAll(rest, io);
	return usageError(io, "astack gates: give run");
}

export const command: Command = {
	name: "gates",
	summary:
		"gates run runs the gates of .claude/pr-review-hardening.profile.md on a clean tree, as the hardening run does. It exports CI=true and each ci_env value, and puts the bun and Supabase CLI versions of its tools first on PATH. A gate applies when a path of git diff --name-only --no-renames <base>...HEAD matches its when_changed globs. It records HEAD, the base and the profile blob at the merge base in the state folder and exits 0 when each gate that applies exits 0. A HEAD whose profile differs from the merge base gets no record. A gate must also change no tracked file outside its rewrites, and HEAD must not move. The destructive guard reads that record before a push that skips the git hooks. Otherwise it records nothing and exits 1.",
	usage: "gates run --base <ref>",
	run,
};
