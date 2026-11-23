import { resolve } from "node:path";
import { ghRepoPrefix, inputString } from "./gh.ts";
import type { Env } from "./hook/events.ts";
import {
	pipeStageText,
	type ShellStep,
	shellSteps,
	type Word,
} from "./shell.ts";

export type OutboundTarget =
	| { readonly kind: "named"; readonly slug: string }
	| { readonly kind: "remotes"; readonly dir: string }
	| { readonly kind: "unknown" };

export type BodyFile = { readonly path: string; readonly step: number };

export type OutboundWrite = {
	readonly subject: string;
	readonly target: OutboundTarget;
	readonly texts: readonly string[];
	readonly bodyFiles: readonly BodyFile[];
};

type ShellCall = {
	readonly kind: "shell";
	readonly command: string;
	readonly cwd: string;
	readonly env: Env;
};

type McpCall = {
	readonly kind: "mcp";
	readonly server: string;
	readonly tool: string;
	readonly input: unknown;
	readonly dir: string;
};

export type OutboundCall = ShellCall | McpCall;

type Body = { readonly texts: string[]; readonly bodyFiles: BodyFile[] };

type Flag = {
	readonly name: string;
	readonly value: Word | undefined;
	readonly next: number;
};

const UNKNOWN: OutboundTarget = { kind: "unknown" };

const GH_GROUPS = new Set(["issue", "pr"]);
const BODY_TEXT_FLAGS = new Set(["-t", "--title", "-b", "--body"]);
const CLOSE_TEXT_FLAGS = new Set(["-c", "--comment"]);
const MERGE_TEXT_FLAGS = new Set(["-t", "--subject", "-b", "--body"]);
const GH_WRITES: ReadonlyMap<string, ReadonlySet<string>> = new Map([
	["create", BODY_TEXT_FLAGS],
	["new", BODY_TEXT_FLAGS],
	["edit", BODY_TEXT_FLAGS],
	["comment", BODY_TEXT_FLAGS],
	["review", BODY_TEXT_FLAGS],
	["close", CLOSE_TEXT_FLAGS],
	["reopen", CLOSE_TEXT_FLAGS],
	["merge", MERGE_TEXT_FLAGS],
]);
const GH_FILE_FLAGS = new Set(["-F", "--body-file"]);
const REPO_FLAGS = new Set(["-R", "--repo"]);
const ISSUE_URL =
	/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:issues|pull)\/\d+/;
const OTHER_TRACKERS = /linear|jira|atlassian|gitlab|sentry/i;

const API_VALUE_FLAGS = new Set([
	"-X",
	"--method",
	"-f",
	"--raw-field",
	"-F",
	"--field",
	"-H",
	"--header",
	"--input",
	"-q",
	"--jq",
	"-t",
	"--template",
	"--hostname",
	"--cache",
	"-p",
	"--preview",
]);
const API_TEXT_PATH =
	/^(?:https:\/\/api\.github\.com)?\/?(?:repos\/([^/]+)\/([^/]+)\/(?:issues|pulls)(?:[/?]|$)|graphql$)/;
const PLACEHOLDER = /^(?:\{[a-z]+\}|:[a-z]+)$/;

const WRITE_VERBS = new Set([
	"add",
	"comment",
	"create",
	"edit",
	"merge",
	"post",
	"push",
	"reply",
	"respond",
	"review",
	"submit",
	"update",
	"write",
]);

