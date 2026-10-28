import { originSlug, repoRoot } from "../../git.ts";
import {
	type ReadPullRequest,
	readPullRequestWithGh,
} from "../../pr/github.ts";
import { loadGrant, mergeGrantIn, saveGrant } from "../../pr/grant.ts";
import {
	mergeDenial,
	parseMergeCall,
	preflightReasons,
	stateReasons,
} from "../../pr/merge.ts";
import { loadPrProfile } from "../../pr/profile.ts";
import {
	ENV_ASSIGNMENT,
	type ShellStep,
	shellSteps,
	type Word,
} from "../../shell.ts";
import {
	ALLOW,
	type Context,
	combineAll,
	defineHandler,
	deny,
	type EventOf,
	type Handler,
	projectDirOf,
	type Verdict,
} from "../events.ts";

const API_MERGE = /(?:^|\/)pulls\/\d+\/merge$/;
const WRAPPER = /(?:^|\/)(env|command)$/;
const GH = /(?:^|\/)gh$/;
const REPO_FLAG = /^(?:-R|--repo)$/;
const MAY_TAKE_NEXT_WORD = /^(?:--[^=]*|-[^-=])$/;
const PR_MERGE = ["pr", "merge"];

type GhMerge = {
	readonly kind: "merge";
	readonly args: readonly Word[];
	readonly setsEnv: boolean;
};

type MergeCommand = { readonly kind: "none" | "api" | "unreadable" } | GhMerge;

const NONE: MergeCommand = { kind: "none" };
const UNREADABLE: MergeCommand = { kind: "unreadable" };

function apiMethod(values: readonly string[]): string | undefined {
	for (let index = 0; index < values.length; index++) {
		const value = values[index] ?? "";
		if (value === "-X" || value === "--method") return values[index + 1];
		const joined = /^(?:-X|--method=)(\w+)$/.exec(value);
		if (joined) return joined[1];
	}
	return undefined;
}

function isApiMerge(args: readonly string[]): boolean {
	if (args[0] !== "api") return false;
	if (args.some((value) => /\bmergePullRequest\b/.test(value))) return true;
	return (
		apiMethod(args)?.toUpperCase() === "PUT" &&
		args.some((value) => API_MERGE.test(value))
	);
}

function prMerge(args: readonly Word[], setsEnv: boolean): MergeCommand {
	const flags: Word[] = [];
	let found = 0;
	for (let index = 0; index < args.length; index++) {
		const word = args[index];
		if (!word) continue;
		if (word.dynamic) return UNREADABLE;
		if (!word.value.startsWith("-")) {
			if (word.value !== PR_MERGE[found]) return NONE;
			found++;
			if (found === PR_MERGE.length)
				return {
					kind: "merge",
					args: [...flags, ...args.slice(index + 1)],
					setsEnv,
				};
		} else if (REPO_FLAG.test(word.value)) {
			flags.push(...args.slice(index, index + 2));
			index++;
		} else if (MAY_TAKE_NEXT_WORD.test(word.value)) return UNREADABLE;
		else flags.push(word);
	}
	return NONE;
}

function mergeCommand(step: ShellStep): MergeCommand {
	let words = step.words;
	let setsEnv = words.length < step.simple.words.length;
	let wrapper = WRAPPER.exec(words[0]?.value ?? "")?.[1];
	while (wrapper !== undefined) {
		words = words.slice(1);
		while (wrapper === "env" && ENV_ASSIGNMENT.test(words[0]?.value ?? "")) {
			setsEnv = true;
			words = words.slice(1);
		}
		const next = words[0];
		if (next?.dynamic || next?.value.startsWith("-")) return UNREADABLE;
		wrapper = WRAPPER.exec(next?.value ?? "")?.[1];
	}
	const [program, ...args] = words;
	if (program === undefined || !GH.test(program.value)) return NONE;
	if (isApiMerge(args.map((word) => word.value))) return { kind: "api" };
	return prMerge(args, setsEnv);
}

function mergeVerdict(
	step: ShellStep,
	merge: GhMerge,
	chained: boolean,
	context: Context,
	read: ReadPullRequest,
): Verdict {
	const call = parseMergeCall(step.simple, merge.args, step.dir);
	if (call.disableAuto) return ALLOW;
	const root = repoRoot(step.dir);
	const inputs = {
		call,
		chained,
		setsEnv: merge.setsEnv,
		profile: loadPrProfile(root ?? projectDirOf(context)),
		profileRepo: root === undefined ? undefined : originSlug(root),
		grant: loadGrant(context.env, context.session),
	};
	const preflight = preflightReasons(inputs);
	if (preflight.length > 0) return deny(mergeDenial(preflight));
	const reasons = stateReasons(
		inputs,
		read({ selector: call.selector, repo: call.repo, dir: step.dir }),
	);
	return reasons.length > 0 ? deny(mergeDenial(reasons)) : ALLOW;
}

function stepVerdict(
	step: ShellStep,
	chained: boolean,
	context: Context,
	read: ReadPullRequest,
): Verdict {
	const merge = mergeCommand(step);
	switch (merge.kind) {
		case "none":
			return ALLOW;
		case "api":
			return deny(
				mergeDenial([
					"Merge with gh pr merge, so astack can examine the PR first.",
				]),
			);
		case "unreadable":
			return step.values.some((value) => value.includes("merge"))
				? deny(
						mergeDenial([
							"astack cannot read this merge command. Run gh pr merge <number> as its own Bash call.",
						]),
					)
				: ALLOW;
		case "merge":
			return mergeVerdict(step, merge, chained, context, read);
	}
}

function shellVerdict(
	event: EventOf<"shell">,
	context: Context,
	read: ReadPullRequest,
): Verdict {
	if (!/\bgh\b/.test(event.command)) return ALLOW;
	const steps = shellSteps(event.command, event.cwd);
	const chained = steps.length > 1;
	return combineAll(
		steps.map((step) => stepVerdict(step, chained, context, read)),
	);
}

const MCP_MERGE = /^(?:merge_pull_request|merge_pr)$/;

function mcpVerdict(event: EventOf<"mcp">): Verdict {
	if (!/github/i.test(event.server) || !MCP_MERGE.test(event.tool))
		return ALLOW;
	return deny(
		mergeDenial([
			"Merge with gh pr merge, so astack can examine the PR first.",
		]),
	);
}

export function mergeGuard(read: ReadPullRequest): Handler {
	return defineHandler({
		id: "merge-guard",
		on: ["prompt", "shell", "mcp"],
		run: (event, context) => {
			switch (event.kind) {
				case "prompt":
					if (event.human && event.session)
						saveGrant(context.env, event.session, mergeGrantIn(event.text));
					return ALLOW;
				case "shell":
					return shellVerdict(event, context, read);
				case "mcp":
					return mcpVerdict(event);
			}
		},
	});
}

export const handler = mergeGuard(readPullRequestWithGh);
