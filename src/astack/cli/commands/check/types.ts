import { type ChangeSources, gitChanges, repoRoot } from "../../../git.ts";
import {
	checkTypes,
	denies,
	type FileReport,
	isTypeSource,
} from "../../../types/check.ts";
import { LABELS } from "../../../types/messages.ts";
import { typePolicy } from "../../../types/policy.ts";
import { valueAfter } from "../../args.ts";
import type { Command } from "../../command.ts";
import { type Io, usageError } from "../../io.ts";

function sourcesFor(args: readonly string[]): ChangeSources | string {
	const base = valueAfter(args, "--base");
	if (base === null) return "--base needs a ref";
	if (base !== undefined) return { base };
	return args.includes("--staged")
		? { staged: true }
		: { staged: true, worktree: "all", untracked: "all" };
}

function printReports(io: Io, reports: readonly FileReport[]): void {
	for (const report of reports)
		for (const rise of report.rises) {
			const head = `${report.relPath}: ${rise.severity} ${LABELS[rise.kind]}, ${rise.after} now and ${rise.before} before`;
			io.out(`${head}\n`);
			for (const found of rise.found)
				io.out(`${report.relPath}:${found.line}: ${found.quote}\n`);
		}
}

function run(args: readonly string[], io: Io): number {
	const sources = sourcesFor(args);
	if (typeof sources === "string")
		return usageError(io, `astack check-types: ${sources}`);
	const root = repoRoot(io.cwd);
	if (!root)
		return usageError(io, "astack check-types: not inside a git repository");
	const changes = gitChanges(root, sources);
	if (!changes) return usageError(io, "astack check-types: git diff failed");
	const policy = typePolicy(root);
	const reports: FileReport[] = [];
	const skipped: string[] = [];
	let checked = 0;
	for (const change of changes) {
		const typed = {
			relPath: change.path,
			before: change.before,
			after: change.after,
		};
		if (!isTypeSource(typed, policy)) continue;
		checked++;
		const report = checkTypes(typed, policy);
		if (!report) skipped.push(change.path);
		else if (report.rises.length > 0) reports.push(report);
	}
	const denied = reports.filter(denies);
	if (args.includes("--json")) {
		io.out(`${JSON.stringify({ reports, skipped }, null, 2)}\n`);
	} else {
		printReports(io, reports);
		for (const path of skipped)
			io.err(`${path}: skipped, could not tokenize\n`);
		io.out(
			`${denied.length} files denied, ${reports.length - denied.length} with advice only, ${checked} files checked\n`,
		);
	}
	return denied.length > 0 ? 1 : 0;
}

export const command: Command = {
	name: "types",
	summary:
		"Compares the count of each unsafe type pattern before and after the change: the working tree, the staged changes, or HEAD against the merge base of <ref>. Exits 1 when the count of any, unsafe casts, non-null assertions or compiler suppressions rises in a file.",
	usage: "check types [--staged | --base <ref>] [--json]",
	run,
};
