import { basename, resolve } from "node:path";
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
	readonly unread: boolean;
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

type Body = {
	readonly texts: string[];
	readonly bodyFiles: BodyFile[];
	unread: boolean;
};

type NamedTarget = Extract<OutboundTarget, { kind: "named" }>;

const UNKNOWN: OutboundTarget = { kind: "unknown" };

type FlagSpec = {
	readonly values: ReadonlySet<string>;
	readonly switches: ReadonlySet<string>;
};

type Arg =
	| {
			readonly kind: "flag";
			readonly name: string;
			readonly value: Word | undefined;
	  }
	| { readonly kind: "positional"; readonly word: Word }
	| { readonly kind: "unparsed" };

type Read = { readonly args: readonly Arg[]; readonly width: number };

function flagSet(list: string): ReadonlySet<string> {
	return new Set(list.split(" ").filter((flag) => flag !== ""));
}

const GH_GROUPS = new Set(["issue", "pr", "release", "gist", "repo"]);
const REPO_FLAGS = flagSet("-R --repo");
const LEADING: FlagSpec = { values: REPO_FLAGS, switches: flagSet("--help") };

type Operand = "select" | "file" | "ignore";

type GhAction = FlagSpec & {
	readonly text: ReadonlySet<string>;
	readonly files: ReadonlySet<string>;
	readonly operands: readonly Operand[];
	readonly targetsRepo: boolean;
};

type GhActionFlags = {
	readonly text: string;
	readonly files?: string;
	readonly values?: string;
	readonly switches?: string;
	readonly operands?: readonly Operand[];
	readonly targetsRepo?: boolean;
};

function ghAction(flags: GhActionFlags): GhAction {
	const text = flagSet(flags.text);
	const files = flagSet(flags.files ?? "-F --body-file");
	return {
		text,
		files,
		values: new Set([
			...text,
			...files,
			...REPO_FLAGS,
			...flagSet(flags.values ?? ""),
		]),
		switches: flagSet(`--help ${flags.switches ?? ""}`),
		operands: flags.operands ?? ["select"],
		targetsRepo: flags.targetsRepo ?? true,
	};
}

