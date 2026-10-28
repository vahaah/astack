import { resolve } from "node:path";
import type { Region } from "../../comments/added.ts";
import {
	adviceMessage,
	checkChange,
	denyMessage,
	type Finding,
	isCheckedPath,
	type SourceChange,
} from "../../comments/check.ts";
import type { CommentPolicy } from "../../comments/classify.ts";
import { gitChanges } from "../../git.ts";
import { type CommitScope, commitScopes } from "../../git-command.ts";
import { canonicalRelative, readOptional } from "../../paths.ts";
import { commentPolicy } from "../../profile.ts";
import { type FileWrite, fileWrites, shellSteps } from "../../shell.ts";
import { keptCommentFindings } from "../../ste/comments.ts";
import { loadSettings, settingsRoot } from "../../ste/profile.ts";
import { outcomeOf, withLedger } from "../../ste/verdict.ts";
import { isTypeSource } from "../../types/check.ts";
import { typePolicy } from "../../types/policy.ts";
import {
	ALLOW,
	type Context,
	combine,
	combineAll,
	defineHandler,
	deny,
	note,
	projectDirOf,
	type Verdict,
} from "../events.ts";

function findingsVerdict(
	findings: readonly Finding[],
	subject: string,
): Verdict {
	const denied = findings.filter((finding) => finding.verdict === "deny");
	if (denied.length > 0) return deny(denyMessage(subject, denied));
	return findings.length > 0 ? note(adviceMessage([...findings])) : ALLOW;
}

function steCommentVerdict(
	change: SourceChange,
	path: string,
	policy: CommentPolicy,
	context: Context,
): Verdict {
	if (context.hooks?.ste === false) return ALLOW;
	const settings = loadSettings(settingsRoot(path, projectDirOf(context)));
	const findings = keptCommentFindings(change, policy, settings.glossary);
	if (!findings || findings.length === 0) return ALLOW;
	return withLedger(context, (skip) => [
		outcomeOf(`the kept comments in ${change.relPath}`, findings, skip),
	]);
}

function fileVerdict(
	path: string,
	before: string | undefined,
	after: string,
	regions: readonly Region[],
	context: Context,
): Verdict {
	const projectDir = projectDirOf(context);
	const relPath = canonicalRelative(projectDir, path);
	if (!isCheckedPath(relPath)) return ALLOW;
	const change = { relPath, before, after, regions: [...regions] };
	const policy = commentPolicy(projectDir);
	const typeHook =
		context.hooks?.types !== false &&
		isTypeSource(change, typePolicy(projectDir));
	const findings = checkChange(change, policy, typeHook);
	return combine(
		findings ? findingsVerdict(findings, "this edit") : ALLOW,
		steCommentVerdict(change, path, policy, context),
	);
}

function commitVerdict(scope: CommitScope, context: Context): Verdict {
	const projectDir = projectDirOf(context);
	const changes = gitChanges(scope.root, scope.sources);
	if (!changes) return ALLOW;
	const policy = commentPolicy(scope.root, projectDir);
	const types = typePolicy(scope.root);
	const findings: Finding[] = [];
	for (const change of changes) {
		const typed = {
			relPath: change.path,
			before: change.before,
			after: change.after,
		};
		const result = checkChange(
			{ ...typed, addedLines: change.added },
			policy,
			context.hooks?.types !== false && isTypeSource(typed, types),
		);
		if (result) findings.push(...result);
	}
	return findingsVerdict(findings, "this commit");
}

function writeVerdict(write: FileWrite, context: Context): Verdict {
	if (write.target.dynamic) return ALLOW;
	const projectDir = projectDirOf(context);
	const absolute = resolve(write.step.dir, write.target.value);
	const relPath = canonicalRelative(projectDir, absolute);
	if (!isCheckedPath(relPath)) return ALLOW;
	const before = readOptional(absolute);
	const after = write.append ? `${before ?? ""}${write.body}` : write.body;
	const start = write.append ? (before ?? "").length : 0;
	const change = {
		relPath,
		before,
		after,
		regions: [{ start, end: after.length }],
	};
	const policy = commentPolicy(projectDir);
	const typeHook =
		context.hooks?.types !== false &&
		isTypeSource(change, typePolicy(projectDir));
	const findings = checkChange(change, policy, typeHook);
	return combine(
		findings ? findingsVerdict(findings, "this write") : ALLOW,
		steCommentVerdict(change, absolute, policy, context),
	);
}

function shellVerdict(command: string, cwd: string, context: Context): Verdict {
	if (!/\b(?:git|cat|tee|echo|printf)\b/.test(command)) return ALLOW;
	const steps = shellSteps(command, cwd);
	return combineAll([
		...fileWrites(steps).map((write) => writeVerdict(write, context)),
		...commitScopes(steps).map((scope) => commitVerdict(scope, context)),
	]);
}

export const handler = defineHandler({
	id: "comments",
	quality: "comments",
	on: ["write", "edit", "shell"],
	run: (event, context) => {
		switch (event.kind) {
			case "write":
				return fileVerdict(
					event.path,
					event.before,
					event.after,
					[{ start: 0, end: event.after.length }],
					context,
				);
			case "edit":
				return fileVerdict(
					event.path,
					event.before,
					event.after,
					event.regions,
					context,
				);
			case "shell":
				return shellVerdict(event.command, event.cwd, context);
		}
	},
});
