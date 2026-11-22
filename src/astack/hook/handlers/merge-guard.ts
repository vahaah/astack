import { resolve } from "node:path";
import { unattendedReason } from "../../attended.ts";
import { readOptional } from "../../paths.ts";
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
import { kindOf } from "../../repo-facts.ts";
import { type ShellStep, shellSteps, type Word } from "../../shell.ts";
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

const GRAPHQL = /graphql/i;
const PERCENT = /%/;

function namesGraphql(value: string): boolean {
	if (GRAPHQL.test(value)) return true;
	if (!PERCENT.test(value)) return false;
	try {
		return GRAPHQL.test(decodeURIComponent(value));
	} catch {
		return true;
	}
}
const MERGE_MUTATION_IN_INPUT =
	/\b(?:mergePullRequest|enablePullRequestAutoMerge|enqueuePullRequest|mergeBranch)\b/;
const MERGE_PATH =
	/\b(?:pulls|merge_requests)\/[^/\s]+\/merge\b|\brepos\/[^/\s]+\/[^/\s]+\/merges\b/;
const METHOD_CHANGING_FLAG =
	/^(?:-(?!-)[\s\S]*[XfF]|--(?:method|field|raw-field|input)(?:=|$))/;
const WRITE_METHOD_IN_TEXT = /(?:\b|-X|_)(?:PUT|POST|PATCH|DELETE)\b/;
const WRITE_METHOD_VALUE =
	/^(?:-X|--method=|HTTP_)?(?:PUT|POST|PATCH|DELETE)$/i;
