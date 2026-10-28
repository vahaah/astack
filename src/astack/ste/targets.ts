import type { GhFlags } from "../gh.ts";
import { ghBody } from "../gh.ts";
import type { ShellStep, Word } from "../shell.ts";
import type { LineRange } from "./check.ts";
import type { Enforcement, Surface } from "./types.ts";

export type Target = {
	readonly subject: string;
	readonly text: string;
	readonly surface: Surface;
	readonly enforcement: Enforcement;
	readonly old?: string | undefined;
	readonly lines?: readonly LineRange[] | undefined;
	readonly oldLines?: readonly LineRange[] | undefined;
	readonly titleLines?: readonly number[] | undefined;
	readonly headerFields?: boolean | undefined;
};

const TITLE_LINES: readonly number[] = [1];

type GhCommand = {
	readonly group: "pr" | "issue";
	readonly action: string;
	readonly subject: string;
	readonly surface: Surface;
	readonly enforcement: Enforcement;
};

const GH_COMMANDS: readonly GhCommand[] = [
	{
		group: "pr",
		action: "create",
		subject: "this PR body",
		surface: "pr",
		enforcement: "deny",
	},
	{
		group: "pr",
		action: "edit",
		subject: "this PR body",
		surface: "pr",
		enforcement: "deny",
	},
	{
		group: "pr",
		action: "comment",
		subject: "this PR comment",
		surface: "pr",
		enforcement: "deny",
	},
	{
		group: "pr",
		action: "review",
		subject: "this PR review",
		surface: "pr",
		enforcement: "deny",
	},
	{
		group: "issue",
		action: "create",
		subject: "this issue",
		surface: "ticket",
		enforcement: "deny",
	},
	{
		group: "issue",
		action: "comment",
		subject: "this issue comment",
		surface: "ticket",
		enforcement: "deny",
	},
	{
		group: "issue",
		action: "edit",
		subject: "this issue edit",
		surface: "ticket",
		enforcement: "advise",
	},
];

const SKIP_FLAGS = new Set([
	"-w",
	"--web",
	"-e",
	"--editor",
	"-f",
	"--fill",
	"--fill-first",
	"--fill-verbose",
	"--edit-last",
]);

function flagValue(
	words: readonly Word[],
	index: number,
	names: readonly string[],
): Word | undefined {
	const word = words[index];
	if (!word) return undefined;
	for (const name of names) {
		if (word.value === name) return words[index + 1];
		if (name.startsWith("--") && word.value.startsWith(`${name}=`))
			return {
				value: word.value.slice(name.length + 1),
				dynamic: word.dynamic,
			};
	}
	return undefined;
}

function ghFields(words: readonly Word[]): GhFlags {
	let body: Word | undefined;
	let bodyFile: Word | undefined;
	let title: string | undefined;
	let skip = false;
	for (let index = 0; index < words.length; index++) {
		const value = words[index]?.value ?? "";
		if (SKIP_FLAGS.has(value)) skip = true;
		body = flagValue(words, index, ["-b", "--body"]) ?? body;
		bodyFile = flagValue(words, index, ["-F", "--body-file"]) ?? bodyFile;
		title = flagValue(words, index, ["-t", "--title"])?.value ?? title;
	}
	return {
		labels: [],
		skip,
		...(body ? { body } : {}),
		...(bodyFile ? { bodyFile } : {}),
		...(title !== undefined ? { title } : {}),
	};
}

export function ghTargets(step: ShellStep): readonly Target[] {
	const [tool, group, action] = step.values;
	if (tool !== "gh") return [];
	const command = GH_COMMANDS.find(
		(candidate) => candidate.group === group && candidate.action === action,
	);
	if (!command) return [];
	const fields = ghFields(step.words.slice(3));
	if (fields.skip) return [];
	const body = ghBody(fields, step.simple, step.dir);
	const title =
		fields.title !== undefined && !fields.title.includes("\n")
			? [
					{
						subject: `the title of ${command.subject}`,
						text: fields.title,
						surface: command.surface,
						enforcement: command.enforcement,
						titleLines: TITLE_LINES,
					},
				]
			: [];
	const main =
		body === undefined
			? []
			: [
					{
						subject: command.subject,
						text: body,
						surface: command.surface,
						enforcement: command.enforcement,
					},
				];
	return [...title, ...main];
}

type Fields = Readonly<Record<string, unknown>>;

function isFields(value: unknown): value is Fields {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function fieldTargets(
	subject: string,
	surface: Surface,
	enforcement: Enforcement,
	title: string | undefined,
	body: string | undefined,
): readonly Target[] {
	return [
		...(title !== undefined && !title.includes("\n")
			? [
					{
						subject: `the title of ${subject}`,
						text: title,
						surface,
						enforcement,
						titleLines: TITLE_LINES,
					},
				]
			: []),
		...(body !== undefined
			? [{ subject, text: body, surface, enforcement }]
			: []),
	];
}

function linearTargets(tool: string, input: Fields): readonly Target[] {
	const update = /update_/.test(tool) || text(input.id) !== undefined;
	const enforcement: Enforcement = update ? "advise" : "deny";
	if (/(?:save|create|update)_issue$/.test(tool))
		return fieldTargets(
			"this Linear issue",
			"ticket",
			enforcement,
			text(input.title),
			text(input.description) ?? text(input.body) ?? text(input.content),
		);
	if (/(?:save|create|update)_comment$/.test(tool))
		return fieldTargets(
			"this Linear comment",
			"ticket",
			enforcement,
			undefined,
			text(input.body) ?? text(input.content),
		);
	return [];
}

function githubTargets(tool: string, input: Fields): readonly Target[] {
	const title = text(input.title);
	const body = text(input.body);
	switch (tool) {
		case "create_issue":
			return fieldTargets("this GitHub issue", "ticket", "deny", title, body);
		case "issue_write":
			return fieldTargets(
				"this GitHub issue",
				"ticket",
				input.method === "update" ? "advise" : "deny",
				title,
				body,
			);
		case "update_issue":
			return fieldTargets("this GitHub issue", "ticket", "advise", title, body);
		case "add_issue_comment":
			return fieldTargets(
				"this issue comment",
				"ticket",
				"deny",
				undefined,
				body,
			);
		case "create_pull_request":
		case "update_pull_request":
			return fieldTargets("this PR body", "pr", "deny", title, body);
		case "pull_request_review_write":
		case "create_pull_request_review":
		case "add_comment_to_pending_review":
		case "add_reply_to_pull_request_comment":
			return fieldTargets("this PR review", "pr", "deny", undefined, body);
		default:
			return [];
	}
}

export function mcpTargets(
	server: string,
	tool: string,
	input: unknown,
): readonly Target[] {
	const fields = isFields(input) ? input : {};
	if (/linear/i.test(server) || /linear/i.test(tool))
		return linearTargets(tool, fields);
	if (/github/i.test(server)) return githubTargets(tool, fields);
	return [];
}