const TITLE_BODY = "-t --title -b --body";
const CLOSE_TEXT = "-c --comment";
const ISSUE_CREATE = ghAction({
	text: TITLE_BODY,
	values:
		"-a --assignee --attach --blocked-by --blocking -l --label -m --milestone --parent -p --project --recover -T --template --type",
	switches: "-e --editor -w --web",
	operands: ["ignore"],
});
const PR_CREATE = ghAction({
	text: TITLE_BODY,
	values:
		"-a --assignee --attach -B --base -H --head -l --label -m --milestone -p --project --recover -r --reviewer -T --template",
	switches:
		"-d --draft --dry-run -e --editor -f --fill --fill-first --fill-verbose --no-maintainer-edit -w --web",
	operands: ["ignore"],
});
const COMMENT = ghAction({
	text: "-b --body",
	values: "--attach",
	switches:
		"--create-if-none --delete-last --edit-last -e --editor -w --web --yes",
});
const RELEASE_CREATE = ghAction({
	text: "-t --title -n --notes",
	files: "-F --notes-file",
	values: "--discussion-category --notes-start-tag --target",
	switches:
		"-d --draft --fail-on-no-commits --generate-notes --latest --notes-from-tag -p --prerelease --verify-tag",
	operands: ["ignore"],
});
const GIST_CREATE = ghAction({
	text: "-d --desc",
	files: "",
	values: "-f --filename",
	switches: "-p --public -w --web",
	operands: ["file"],
	targetsRepo: false,
});
const REPO_CREATE = ghAction({
	text: "-d --description",
	files: "",
	values:
		"-g --gitignore -h --homepage -l --license -r --remote -s --source -t --team -p --template",
	switches:
		"--add-readme -c --clone --disable-issues --disable-wiki --include-all-branches --internal --private --public --push",
	operands: ["ignore"],
	targetsRepo: false,
});
const GH_WRITES: ReadonlyMap<string, GhAction> = new Map([
	["issue create", ISSUE_CREATE],
	["issue new", ISSUE_CREATE],
	[
		"issue edit",
		ghAction({
			text: TITLE_BODY,
			values:
				"--add-assignee --add-blocked-by --add-blocking --add-label --add-project --add-sub-issue --attach -m --milestone --parent --remove-assignee --remove-blocked-by --remove-blocking --remove-label --remove-project --remove-sub-issue --type",
			switches: "--remove-milestone --remove-parent --remove-type",
		}),
	],
	["issue comment", COMMENT],
	[
		"issue close",
		ghAction({ text: CLOSE_TEXT, values: "--duplicate-of -r --reason" }),
	],
	["issue reopen", ghAction({ text: CLOSE_TEXT })],
	["pr create", PR_CREATE],
	["pr new", PR_CREATE],
	[
		"pr edit",
		ghAction({
			text: TITLE_BODY,
			values:
				"--add-assignee --add-label --add-project --add-reviewer --attach -B --base -m --milestone --remove-assignee --remove-label --remove-project --remove-reviewer",
			switches: "--remove-milestone",
		}),
	],
	["pr comment", COMMENT],
	[
		"pr review",
		ghAction({
			text: "-b --body",
			switches: "-a --approve -c --comment -r --request-changes",
		}),
	],
	["pr close", ghAction({ text: CLOSE_TEXT, switches: "-d --delete-branch" })],
	["pr reopen", ghAction({ text: CLOSE_TEXT })],
	[
		"pr merge",
		ghAction({
			text: "-t --subject -b --body",
			values: "-A --author-email --match-head-commit",
			switches:
				"--admin --auto -d --delete-branch --disable-auto -m --merge -r --rebase -s --squash",
		}),
	],
	["release create", RELEASE_CREATE],
	["release new", RELEASE_CREATE],
	[
		"release edit",
		ghAction({
			text: "-t --title -n --notes",
			files: "-F --notes-file",
			values: "--discussion-category --tag --target",
			switches: "--draft --latest --prerelease --verify-tag",
			operands: ["ignore"],
		}),
	],
	["gist create", GIST_CREATE],
	["gist new", GIST_CREATE],
	[
		"gist edit",
		ghAction({
			text: "-d --desc",
			files: "-a --add",
			values: "-f --filename -r --remove",
			operands: ["ignore", "file"],
			targetsRepo: false,
		}),
	],
	["repo create", REPO_CREATE],
	["repo new", REPO_CREATE],
	[
		"repo edit",
		ghAction({
			text: "-d --description",
			files: "",
			values:
				"--add-topic --default-branch -h --homepage --remove-topic --squash-merge-commit-message --visibility",
			switches:
				"--accept-visibility-change-consequences --allow-forking --allow-update-branch --delete-branch-on-merge --enable-advanced-security --enable-auto-merge --enable-discussions --enable-issues --enable-merge-commit --enable-projects --enable-rebase-merge --enable-secret-scanning --enable-secret-scanning-push-protection --enable-squash-merge --enable-wiki --template",
			operands: ["ignore"],
			targetsRepo: false,
		}),
	],
]);
const ISSUE_URL =
	/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:issues|pull)\/\d+/;
const OTHER_TRACKERS = /linear|jira|atlassian|gitlab|sentry/i;

const API_FLAGS: FlagSpec = {
	values: flagSet(
		"-X --method -f --raw-field -F --field -H --header --input -q --jq -t --template --hostname --cache -p --preview",
	),
	switches: flagSet(
		"-i --include --paginate --silent --slurp --verbose --allow-escape-sequences --help",
	),
};
const API_REPO_PATH =
	/^(?:https:\/\/api\.github\.com)?\/?repos\/([^/]+)\/([^/]+)(?:[/?]|$)/;
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

const UNPARSED: Read = { args: [{ kind: "unparsed" }], width: 1 };

function flag(name: string, value: Word | undefined): Arg {
	return { kind: "flag", name, value };
}

function longArg(word: Word, next: Word | undefined, spec: FlagSpec): Read {
	const eq = word.value.indexOf("=");
	const name = eq < 0 ? word.value : word.value.slice(0, eq);
	if (eq >= 0)
		return spec.values.has(name) || spec.switches.has(name)
			? {
					args: [flag(name, { ...word, value: word.value.slice(eq + 1) })],
					width: 1,
				}
			: UNPARSED;
	if (spec.switches.has(name))
		return { args: [flag(name, undefined)], width: 1 };
	return spec.values.has(name) && next !== undefined
		? { args: [flag(name, next)], width: 2 }
		: UNPARSED;
}