const JSON_ESCAPE = /\\(?:u[0-9a-fA-F]{4}|["\\/bfnrt])/g;
const GH = /(?:^|\/)gh$/;
const NAMES_PR_MERGE = /\bpr\s+merge\b/;
const MAY_MERGE = /\bgh\b|\bpr\s+merge\b/i;
const REPO_FLAG = /^(?:-R|--repo)$/;
const MAY_TAKE_NEXT_WORD = /^(?:--[^=]*|-[^-=])$/;
const PR_MERGE = ["pr", "merge"];

type GhMerge = {
	readonly kind: "merge";
	readonly args: readonly Word[];
	readonly setsEnv: boolean;
};

type MergeCommand =
	| { readonly kind: "none" | "api" | "endpoint" | "unreadable" }
	| GhMerge;

const NONE: MergeCommand = { kind: "none" };
const UNREADABLE: MergeCommand = { kind: "unreadable" };
const API: MergeCommand = { kind: "api" };

type ReadFile = (path: string) => string | undefined;

const READS_NO_FILE: ReadFile = () => undefined;

type GraphqlInput = {
	readonly kind: "field" | "typed" | "input";
	readonly word: Word;
};

const API_SHORT_VALUES = "XfFHpqt";
const API_LONG_VALUES = [
	"--cache",
	"--header",
	"--hostname",
	"--jq",
	"--method",
	"--preview",
	"--template",
];
const INPUT_FLAG = /^--(input|field|raw-field)(?:=([\s\S]*))?$/;

function shortInput(letter: string, word: Word): GraphqlInput | undefined {
	if (letter === "f") return { kind: "field", word };
	if (letter === "F") return { kind: "typed", word };
	return undefined;
}

type ApiParts = {
	readonly endpoint: Word | undefined;
	readonly inputs: readonly GraphqlInput[];
};

function apiParts(args: readonly Word[]): ApiParts {
	const inputs: GraphqlInput[] = [];
	let endpoint: Word | undefined;
	for (let index = 1; index < args.length; index++) {
		const word = args[index];
		if (word === undefined) continue;
		if (!word.value.startsWith("-")) {
			endpoint ??= word;
			continue;
		}
		const attached = (value: string): Word => ({
			value,
			dynamic: word.dynamic,
		});
		const long = INPUT_FLAG.exec(word.value);
		if (long) {
			const value = long[2] === undefined ? args[++index] : attached(long[2]);
			const kind =
				long[1] === "input" ? "input" : long[1] === "field" ? "typed" : "field";
			if (value) inputs.push({ kind, word: value });
		} else if (API_LONG_VALUES.includes(word.value)) index++;
		else if (/^-[A-Za-z]/.test(word.value)) {
			const at = [...word.value.slice(1)].findIndex((letter) =>
				API_SHORT_VALUES.includes(letter),
			);
			if (at < 0) continue;
			const rest = word.value.slice(at + 2);
			const value = rest === "" ? args[++index] : attached(rest);
			const input = value && shortInput(word.value.charAt(at + 1), value);
			if (input) inputs.push(input);
		}
	}
	return { endpoint, inputs };
}

function inputText(
	input: GraphqlInput,
	step: ShellStep,
	readFile: ReadFile,
): string | undefined {
	const { kind, word } = input;
	if (word.dynamic) return undefined;
	if (kind === "field") return word.value;
	const value = word.value.slice(word.value.indexOf("=") + 1);
	const path =
		kind === "input"
			? word.value
			: value.startsWith("@")
				? value.slice(1)
				: undefined;
	if (path === undefined) return word.value;
	const text = path === "-" ? step.simple.stdin : readFile(path);
	return kind === "input" && text !== undefined ? decodedEscapes(text) : text;
}

function apiCall(
	step: ShellStep,
	args: readonly Word[],
	readFile: ReadFile,
): MergeCommand {
	const values = args.map((word) => word.value);
	if (values[0] !== "api") return NONE;
	if (values.some((value) => MERGE_MUTATION_IN_INPUT.test(value))) return API;
	const writes = values.some((value) => METHOD_CHANGING_FLAG.test(value));
	if (writes && values.some((value) => MERGE_PATH.test(value))) return API;
	const { endpoint, inputs } = apiParts(args);
	const mergesThroughGraphql =
		values.some(namesGraphql) &&
		inputs.some((input) => {
			const text = inputText(input, step, readFile);
			return text === undefined || MERGE_MUTATION_IN_INPUT.test(text);
		});
	if (mergesThroughGraphql) return API;
	return writes && endpoint?.dynamic === true ? { kind: "endpoint" } : NONE;
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

function fileReader(step: ShellStep): ReadFile {
	return (path) => {
		const file = resolve(step.dir, path);
		return kindOf(file) === "file" ? readOptional(file) : undefined;
	};
}

function mergeCommand(step: ShellStep, readFile: ReadFile): MergeCommand {
	if (step.unreadable !== undefined && step.unreadable !== "folder")
		return UNREADABLE;
	const [program, ...args] = step.words;
	if (program === undefined || !GH.test(program.value)) return NONE;
	const api = apiCall(step, args, readFile);
	if (api.kind !== "none") return api;
	return prMerge(args, step.env.length > 0 || step.unsetsEnv);
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

function mayMerge(step: ShellStep, source: string): boolean {
	return (
		NAMES_PR_MERGE.test(source) ||
		[...step.values, ...(step.simple.substitutions ?? [])].some((value) =>
			hasMergeWord(nameTokens(value)),
		)
	);
}

function examinesMerge(
	step: ShellStep,
	source: string,
	readFile: ReadFile,
): boolean {
	const merge = mergeCommand(step, readFile);
	switch (merge.kind) {
		case "none":
			return false;
		case "unreadable":
			return mayMerge(step, source);
		case "api":
		case "endpoint":
		case "merge":
			return true;
	}
}

function stepVerdict(
	step: ShellStep,
	source: string,
	chained: boolean,
	context: Context,
	read: ReadPullRequest,
): Verdict {
	const merge = mergeCommand(step, fileReader(step));
	switch (merge.kind) {
		case "none":
			return ALLOW;
		case "api":
			return deny(
				mergeDenial([
					"Merge with gh pr merge, so astack can examine the PR first.",
				]),
			);
		case "endpoint":
			return deny(
				mergeDenial([
					"astack cannot read the endpoint of this gh api call, because a variable gives it. Write the endpoint with static words. Merge a PR with gh pr merge.",
				]),
			);
		case "unreadable":
			return mayMerge(step, source)
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
	if (!MAY_MERGE.test(event.command)) return ALLOW;
	const steps = shellSteps(event.command, event.cwd);
	const chained = steps.length > 1;
	return combineAll(
		steps.map((step) =>
			stepVerdict(step, event.command, chained, context, read),
		),
	);
}

const MERGE_STEM = "merg";
const MERGE_STATE = /merge(?:d|able|ability)$/;
const MERGE_REQUEST = /^requests?$/;
const CLICK_VERBS = new Set(["click", "press", "tap"]);
const READ_VERBS = new Set([
	"check",
	"find",
	"get",
	"list",
	"read",
	"search",
	"show",
	"view",
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

function isMergeWord(token: string, next: string | undefined): boolean {
	if (token === "merge" && MERGE_REQUEST.test(next ?? "")) return false;
	return token.includes(MERGE_STEM) && !MERGE_STATE.test(token);
}

function hasMergeWord(tokens: readonly string[]): boolean {
	return tokens.some((token, index) => isMergeWord(token, tokens[index + 1]));
}

function isMcpMergeTool({ server, tool }: EventOf<"mcp">): boolean {
	const tokens = [server, tool].flatMap(nameTokens);
	const onlyReads =
		tokens.some((token) => READ_VERBS.has(token)) &&
		!tokens.some((token) => WRITE_VERBS.has(token)) &&
		!hasMergeWord(tokens);
	return tokens.some((token) => token.includes(MERGE_STEM)) && !onlyReads;
}

function inputStrings(value: unknown): readonly string[] {
	if (typeof value === "string") return [value];
	if (Array.isArray(value)) {
		const items = value.flatMap(inputStrings);
		return [...items, items.join("/")];
	}
	if (typeof value === "object" && value !== null)
		return Object.entries(value).flatMap(([key, item]) => [
			key,
			...inputStrings(item),
		]);
	return value === undefined || value === null ? [] : [String(value)];
}

function decodedEscapes(text: string): string {
	return text.replace(JSON_ESCAPE, (sequence) =>
		String(JSON.parse(`"${sequence}"`)),
	);
}

function runsGhMerge(value: string): boolean {
	return (
		MAY_MERGE.test(value) &&
		shellSteps(value, "").some((step) =>
			examinesMerge(step, value, READS_NO_FILE),
		)
	);
}

function quotedWord(item: string): string {
	return `'${item.replaceAll("'", "'\\''")}'`;
}

function ghCommands(value: unknown): readonly string[] {
	if (Array.isArray(value)) {
		const items = value.filter(
			(item): item is string => typeof item === "string",
		);
		const words = GH.test(items[0] ?? "") ? items : ["gh", ...items];
		return [
			words.join(" "),
			words.map(quotedWord).join(" "),
			...value.flatMap(ghCommands),
		];
	}
	return typeof value === "object" && value !== null
		? Object.values(value).flatMap(ghCommands)
		: [];
}

function holdsMerge(input: unknown): boolean {
	const values = inputStrings(input).map(decodedEscapes);
	const text = values.join("\n");
	return (
		[...values, ...ghCommands(input)].some(runsGhMerge) ||
		MERGE_MUTATION_IN_INPUT.test(text) ||
		(MERGE_PATH.test(text) &&
			(WRITE_METHOD_IN_TEXT.test(text) ||
				values.some((value) => WRITE_METHOD_VALUE.test(value.trim()))))
	);
}

function clicksMerge({ server, tool, input }: EventOf<"mcp">): boolean {
	return (
		[server, tool]
			.flatMap(nameTokens)
			.some((token) => CLICK_VERBS.has(token)) &&
		inputStrings(input).some((value) => hasMergeWord(nameTokens(value)))
	);
}

function isMcpMerge(event: EventOf<"mcp">): boolean {
	return isMcpMergeTool(event) || holdsMerge(event.input) || clicksMerge(event);
}

function mcpVerdict(event: EventOf<"mcp">): Verdict {
	if (!isMcpMerge(event)) return ALLOW;
	return deny(
		mergeDenial([
			"astack cannot examine a merge through an MCP tool. Merge a PR with gh pr merge in a Bash call, or ask the owner.",
		]),
	);
}

function failedVerdict(
	event: EventOf<"prompt" | "shell" | "mcp">,
	error: unknown,
): Verdict | undefined {
	const merges =
		(event.kind === "shell" &&
			shellSteps(event.command, event.cwd).some((step) =>
				examinesMerge(step, event.command, fileReader(step)),
			)) ||
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
