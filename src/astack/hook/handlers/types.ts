import { resolve } from "node:path";
import { commitScopes } from "../../git-command.ts";
import { sectionOf } from "../../profile.ts";
import { fileWrites, shellSteps } from "../../shell.ts";
import {
	checkTypes,
	denies,
	type FileReport,
	isTypeSource,
	type TypeChange,
} from "../../types/check.ts";
import { typeAdviceMessage, typeDenyMessage } from "../../types/messages.ts";
import { parseTypePolicy, type TypePolicy } from "../../types/policy.ts";
import {
	ALLOW,
	type Context,
	defineHandler,
	deny,
	note,
	projectDirOf,
	type Verdict,
} from "../events.ts";

function policyAt(context: Context, dir: string): TypePolicy {
	return parseTypePolicy(
		sectionOf(context.ports.profile.readProfile(dir), "types"),
	);
}

function reportOf(
	change: TypeChange,
	policy: TypePolicy,
): FileReport | undefined {
	if (!isTypeSource(change, policy)) return undefined;
	const report = checkTypes(change, policy);
	return report && report.rises.length > 0 ? report : undefined;
}

function reportsVerdict(
	reports: readonly FileReport[],
	subject: string,
): Verdict {
	if (reports.length === 0) return ALLOW;
	if (reports.some(denies)) return deny(typeDenyMessage(subject, reports));
	return note(typeAdviceMessage(reports));
}

function fileVerdict(
	path: string,
	before: string | undefined,
	after: string,
	subject: string,
	context: Context,
): Verdict {
	const projectDir = projectDirOf(context);
	const { files } = context.ports;
	if (files.isScratch(projectDir, path)) return ALLOW;
	const report = reportOf(
		{ relPath: files.relativePath(projectDir, path), before, after },
		policyAt(context, projectDir),
	);
	return reportsVerdict(report ? [report] : [], subject);
}

function shellVerdict(command: string, cwd: string, context: Context): Verdict {
	if (!/\b(?:git|cat|tee|echo|printf)\b/.test(command)) return ALLOW;
	const steps = shellSteps(command, cwd);
	const projectDir = projectDirOf(context);
	const { files, git } = context.ports;
	const policy = policyAt(context, projectDir);
	const writes = fileWrites(steps).flatMap((write) => {
		if (write.target.dynamic) return [];
		const path = resolve(write.step.dir, write.target.value);
		if (files.isScratch(projectDir, path)) return [];
		const before = files.readText(path);
		const after = write.append ? `${before ?? ""}${write.body}` : write.body;
		const report = reportOf(
			{ relPath: files.relativePath(projectDir, path), before, after },
			policy,
		);
		return report ? [report] : [];
	});
	const commits = commitScopes(steps, context.ports).flatMap((scope) => {
		const changes = git.gitChanges(scope.root, scope.sources) ?? [];
		const rootPolicy = policyAt(context, scope.root);
		return changes.flatMap((change) => {
			const report = reportOf(
				{ relPath: change.path, before: change.before, after: change.after },
				rootPolicy,
			);
			return report ? [report] : [];
		});
	});
	return reportsVerdict(
		[...writes, ...commits],
		commits.length > 0 ? "this commit" : "this write",
	);
}

export const handler = defineHandler({
	id: "types",
	quality: "types",
	on: ["write", "edit", "shell"],
	run: (event, context) => {
		switch (event.kind) {
			case "write":
			case "edit":
				return fileVerdict(
					event.path,
					event.before,
					event.after,
					event.kind === "write" ? "this write" : "this edit",
					context,
				);
			case "shell":
				return shellVerdict(event.command, event.cwd, context);
		}
	},
});
