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
import { type CommitScope, commitScopes } from "../../git-command.ts";
import { commentPolicy, sectionOf } from "../../profile.ts";
import { type FileWrite, fileWrites, shellSteps } from "../../shell.ts";
import { fingerprint } from "../../ste/check.ts";
import { keptCommentFindings } from "../../ste/comments.ts";
import {
	combineJudged,
	type Judged,
	judged,
	logRun,
	type Observation,
} from "../../ste/events.ts";
import { portSettings, settingsRoot } from "../../ste/profile.ts";
import { outcomeOf, withLedger } from "../../ste/verdict.ts";
import { isTypeSource } from "../../types/check.ts";
import { parseTypePolicy } from "../../types/policy.ts";
import {
	ALLOW,
	type Context,
	defineHandler,
	deny,
	type EventOf,
	note,
	projectDirOf,
} from "../events.ts";

function observationOf(finding: Finding): Observation {
	return {
		check: "comments",
		surface: "comment",
		rule: finding.rule,
		fingerprint: fingerprint(
			finding.rule,
			finding.quote.join(" ").replace(/\s+/g, " ").trim().toLowerCase(),
		),
		shown: finding.verdict === "deny" ? "deny" : "advise",
	};
}

function findingsVerdict(
	findings: readonly Finding[],
	subject: string,
): Judged {
	const observed = findings.map(observationOf);
	const denied = findings.filter((finding) => finding.verdict === "deny");
	if (denied.length > 0)
		return judged(deny(denyMessage(subject, denied)), observed);
	return judged(
		findings.length > 0 ? note(adviceMessage([...findings])) : ALLOW,
		observed,
	);
}

function steCommentVerdict(
	change: SourceChange,
	path: string,
	policy: CommentPolicy,
	context: Context,
): Judged {
	if (context.hooks?.ste === false) return judged(ALLOW);
	const settings = portSettings(
		context.ports,
		settingsRoot(context.ports.files, path, projectDirOf(context)),
	);
	const findings = keptCommentFindings(change, policy, settings.glossary);
	if (!findings || findings.length === 0) return judged(ALLOW);
	return withLedger(context, (skip) => [
		outcomeOf(
			`the kept comments in ${change.relPath}`,
			"comment",
			findings,
			skip,
		),
	]);
}

function fileVerdict(
	path: string,
	before: string | undefined,
	after: string,
	regions: readonly Region[],
	context: Context,
): Judged {
	const projectDir = projectDirOf(context);
	const { files, profile } = context.ports;
	if (files.isScratch(projectDir, path)) return judged(ALLOW);
	const relPath = files.relativePath(projectDir, path);
	if (!isCheckedPath(relPath)) return judged(ALLOW);
	const change = { relPath, before, after, regions: [...regions] };
	const parsed = profile.readProfile(projectDir);
	const policy = commentPolicy(parsed);
	const typeHook =
		context.hooks?.types !== false &&
		isTypeSource(change, parseTypePolicy(sectionOf(parsed, "types")));
	const findings = checkChange(change, policy, typeHook);
	return combineJudged([
		findings ? findingsVerdict(findings, "this edit") : judged(ALLOW),
		steCommentVerdict(change, path, policy, context),
	]);
}

function commitVerdict(scope: CommitScope, context: Context): Judged {
	const { git, profile } = context.ports;
	const changes = git.gitChanges(scope.root, scope.sources);
	if (!changes) return judged(ALLOW);
	const parsed = profile.readProfile(scope.root);
	const policy = commentPolicy(
		parsed,
		profile.readProfile(projectDirOf(context)),
	);
	const types = parseTypePolicy(sectionOf(parsed, "types"));
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

function writeVerdict(write: FileWrite, context: Context): Judged {
	if (write.target.dynamic) return judged(ALLOW);
	const projectDir = projectDirOf(context);
	const { files, profile } = context.ports;
	const absolute = resolve(write.step.dir, write.target.value);
	if (files.isScratch(projectDir, absolute)) return judged(ALLOW);
	const relPath = files.relativePath(projectDir, absolute);
	if (!isCheckedPath(relPath)) return judged(ALLOW);
	const before = files.readText(absolute);
	const after = write.append ? `${before ?? ""}${write.body}` : write.body;
	const start = write.append ? (before ?? "").length : 0;
	const change = {
		relPath,
		before,
		after,
		regions: [{ start, end: after.length }],
	};
	const parsed = profile.readProfile(projectDir);
	const policy = commentPolicy(parsed);
	const typeHook =
		context.hooks?.types !== false &&
		isTypeSource(change, parseTypePolicy(sectionOf(parsed, "types")));
	const findings = checkChange(change, policy, typeHook);
	return combineJudged([
		findings ? findingsVerdict(findings, "this write") : judged(ALLOW),
		steCommentVerdict(change, absolute, policy, context),
	]);
}

function shellVerdict(command: string, cwd: string, context: Context): Judged {
	if (!/\b(?:git|cat|tee|echo|printf)\b/.test(command)) return judged(ALLOW);
	const steps = shellSteps(command, cwd);
	return combineJudged([
		...fileWrites(steps).map((write) => writeVerdict(write, context)),
		...commitScopes(steps, context.ports).map((scope) =>
			commitVerdict(scope, context),
		),
	]);
}

function judgeEvent(
	event: EventOf<"write" | "edit" | "shell">,
	context: Context,
): Judged {
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
}

const ID = "comments";

export const handler = defineHandler({
	id: ID,
	quality: "comments",
	on: ["write", "edit", "shell"],
	run: (event, context) =>
		logRun(context, ID, event.kind, judgeEvent(event, context)),
});