function shortArgs(word: Word, next: Word | undefined, spec: FlagSpec): Read {
	const args: Arg[] = [];
	for (let at = 1; at < word.value.length; at++) {
		const name = `-${word.value.charAt(at)}`;
		const rest = word.value.slice(at + 1);
		const attached = { ...word, value: rest.replace(/^=/, "") };
		if (spec.switches.has(name) && !rest.startsWith("=")) {
			args.push(flag(name, undefined));
			continue;
		}
		if (!spec.switches.has(name) && !spec.values.has(name)) return UNPARSED;
		if (rest !== "") return { args: [...args, flag(name, attached)], width: 1 };
		return next === undefined
			? UNPARSED
			: { args: [...args, flag(name, next)], width: 2 };
	}
	return { args, width: 1 };
}

function readArg(word: Word, next: Word | undefined, spec: FlagSpec): Read {
	if (word.dynamic && (word.splits === true || !word.value.startsWith("-")))
		return UNPARSED;
	if (!word.value.startsWith("-") || word.value === "-")
		return { args: [{ kind: "positional", word }], width: 1 };
	return word.value.startsWith("--")
		? longArg(word, next, spec)
		: shortArgs(word, next, spec);
}

function parseArgs(words: readonly Word[], spec: FlagSpec): Arg[] {
	const args: Arg[] = [];
	for (let at = 0; at < words.length; ) {
		const word = words[at];
		if (word === undefined) break;
		const read = readArg(word, words[at + 1], spec);
		args.push(...read.args);
		at += read.width;
	}
	return args;
}

type StepAt = {
	readonly step: ShellStep;
	readonly at: number;
	readonly previous: ShellStep | undefined;
};

function fileBody(file: Word, { step, at }: StepAt, body: Body): void {
	if (file.dynamic) body.unread = true;
	else body.bodyFiles.push({ path: resolve(step.dir, file.value), step: at });
}

function stdinBody(located: StepAt, body: Body): void {
	const { step, previous } = located;
	const input = step.simple.redirects.find(
		(redirect) => redirect.fd === 0 && redirect.op === "<",
	);
	const text = step.simple.stdin ?? pipeStageText(previous);
	if (input !== undefined) fileBody(input.target, located, body);
	else if (text === undefined) body.unread = true;
	else body.texts.push(text);
}

