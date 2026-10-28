import { checkChange, type Finding } from "../../../comments/check.ts";
import { type ChangeSources, gitChanges, repoRoot } from "../../../git.ts";
import { commentPolicy } from "../../../profile.ts";
import type { Command } from "../../command.ts";
import { type Io, usageError } from "../../io.ts";

const RULE_NAMES: Record<string, string> = {
	narration: "narration",
	provenance: "provenance tag",
	"file-line": "file:line reference",
	"own-path": "own path",
	banner: "banner",
	"commented-out-code": "commented-out code",
	restating: "restates the code",
	suppression: "suppression",
	"long-comment": "too long",
	todo: "todo",
	marker: "marker",
	judge: "needs a reason",
};

function run(args: readonly string[], io: Io): number {
	const json = args.includes("--json");
	const baseIndex = args.indexOf("--base");
	const base = baseIndex >= 0 ? args[baseIndex + 1] : undefined;
	if (baseIndex >= 0 && !base)
		return usageError(io, "astack check-comments: --base needs a ref");
	const root = repoRoot(io.cwd);
	if (!root)
		return usageError(io, "astack check-comments: not inside a git repository");
	const sources: ChangeSources = base
		? { base }
		: args.includes("--staged")
			? { staged: true }
			: { staged: true, worktree: "all", untracked: "all" };
	const changes = gitChanges(root, sources);
	if (!changes) return usageError(io, "astack check-comments: git diff failed");
	const policy = commentPolicy(root);
	const findings: Finding[] = [];
	const skipped: string[] = [];
	for (const change of changes) {
		const result = checkChange(
			{
				relPath: change.path,
				before: change.before,
				after: change.after,
				addedLines: change.added,
			},
			policy,
		);
		if (result) findings.push(...result);
		else skipped.push(change.path);
	}
	const denied = findings.filter((finding) => finding.verdict === "deny");
	if (json) {
		io.out(`${JSON.stringify({ findings, skipped }, null, 2)}\n`);
	} else {
		for (const finding of findings) {
			const quote = finding.quote.join(" ").replace(/\s+/g, " ").trim();
			const size = finding.size
				? ` (${finding.size.lines} lines, limit ${finding.size.limit})`
				: "";
			io.out(
				`${finding.path}:${finding.line}: ${finding.verdict} ${RULE_NAMES[finding.rule] ?? finding.rule}${size}: ${quote}\n`,
			);
		}
		for (const path of skipped)
			io.err(`${path}: skipped, could not tokenize\n`);
		io.out(
			`${denied.length} denied, ${findings.length - denied.length} to judge, ${changes.length} files checked\n`,
		);
	}
	return denied.length > 0 ? 1 : 0;
}

export const command: Command = {
	name: "comments",
	summary:
		"Compares the working tree, the staged changes or HEAD against the merge base of <ref>. Exits 1 when an added comment is in a class that no keep rule covers.",
	usage: "check comments [--staged | --base <ref>] [--json]",
	run,
};
