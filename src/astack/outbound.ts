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

type NamedTarget = Extract<OutboundTarget, { kind: "named" }>;

const UNKNOWN: OutboundTarget = { kind: "unknown" };

const GH_GROUPS = new Set(["issue", "pr"]);
const GH_FILE_FLAGS = new Set(["-F", "--body-file"]);
const REPO_FLAGS = new Set(["-R", "--repo"]);

type GhAction = {
	readonly text: ReadonlySet<string>;
	readonly values: ReadonlySet<string>;
	readonly selects: boolean;
};

function ghAction(text: string, others: string, selects = true): GhAction {
	const textFlags = new Set(text.split(" "));
	const otherFlags = others.split(" ").filter((flag) => flag !== "");
	return {
		text: textFlags,
		values: new Set([
			...textFlags,
			...GH_FILE_FLAGS,
			...REPO_FLAGS,
			...otherFlags,
		]),
		selects,
	};
}

const TITLE_BODY = "-t --title -b --body";
const CLOSE_TEXT = "-c --comment";
const ISSUE_CREATE = ghAction(
	TITLE_BODY,
	"-a --assignee --attach --blocked-by --blocking -l --label -m --milestone --parent -p --project --recover -T --template --type",
	false,
);
const PR_CREATE = ghAction(
	TITLE_BODY,
	"-a --assignee --attach -B --base -H --head -l --label -m --milestone -p --project --recover -r --reviewer -T --template",
	false,
);
const COMMENT = ghAction("-b --body", "--attach");
const GH_WRITES: ReadonlyMap<string, GhAction> = new Map([
	["issue create", ISSUE_CREATE],
	["issue new", ISSUE_CREATE],
	[
		"issue edit",
		ghAction(
			TITLE_BODY,
			"--add-assignee --add-blocked-by --add-blocking --add-label --add-project --add-sub-issue --attach -m --milestone --parent --remove-assignee --remove-blocked-by --remove-blocking --remove-label --remove-project --remove-sub-issue --type",
		),
	],
	["issue comment", COMMENT],
	["issue close", ghAction(CLOSE_TEXT, "--duplicate-of -r --reason")],
	["issue reopen", ghAction(CLOSE_TEXT, "")],
	["pr create", PR_CREATE],
	["pr new", PR_CREATE],
	[
		"pr edit",
		ghAction(
			TITLE_BODY,
			"--add-assignee --add-label --add-project --add-reviewer --attach -B --base -m --milestone --remove-assignee --remove-label --remove-project --remove-reviewer",
		),
	],
	["pr comment", COMMENT],
	["pr review", ghAction("-b --body", "")],
	["pr close", ghAction(CLOSE_TEXT, "")],
	["pr reopen", ghAction(CLOSE_TEXT, "")],
	[
		"pr merge",
		ghAction("-t --subject -b --body", "-A --author-email --match-head-commit"),
	],
]);
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

function named(text: string | undefined): NamedTarget | undefined {
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

function selectorTarget(
	selectors: readonly string[],
	repo: NamedTarget | undefined,
): OutboundTarget | undefined {
	const urls = selectors.flatMap((selector) => {
		const match = ISSUE_URL.exec(selector);
		const target = match ? named(`${match[1]}/${match[2]}`) : undefined;
		return target === undefined ? [] : [target];
	});
	const [first] = urls;
	if (first === undefined) return repo;
	const slugs = new Set([...urls, ...(repo ? [repo] : [])].map((t) => t.slug));
	return slugs.size === 1 && urls.length === selectors.length ? first : UNKNOWN;
}

function ghWrite(located: StepAt, call: ShellCall): OutboundWrite | undefined {
	const { step } = located;
	const { words } = step;
	let at = 2;
	let repo: NamedTarget | undefined;
	for (let flag = flagAt(words, at, REPO_FLAGS); REPO_FLAGS.has(flag.name); ) {
		repo = named(flag.value?.value) ?? repo;
		at = flag.next;
		flag = flagAt(words, at, REPO_FLAGS);
	}
	const action = words[at]?.value ?? "";
	const spec = GH_WRITES.get(`${step.values[1]} ${action}`);
	if (spec === undefined) return undefined;
	const body: Body = { texts: [], bodyFiles: [] };
	const selectors: string[] = [];
	for (at++; at < words.length; ) {
		const word = words[at]?.value ?? "";
		if (!word.startsWith("-") || word === "-") {
			if (spec.selects) selectors.push(word);
			at++;
			continue;
		}
		const flag = flagAt(words, at, spec.values);
		if (!spec.values.has(flag.name)) {
			at++;
			continue;
		}
		at = flag.next;
		const { value } = flag;
		if (value === undefined) continue;
		if (spec.text.has(flag.name)) body.texts.push(value.value);
		else if (GH_FILE_FLAGS.has(flag.name)) addBodyFile(value, located, body);
		else if (REPO_FLAGS.has(flag.name)) repo = named(value.value) ?? repo;
	}
	return {
		subject: `gh ${step.values[1]} ${action}`,
		target:
			selectorTarget(selectors, repo) ??
			envRepo(step, call) ??
			remotes(step.dir),
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