function addBodyFile(value: Word, located: StepAt, body: Body): void {
	if (value.value === "-" && !value.dynamic) stdinBody(located, body);
	else fileBody(value, located, body);
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

function unparsedWrite(
	subject: string,
	step: ShellStep,
	body: Body,
): OutboundWrite {
	return {
		subject,
		target: UNKNOWN,
		texts: [
			...body.texts,
			...step.words
				.slice(1)
				.filter((word) => !word.dynamic)
				.map((word) => word.value),
		],
		bodyFiles: body.bodyFiles,
		unread: body.unread,
	};
}

function emptyBody(): Body {
	return { texts: [], bodyFiles: [], unread: false };
}

function repoValue(value: Word | undefined): NamedTarget | undefined {
	return value === undefined || value.dynamic ? undefined : named(value.value);
}

function ghWrite(located: StepAt, call: ShellCall): OutboundWrite | undefined {
	const { step } = located;
	const { words } = step;
	const group = `gh ${step.values[1]}`;
	let at = 2;
	let repo: NamedTarget | undefined;
	for (let word = words[at]; word !== undefined; word = words[at]) {
		const read = readArg(word, words[at + 1], LEADING);
		const [arg] = read.args;
		if (arg?.kind !== "flag") break;
		if (REPO_FLAGS.has(arg.name)) {
			repo = repoValue(arg.value);
			if (repo === undefined) return unparsedWrite(group, step, emptyBody());
		}
		at += read.width;
	}
	const action = words[at];
	if (action === undefined) return undefined;
	if (action.dynamic || action.value.startsWith("-"))
		return unparsedWrite(group, step, emptyBody());
	const spec = GH_WRITES.get(`${step.values[1]} ${action.value}`);
	if (spec === undefined) return undefined;
	const subject = `${group} ${action.value}`;
	const body = emptyBody();
	const selectors: string[] = [];
	let operands = 0;
	let parsed = true;
	for (const arg of parseArgs(words.slice(at + 1), spec)) {
		if (arg.kind === "unparsed") parsed = false;
		else if (arg.kind === "positional") {
			const role =
				spec.operands[Math.min(operands++, spec.operands.length - 1)];
			if (role === "select") selectors.push(arg.word.value);
			else if (role === "file") addBodyFile(arg.word, located, body);
		} else if (arg.value === undefined || spec.switches.has(arg.name)) continue;
		else if (spec.text.has(arg.name)) body.texts.push(arg.value.value);
		else if (spec.files.has(arg.name)) addBodyFile(arg.value, located, body);
		else if (REPO_FLAGS.has(arg.name)) {
			repo = repoValue(arg.value);
			parsed &&= repo !== undefined;
		}
	}
	if (!parsed) return unparsedWrite(subject, step, body);
	return {
		subject,
		target:
			!spec.targetsRepo || body.unread
				? UNKNOWN
				: (selectorTarget(selectors, repo) ??
					envRepo(step, call) ??
					remotes(step.dir)),
		...body,
	};
}

function addField(
	value: Word,
	raw: boolean,
	located: StepAt,
	body: Body,
): true {
	const eq = value.value.indexOf("=");
	const field = eq < 0 ? value.value : value.value.slice(eq + 1);
	if (!raw && field.startsWith("@"))
		addBodyFile({ ...value, value: field.slice(1) }, located, body);
	else body.texts.push(field);
	return true;
}

function apiWrite(located: StepAt, call: ShellCall): OutboundWrite | undefined {
	const { step } = located;
	const body = emptyBody();
	let endpoint: string | undefined;
	let method: string | undefined;
	let sends = false;
	for (const arg of parseArgs(step.words.slice(2), API_FLAGS)) {
		if (arg.kind === "unparsed") return unparsedWrite("gh api", step, body);
		if (arg.kind === "positional") endpoint ??= arg.word.value;
		else if (arg.value === undefined || API_FLAGS.switches.has(arg.name))
			continue;
		else if (arg.name === "-X" || arg.name === "--method")
			method = arg.value.value.toUpperCase();
		else if (arg.name === "-f" || arg.name === "--raw-field")
			sends = addField(arg.value, true, located, body);
		else if (arg.name === "-F" || arg.name === "--field")
			sends = addField(arg.value, false, located, body);
		else if (arg.name === "--input") {
			addBodyFile(arg.value, located, body);
			sends = true;
		}
	}
	if ((method ?? (sends ? "POST" : "GET")) === "GET") return undefined;
	const [, owner, name] = API_REPO_PATH.exec(endpoint ?? "") ?? [];
	const target =
		body.unread || owner === undefined || name === undefined
			? UNKNOWN
			: PLACEHOLDER.test(owner) || PLACEHOLDER.test(name)
				? (envRepo(step, call) ?? remotes(step.dir))
				: (named(`${owner}/${name}`) ?? UNKNOWN);
	return { subject: `gh api ${endpoint ?? ""}`.trim(), target, ...body };
}

function isGhProgram(program: string | undefined): boolean {
	return (
		program !== undefined && basename(program).replace(/\.exe$/, "") === "gh"
	);
}

function stepWrite(
	located: StepAt,
	call: ShellCall,
): OutboundWrite | undefined {
	const { step } = located;
	if (step.unreadable !== undefined)
		return {
			subject: "gh",
			target: UNKNOWN,
			texts: [call.command],
			bodyFiles: [],
			unread: false,
		};
	const group = step.words[1];
	if (!isGhProgram(step.values[0]) || group === undefined) return undefined;
	if (group.dynamic || group.value.startsWith("-"))
		return unparsedWrite("gh", step, emptyBody());
	if (group.value === "api") return apiWrite(located, call);
	return GH_GROUPS.has(group.value) ? ghWrite(located, call) : undefined;
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
							unread: false,
						},
					]
				: [];
	}
}
