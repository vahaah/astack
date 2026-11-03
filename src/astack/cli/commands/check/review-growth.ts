import { repoRoot, runGit } from "../../../git.ts";
import { err, ok, type Result } from "../../../result.ts";
import {
	growthReport,
	parseNumstat,
	parseOptions,
	type Totals,
} from "../../../review-growth.ts";
import type { Command } from "../../command.ts";
import type { Io } from "../../io.ts";

const NAME = "astack check review-growth";

function gitText(root: string, args: string[]): string | undefined {
	const result = runGit(root, args);
	const text = result.stdout.toString("utf8").trim();
	return result.ok && text !== "" ? text : undefined;
}

function resolveCommit(
	root: string,
	flag: string,
	ref: string,
	literal: boolean,
): Result<string, string> {
	const sha = gitText(root, [
		"rev-parse",
		"--verify",
		"--end-of-options",
		`${ref}^{commit}`,
	]);
	if (sha === undefined)
		return err(`git cannot resolve ${flag} ${ref} to a commit`);
	return literal && sha !== ref
		? err(`${flag} ${ref} is not the id of a commit`)
		: ok(sha);
}

function isAncestor(root: string, base: string, tip: string): boolean {
	return gitText(root, ["merge-base", base, tip]) === base;
}

function totalsBetween(
	root: string,
	base: string,
	tip: string,
): Result<Totals, string> {
	const diff = runGit(root, [
		"diff",
		"--numstat",
		"-z",
		"--no-ext-diff",
		"--no-textconv",
		"--no-renames",
		"--no-color",
		base,
		tip,
		"--",
	]);
	if (!diff.ok) return err(`git cannot compare ${base} with ${tip}`);
	return parseNumstat(diff.stdout.toString("utf8"));
}

function fail(io: Io, code: number, message: string): number {
	io.err(`${NAME}: ${message}\n`);
	return code;
}

function run(args: readonly string[], io: Io): number {
	const options = parseOptions(args);
	if (!options.ok) return fail(io, 2, options.error);
	const root = repoRoot(io.cwd);
	if (root === undefined) return fail(io, 1, "not inside a git repository");
	const base = resolveCommit(root, "--base", options.value.base, true);
	if (!base.ok) return fail(io, 1, base.error);
	const first = resolveCommit(
		root,
		"--first-reviewed",
		options.value.firstReviewed,
		true,
	);
	if (!first.ok) return fail(io, 1, first.error);
	const head = resolveCommit(root, "--head", options.value.head, false);
	if (!head.ok) return fail(io, 1, head.error);
	const snapshots = [
		{ name: "first-reviewed", sha: first.value },
		{ name: "head", sha: head.value },
	];
	for (const snapshot of snapshots)
		if (!isAncestor(root, base.value, snapshot.sha))
			return fail(
				io,
				1,
				`base ${base.value} is not an ancestor of ${snapshot.name} ${snapshot.sha}`,
			);
	const baseline = totalsBetween(root, base.value, first.value);
	if (!baseline.ok) return fail(io, 1, baseline.error);
	const current = totalsBetween(root, base.value, head.value);
	if (!current.ok) return fail(io, 1, current.error);
	io.out(
		`${growthReport(
			{
				base: base.value,
				firstReviewed: first.value,
				head: head.value,
			},
			baseline.value,
			current.value,
			options.value,
		).join("\n")}\n`,
	);
	return 0;
}

export const command: Command = {
	name: "review-growth",
	summary:
		"Measures how much a branch grew after its first review. It compares git diff statistics from a fixed base to the first reviewed commit and to the head, with no renames. Growth is the added and removed text lines of the head minus those of the first reviewed commit. It warns, and still exits 0, when growth is more than the larger of --max-growth-lines (default 200) and --max-growth-percent (default 50) of the baseline lines. Binary files have no line counts, so it counts them apart and warns when the head holds more of them. Exits 1 when git cannot resolve a commit, when the base is no ancestor of both commits, or when git output is unreadable. Exits 2 for wrong arguments. It reads git only and writes nothing.",
	usage:
		"check review-growth --base <full commit SHA> --first-reviewed <full commit SHA> [--head <ref>] [--max-growth-lines <n>] [--max-growth-percent <n>]",
	run,
};
