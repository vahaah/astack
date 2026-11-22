import { resolve } from "node:path";
import { commitFlags, gitInvocation } from "../../git-command.ts";
import { canonicalRelative, isScratchPath, readOptional } from "../../paths.ts";
import {
	type FileWrite,
	fileWrites,
	type ShellStep,
	shellSteps,
} from "../../shell.ts";
import { checkText, type LineRange, regionLines } from "../../ste/check.ts";
import { commitMessage, commitProse, SUBJECT_LINES } from "../../ste/commit.ts";
import { type Judged, judged, logRun } from "../../ste/events.ts";
import {
	hasHeaderFields,
	isExcluded,
	loadSettings,
	PROSE_FILE,
	type SteSettings,
	settingsRoot,
	settingsRootFrom,
} from "../../ste/profile.ts";
import { ghTargets, mcpTargets, type Target } from "../../ste/targets.ts";
import { outcomeOf, withLedger } from "../../ste/verdict.ts";
import {
	ALLOW,
	type Context,
	defineHandler,
	type EventOf,
	projectDirOf,
} from "../events.ts";

type Checked = { readonly target: Target; readonly settings: SteSettings };

function settingsNear(dir: string, context: Context): SteSettings {
	return loadSettings(settingsRootFrom(dir, projectDirOf(context)));
}

function docTarget(
	path: string,
	before: string | undefined,
	after: string,
	context: Context,
	lines?: {
		readonly after: readonly LineRange[];
		readonly before: readonly LineRange[];
	},
): Checked | undefined {
	if (!PROSE_FILE.test(path)) return undefined;
	const projectDir = projectDirOf(context);
	if (isScratchPath(projectDir, path)) return undefined;
	const root = settingsRoot(path, projectDir);
	const settings = loadSettings(root);
	const relPath = canonicalRelative(root, path);
	if (isExcluded(relPath, settings.profile)) return undefined;
	return {
		settings,
		target: {
			subject: `this write to ${relPath}`,
			text: after,
			surface: "doc",
			enforcement: settings.profile.mode,
			old: before,
			lines: lines?.after,
			oldLines: lines?.before,
			headerFields: hasHeaderFields(relPath, settings.profile),
		},
	};
}

function writeTarget(write: FileWrite, context: Context): readonly Checked[] {
	if (write.target.dynamic) return [];
	const absolute = resolve(write.step.dir, write.target.value);
	const before = readOptional(absolute);
	const after = write.append ? `${before ?? ""}${write.body}` : write.body;
	const checked = docTarget(absolute, before, after, context);
	return checked ? [checked] : [];
}

function commitTargets(step: ShellStep, context: Context): readonly Checked[] {
	const git = gitInvocation(step.values, step.dir);
	if (git?.sub !== "commit" || commitFlags(git.args).dryRun) return [];
	const args = step.words.slice(step.words.length - git.args.length);
	const message = commitMessage(args, step.simple.stdin, git.dir, readOptional);
	if (message.kind !== "static") return [];
	const prose = commitProse(message.text);
	if (prose === undefined) return [];
	return [
		{
			settings: settingsNear(git.dir, context),
			target: {
				subject: "this commit message",
				text: prose,
				surface: "commit",
				enforcement: "deny",
				titleLines: SUBJECT_LINES,
			},
		},
	];
}

function shellTargets(
	command: string,
	cwd: string,
	context: Context,
): readonly Checked[] {
	if (!/\b(?:gh|git|cat|tee|echo|printf)\b/.test(command)) return [];
	const steps = shellSteps(command, cwd);
	const tools = steps.flatMap((step) => {
		switch (step.values[0]) {
			case "gh":
				return ghTargets(step).map((target) => ({
					target,
					settings: settingsNear(step.dir, context),
				}));
			case "git":
				return commitTargets(step, context);
			default:
				return [];
		}
	});
	return [
		...tools,
		...fileWrites(steps).flatMap((write) => writeTarget(write, context)),
	];
}

function judgeTargets(targets: readonly Checked[], context: Context): Judged {
	if (targets.length === 0) return judged(ALLOW);
	return withLedger(context, (skip) =>
		targets.map(({ target, settings }) =>
			outcomeOf(
				target.subject,
				target.surface,
				checkText(target.text, {
					surface: target.surface,
					enforcement: target.enforcement,
					glossary: settings.glossary,
					old: target.old,
					lines: target.lines,
					oldLines: target.oldLines,
					titleLines: target.titleLines,
					headerFields: target.headerFields,
				}).findings,
				skip,
			),
		),
	);
}

function judgeEvent(
	event: EventOf<"write" | "edit" | "shell" | "mcp">,
	context: Context,
): Judged {
	switch (event.kind) {
		case "write": {
			const checked = docTarget(event.path, event.before, event.after, context);
			return judgeTargets(checked ? [checked] : [], context);
		}
		case "edit": {
			const shift = event.newText.length - event.oldText.length;
			const checked = docTarget(
				event.path,
				event.before,
				event.after,
				context,
				{
					after: regionLines(event.after, event.regions),
					before: regionLines(
						event.before,
						event.regions.map((region, index) => {
							const start = region.start - index * shift;
							return { start, end: start + event.oldText.length };
						}),
					),
				},
			);
			return judgeTargets(checked ? [checked] : [], context);
		}
		case "shell":
			return judgeTargets(
				shellTargets(event.command, event.cwd, context),
				context,
			);
		case "mcp": {
			const settings = settingsNear(projectDirOf(context), context);
			return judgeTargets(
				mcpTargets(event.server, event.tool, event.input).map((target) => ({
					target,
					settings,
				})),
				context,
			);
		}
	}
}

export const handler = defineHandler({
	id: "ste-artifact",
	quality: "ste",
	on: ["write", "edit", "shell", "mcp"],
	run: (event, context) =>
		logRun(context, "ste-artifact", event.kind, judgeEvent(event, context)),
});