function named(text: string | undefined): OutboundTarget | undefined {
	if (text === undefined) return undefined;
	const parts = text
		.replace(/^https?:\/\//, "")
		.replace(/\.git$/, "")
		.split("/")
		.filter((part) => part !== "");
	const owner = parts.at(-2);
	const name = parts.at(-1);
	return owner === undefined || name === undefined
		? undefined
		: { kind: "named", slug: `${owner}/${name}`.toLowerCase() };
}

function remotes(dir: string): OutboundTarget {
	return { kind: "remotes", dir };
}

function flagAt(
	words: readonly Word[],
	index: number,
	takesValue: ReadonlySet<string>,
): Flag {
	const word = words[index];
	const text = word?.value ?? "";
	const eq = text.indexOf("=");
	if (word !== undefined && text.startsWith("--") && eq > 0)
		return {
			name: text.slice(0, eq),
			value: { ...word, value: text.slice(eq + 1) },
			next: index + 1,
		};
	const short = text.slice(0, 2);
	if (word !== undefined && text.length > 2 && takesValue.has(short))
		return {
			name: short,
			value: { ...word, value: text.slice(2).replace(/^=/, "") },
			next: index + 1,
		};
	return { name: text, value: words[index + 1], next: index + 2 };
}

type StepAt = {
	readonly step: ShellStep;
	readonly at: number;
	readonly previous: ShellStep | undefined;
};

function addBodyFile(value: Word, { step, at, previous }: StepAt, body: Body) {
	if (value.value === "-") {
		const text = step.simple.stdin ?? pipeStageText(previous);
		if (text !== undefined) body.texts.push(text);
	} else if (!value.dynamic)
		body.bodyFiles.push({ path: resolve(step.dir, value.value), step: at });
}

function envRepo(step: ShellStep, call: ShellCall): OutboundTarget | undefined {
	const own = ghRepoPrefix(step.env);
	if (own !== undefined) return named(own) ?? UNKNOWN;
	if (/\bGH_REPO=/.test(call.command)) return UNKNOWN;
	return named(call.env.GH_REPO);
}

function ghWrite(located: StepAt, call: ShellCall): OutboundWrite | undefined {
	const { step } = located;
	const { words } = step;
	let at = 2;
	let repo: OutboundTarget | undefined;
	for (let flag = flagAt(words, at, REPO_FLAGS); REPO_FLAGS.has(flag.name); ) {
		repo = named(flag.value?.value) ?? repo;
		at = flag.next;
		flag = flagAt(words, at, REPO_FLAGS);
	}
	const action = words[at]?.value ?? "";
	const textFlags = GH_WRITES.get(action);
	if (textFlags === undefined) return undefined;
	const valueFlags = new Set([...textFlags, ...GH_FILE_FLAGS, ...REPO_FLAGS]);
	const body: Body = { texts: [], bodyFiles: [] };
	let url: OutboundTarget | undefined;
	for (at++; at < words.length; ) {
		const flag = flagAt(words, at, valueFlags);
		const { value } = flag;
		if (value !== undefined && textFlags.has(flag.name))
			body.texts.push(value.value);
		else if (value !== undefined && GH_FILE_FLAGS.has(flag.name))
			addBodyFile(value, located, body);
		else if (REPO_FLAGS.has(flag.name)) repo = named(value?.value) ?? repo;
		else {
			const match = ISSUE_URL.exec(flag.name);
			if (match) url = named(`${match[1]}/${match[2]}`);
			at++;
			continue;
		}
		at = flag.next;
	}
	return {
		subject: `gh ${step.values[1]} ${action}`,
		target: url ?? repo ?? envRepo(step, call) ?? remotes(step.dir),
		...body,
	};
}

function addField(value: Word, raw: boolean, located: StepAt, body: Body) {
	const eq = value.value.indexOf("=");
	const field = eq < 0 ? value.value : value.value.slice(eq + 1);
	if (!raw && field.startsWith("@"))
		addBodyFile({ ...value, value: field.slice(1) }, located, body);
	else body.texts.push(field);
}

function apiWrite(located: StepAt, call: ShellCall): OutboundWrite | undefined {
	const { step } = located;
	const { words } = step;
	const body: Body = { texts: [], bodyFiles: [] };
	let endpoint: string | undefined;
	let method: string | undefined;
	let sends = false;
	for (let at = 2; at < words.length; ) {
		const flag = flagAt(words, at, API_VALUE_FLAGS);
		const { value } = flag;
		if (!API_VALUE_FLAGS.has(flag.name)) {
			if (!flag.name.startsWith("-")) endpoint ??= flag.name;
			at++;
			continue;
		}
		at = flag.next;
		if (value === undefined) continue;
		if (flag.name === "-X" || flag.name === "--method")
			method = value.value.toUpperCase();
		else if (flag.name === "-f" || flag.name === "--raw-field")
			addField(value, true, located, body);
		else if (flag.name === "-F" || flag.name === "--field")
			addField(value, false, located, body);
		else if (flag.name === "--input") addBodyFile(value, located, body);
		else continue;
		if (flag.name !== "-X" && flag.name !== "--method") sends = true;
	}
	const path = API_TEXT_PATH.exec(endpoint ?? "");
	if (endpoint === undefined || path === null) return undefined;
	if ((method ?? (sends ? "POST" : "GET")) === "GET") return undefined;
	const [, owner, name] = path;
	const target =
		owner === undefined || name === undefined
			? UNKNOWN
			: PLACEHOLDER.test(owner) || PLACEHOLDER.test(name)
				? (envRepo(step, call) ?? remotes(step.dir))
				: (named(`${owner}/${name}`) ?? UNKNOWN);
	return { subject: `gh api ${endpoint}`, target, ...body };
}

function stepWrite(
	located: StepAt,
	call: ShellCall,
): OutboundWrite | undefined {
	const { values } = located.step;
	if (values[0] !== "gh") return undefined;
	if (values[1] === "api") return apiWrite(located, call);
	return GH_GROUPS.has(values[1] ?? "") ? ghWrite(located, call) : undefined;
}

function shellWrites(call: ShellCall): OutboundWrite[] {
	if (!/\bgh\b/.test(call.command)) return [];
	const steps = shellSteps(call.command, call.cwd);
	return steps.flatMap((step, at) => {
		const write = stepWrite({ step, at, previous: steps[at - 1] }, call);
		return write === undefined ? [] : [write];
	});
}

function stringsIn(value: unknown): string[] {
	if (typeof value === "string") return [value];
	if (Array.isArray(value)) return value.flatMap(stringsIn);
	if (typeof value === "object" && value !== null)
		return Object.values(value).flatMap(stringsIn);
	return [];
}

function toolWords(tool: string): string[] {
	return tool
		.replace(/(?<=[a-z0-9])(?=[A-Z])/g, "_")
		.toLowerCase()
		.split(/[^a-z]+/);
}

function isMcpWrite(call: McpCall): boolean {
	const words = toolWords(call.tool);
	if (!words.some((word) => WRITE_VERBS.has(word))) return false;
	if (/github/i.test(call.server) || /pull_?request/i.test(call.tool))
		return true;
	if (!words.some((word) => /^issues?$/.test(word))) return false;
	return (
		ISSUE_URL.test(inputString(call.input, "url") ?? "") ||
		!OTHER_TRACKERS.test(call.server)
	);
}

function mcpTarget(call: McpCall): OutboundTarget {
	const url = ISSUE_URL.exec(inputString(call.input, "url") ?? "");
	if (url) return named(`${url[1]}/${url[2]}`) ?? UNKNOWN;
	const owner = inputString(call.input, "owner");
	const repo =
		inputString(call.input, "repo") ?? inputString(call.input, "repository");
	const slug =
		owner !== undefined && repo !== undefined
			? named(`${owner}/${repo}`)
			: repo?.includes("/")
				? named(repo)
				: undefined;
	return slug ?? remotes(call.dir);
}

export function outboundWrites(call: OutboundCall): readonly OutboundWrite[] {
	switch (call.kind) {
		case "shell":
			return shellWrites(call);
		case "mcp":
			return isMcpWrite(call)
				? [
						{
							subject: call.tool,
							target: mcpTarget(call),
							texts: stringsIn(call.input),
							bodyFiles: [],
						},
					]
				: [];
	}
}
