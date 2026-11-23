import { resolve } from "node:path";
import type { BodyReader } from "../../gh.ts";
import { commitFlags, gitInvocation } from "../../git-command.ts";
import { canonicalRelative, isScratchPath, readOptional } from "../../paths.ts";
import {
	type FileWrite,
	fileWrites,
	type ShellStep,
	shellSteps,
} from "../../shell.ts";
import {
	checkText,
	fingerprint,
	type LineRange,
	regionLines,
} from "../../ste/check.ts";
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
import {
	ghTargets,
	mcpTargets,
	type Target,
	type UnreadBody,
} from "../../ste/targets.ts";
import { outcomeOf, withLedger } from "../../ste/verdict.ts";
import { stagedReader } from "../body-reader.ts";
import {
	ALLOW,
	type Context,
	combine,
	defineHandler,
	type EventOf,
	note,
	projectDirOf,
} from "../events.ts";

type Checked = { readonly target: Target; readonly settings: SteSettings };

type ShellTargets = {
	readonly checked: readonly Checked[];
	readonly unread: readonly UnreadBody[];
};

const NO_SHELL_TARGETS: ShellTargets = { checked: [], unread: [] };

const UNREAD_RULE = "unread-body";

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

function commitTargets(
	step: ShellStep,
	read: BodyReader,
	context: Context,
): ShellTargets {
	const git = gitInvocation(step.values, step.dir);
	if (git?.sub !== "commit" || commitFlags(git.args).dryRun)
		return NO_SHELL_TARGETS;
	const args = step.words.slice(step.words.length - git.args.length);
	const message = commitMessage(args, step.simple.stdin, git.dir, read);
	if (message.kind !== "static") return NO_SHELL_TARGETS;
	const unread = message.unread.map(
		(file): UnreadBody => ({ file, surface: "commit" }),
	);
	const prose = commitProse(message.text);
	if (prose === undefined) return { checked: [], unread };
	return {
		checked: [
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
		],
		unread,
	};
}

function stepTargets(
	steps: readonly ShellStep[],
	at: number,
	context: Context,
): ShellTargets {
	const step = steps[at];
	if (step === undefined) return NO_SHELL_TARGETS;
	const read = stagedReader(steps, at);
	switch (step.values[0]) {
		case "gh": {
			const found = ghTargets(step, read);
			const settings = settingsNear(step.dir, context);
			return {
				checked: found.targets.map((target) => ({ target, settings })),
				unread: found.unread,
			};
		}
		case "git":
			return commitTargets(step, read, context);
		default:
			return NO_SHELL_TARGETS;
	}
}

function shellTargets(
	command: string,
	cwd: string,
	context: Context,
): ShellTargets {
	if (!/\b(?:gh|git|cat|tee|echo|printf)\b/.test(command))
		return NO_SHELL_TARGETS;
	const steps = shellSteps(command, cwd);
	const tools = steps.map((_step, at) => stepTargets(steps, at, context));
	return {
		checked: [
			...tools.flatMap((found) => found.checked),
			...fileWrites(steps).flatMap((write) => writeTarget(write, context)),
		],
		unread: tools.flatMap((found) => found.unread),
	};
}

function unreadNote(body: UnreadBody): string {
	return `could not read ${body.file} as this command leaves it, so astack judged the file on disk. Write the file in an earlier Bash call, or with cat, echo, printf or tee in a step that always runs.`;
}

function withUnread(run: Judged, unread: readonly UnreadBody[]): Judged {
	if (unread.length === 0) return run;
	return {
		verdict: combine(run.verdict, note(unread.map(unreadNote).join("\n"))),
		observed: [
			...run.observed,
			...unread.map((body) => ({
				check: "ste" as const,
				surface: body.surface,
				rule: UNREAD_RULE,
				fingerprint: fingerprint(UNREAD_RULE, body.surface),
				shown: "advise" as const,
			})),
		],
	};
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
		case "shell": {
			const found = shellTargets(event.command, event.cwd, context);
			return withUnread(judgeTargets(found.checked, context), found.unread);
		}
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

const ID = "ste-artifact";

export const handler = defineHandler({
	id: ID,
	quality: "ste",
	on: ["write", "edit", "shell", "mcp"],
	run: (event, context) =>
		logRun(context, ID, event.kind, judgeEvent(event, context)),
});
