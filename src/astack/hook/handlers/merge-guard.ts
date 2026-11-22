import { unattendedReason } from "../../attended.ts";
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
	type Verdict,
} from "../events.ts";

const API_MERGE = /(?:^|\/)pulls\/\d+\/merge$/;
const PR_MERGE_MUTATION = /\bmergePullRequest\b/;
const AUTO_MERGE_MUTATION = /\benablePullRequestAutoMerge\b/;
const MERGE_PATH_IN_INPUT = /\bpulls\/\d+\/merge\b/;
const WRITE_METHOD_IN_INPUT = /\b(?:PUT|POST|PATCH|DELETE)\b/i;
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
	if (args.some((value) => PR_MERGE_MUTATION.test(value))) return true;
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
	const inputs = {
		call,
		chained,
		setsEnv: merge.setsEnv,
		grant: loadGrant(context.env, context.session),
		unattendedReason: unattendedReason(context.env),
	};
	const preflight = preflightReasons(inputs);
	if (preflight.length > 0) return deny(mergeDenial(preflight));
	const reasons = stateReasons(
		inputs,
		read({ selector: call.selector, repo: call.repo, dir: step.dir }),
	);
	return reasons.length > 0 ? deny(mergeDenial(reasons)) : ALLOW;
}

function holdsMergeWord(step: ShellStep): boolean {
	return step.values.some((value) => value.includes("merge"));
}

function examinesMerge(step: ShellStep): boolean {
	const merge = mergeCommand(step);
	switch (merge.kind) {
		case "none":
			return false;
		case "unreadable":
			return holdsMergeWord(step);
		case "api":
		case "merge":
			return true;
	}
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
			return holdsMergeWord(step)
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

const MERGE_STEM = "merg";
const MERGE_STATE = /merge(?:d|able|ability)$/;
const READ_ONLY_TOOLS = new Set([
	"get_merge_request",
	"list_merge_requests",
	"list_merge_request_comments",
]);
const WRITE_VERBS = new Set([
	"accept",
	"add",
	"apply",
	"approve",
	"close",
	"commit",
	"complete",
	"create",
	"delete",
	"disable",
	"do",
	"edit",
	"enable",
	"execute",
	"finish",
	"land",
	"mark",
	"modify",
	"patch",
	"perform",
	"post",
	"push",
	"put",
	"queue",
	"rebase",
	"remove",
	"resolve",
	"run",
	"save",
	"schedule",
	"send",
	"set",
	"ship",
	"squash",
	"start",
	"submit",
	"toggle",
	"trigger",
	"update",
	"upsert",
	"write",
]);

function nameTokens(name: string): readonly string[] {
	return name
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
		.replace(/(?<=[A-Za-z])(?=\d)|(?<=\d)(?=[A-Za-z])/g, " ")
		.split(/[\s._-]+/)
		.filter((token) => token !== "")
		.map((token) => token.toLowerCase());
}

function isMergeWord(token: string): boolean {
	return token.includes(MERGE_STEM) && !MERGE_STATE.test(token);
}

function isMcpMergeTool(tool: string): boolean {
	const tokens = nameTokens(tool);
	return (
		tokens.some((token) => token.includes(MERGE_STEM)) &&
		!READ_ONLY_TOOLS.has(tool) &&
		tokens.some((token) => WRITE_VERBS.has(token) || isMergeWord(token))
	);
}

function holdsApiMerge(input: unknown): boolean {
	const text = JSON.stringify(input ?? null);
	return (
		PR_MERGE_MUTATION.test(text) ||
		AUTO_MERGE_MUTATION.test(text) ||
		(MERGE_PATH_IN_INPUT.test(text) && WRITE_METHOD_IN_INPUT.test(text))
	);
}

function isMcpMerge(event: EventOf<"mcp">): boolean {
	return isMcpMergeTool(event.tool) || holdsApiMerge(event.input);
}

function mcpVerdict(event: EventOf<"mcp">): Verdict {
	if (!isMcpMerge(event)) return ALLOW;
	return deny(
		mergeDenial([
			"astack cannot examine a merge through an MCP tool. Merge a PR with gh pr merge, or ask the owner.",
		]),
	);
}

function failedVerdict(
	event: EventOf<"prompt" | "shell" | "mcp">,
	error: unknown,
): Verdict | undefined {
	const merges =
		(event.kind === "shell" &&
			shellSteps(event.command, event.cwd).some(examinesMerge)) ||
		(event.kind === "mcp" && isMcpMerge(event));
	if (!merges) return undefined;
	const cause = error instanceof Error ? error.message : String(error);
	return deny(
		mergeDenial([
			`The merge guard failed with "${cause}", so astack cannot examine this merge. Ask the owner, or let the owner merge.`,
		]),
	);
}

export function mergeGuard(read: ReadPullRequest): Handler {
	return defineHandler({
		id: "merge-guard",
		on: ["prompt", "shell", "mcp"],
		failed: failedVerdict,
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
