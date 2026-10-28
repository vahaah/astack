import { isAbsolute, resolve } from "node:path";
import { applyEdit } from "../../comments/added.ts";
import type { HookEvent, HookEventName } from "../events.ts";
import { mcpParts } from "./claude-code.ts";
import type { DecodeDeps, Decoded } from "./types.ts";

export const CURSOR_EVENTS = [
	"sessionStart",
	"beforeSubmitPrompt",
	"preToolUse",
	"afterFileEdit",
	"beforeShellExecution",
	"beforeMCPExecution",
	"afterAgentResponse",
	"stop",
] as const;
export type CursorEvent = (typeof CURSOR_EVENTS)[number];

export function parseCursorEvent(
	value: string | undefined,
): CursorEvent | undefined {
	return CURSOR_EVENTS.find((event) => event === value);
}

export function canonicalEvent(event: CursorEvent): HookEventName {
	switch (event) {
		case "sessionStart":
			return "SessionStart";
		case "beforeSubmitPrompt":
			return "UserPromptSubmit";
		case "preToolUse":
		case "afterFileEdit":
		case "beforeShellExecution":
		case "beforeMCPExecution":
			return "PreToolUse";
		case "afterAgentResponse":
		case "stop":
			return "Stop";
	}
}

export type CursorDeps = DecodeDeps & { readonly reply: string | undefined };

type Payload = Readonly<Record<string, unknown>>;

function isPayload(value: unknown): value is Payload {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function firstText(
	payload: Payload,
	keys: readonly string[],
): string | undefined {
	for (const key of keys) {
		const value = text(payload[key]);
		if (value !== undefined) return value;
	}
	return undefined;
}

export function cursorSession(raw: unknown): string {
	return isPayload(raw) ? (text(raw.conversation_id) ?? "") : "";
}

function workspaceRoot(payload: Payload): string | undefined {
	const roots = payload.workspace_roots;
	return Array.isArray(roots) ? text(roots[0]) : undefined;
}

function absoluteIn(dir: string, path: string): string {
	return isAbsolute(path) ? path : resolve(dir, path);
}

function parsedInput(value: unknown): Payload {
	if (isPayload(value)) return value;
	if (typeof value !== "string") return {};
	try {
		const parsed: unknown = JSON.parse(value);
		return isPayload(parsed) ? parsed : {};
	} catch {
		return {};
	}
}

const PATH_KEYS = ["file_path", "path", "target_file", "filePath"];
const CONTENT_KEYS = ["content", "contents", "file_text", "text"];

function writeToolEvents(
	input: Payload,
	dir: string,
	deps: CursorDeps,
): HookEvent[] {
	const file = firstText(input, PATH_KEYS);
	if (!file) return [];
	const path = absoluteIn(dir, file);
	const before = deps.readText(path);
	const oldText = text(input.old_string);
	const newText = text(input.new_string);
	if (oldText !== undefined && newText !== undefined) {
		const edit = applyEdit(
			before,
			oldText,
			newText,
			input.replace_all === true,
		);
		if (!edit) return [];
		return before === undefined
			? [{ kind: "write", path, before: undefined, after: edit.content }]
			: [
					{
						kind: "edit",
						path,
						before,
						after: edit.content,
						regions: edit.regions,
						oldText,
						newText,
					},
				];
	}
	const content = firstText(input, CONTENT_KEYS);
	return content === undefined
		? []
		: [{ kind: "write", path, before, after: content }];
}

type Replacement = { readonly oldText: string; readonly newText: string };

function replacements(value: unknown): Replacement[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const found: Replacement[] = [];
	for (const item of value) {
		const fields = parsedInput(item);
		const oldText = text(fields.old_string);
		const newText = text(fields.new_string);
		if (oldText === undefined || newText === undefined) return undefined;
		found.push({ oldText, newText });
	}
	return found;
}

export function textBefore(
	after: string,
	edits: readonly Replacement[],
): string | undefined {
	let current = after;
	for (const edit of [...edits].reverse()) {
		if (edit.newText === "") return undefined;
		const at = current.indexOf(edit.newText);
		if (at < 0) return undefined;
		current = `${current.slice(0, at)}${edit.oldText}${current.slice(at + edit.newText.length)}`;
	}
	return current;
}

function afterEditEvents(
	payload: Payload,
	dir: string,
	deps: CursorDeps,
): HookEvent[] {
	const file = text(payload.file_path);
	const edits = replacements(payload.edits);
	if (!file || edits === undefined || edits.length === 0) return [];
	const path = absoluteIn(dir, file);
	const after = deps.readText(path);
	if (after === undefined) return [];
	const before = textBefore(after, edits);
	return before === undefined || before === after
		? []
		: [{ kind: "write", path, before, after }];
}

function serverOf(payload: Payload): string {
	const named = text(payload.mcp_server_name);
	if (named) return named;
	const url = text(payload.url);
	if (url) {
		try {
			return new URL(url).hostname;
		} catch {
			return url;
		}
	}
	return text(payload.command) ?? text(payload.server) ?? "";
}

function mcpEvents(payload: Payload): HookEvent[] {
	const name = text(payload.tool_name);
	if (!name) return [];
	const input = parsedInput(payload.tool_input);
	if (name.startsWith("mcp__"))
		return [{ kind: "mcp", ...mcpParts(name), input }];
	return [{ kind: "mcp", server: serverOf(payload), tool: name, input }];
}

function eventsFor(
	event: CursorEvent,
	payload: Payload,
	cwd: string,
	projectDir: string,
	deps: CursorDeps,
): HookEvent[] {
	const session = cursorSession(payload);
	switch (event) {
		case "sessionStart":
			return [
				{
					kind: "session-start",
					cwd,
					attended: payload.is_background_agent !== true,
				},
			];
		case "beforeSubmitPrompt":
			return [
				{
					kind: "prompt",
					text: text(payload.prompt) ?? "",
					human: true,
					session,
				},
			];
		case "preToolUse": {
			const tool = text(payload.tool_name) ?? "";
			const input = parsedInput(payload.tool_input);
			if (tool === "Write") return writeToolEvents(input, projectDir, deps);
			if (tool === "Shell") {
				const command = text(input.command);
				return command ? [{ kind: "shell", command, cwd }] : [];
			}
			return [];
		}
		case "afterFileEdit":
			return afterEditEvents(payload, projectDir, deps);
		case "beforeShellExecution": {
			const command = text(payload.command);
			return command ? [{ kind: "shell", command, cwd }] : [];
		}
		case "beforeMCPExecution":
			return mcpEvents(payload);
		case "afterAgentResponse":
			return [];
		case "stop":
			return text(payload.status) === "completed"
				? [
						{
							kind: "reply",
							text: deps.reply,
							session,
							interactive:
								payload.is_background_agent !== true &&
								deps.env.ASTACK_ATTENDED !== "0",
							subagent: false,
							fresh: payload.loop_count === 0,
							chain: text(payload.generation_id),
							crons: [],
						},
					]
				: [];
	}
}

export function decodeCursor(
	event: CursorEvent,
	raw: unknown,
	deps: CursorDeps,
): Decoded | undefined {
	if (!isPayload(raw)) return undefined;
	const root = workspaceRoot(raw);
	const cwd = text(raw.cwd) || root || deps.cwd;
	const projectDir = deps.env.CURSOR_PROJECT_DIR || root || undefined;
	return {
		cwd,
		projectDir,
		events: eventsFor(event, raw, cwd, projectDir ?? cwd, deps),
	};
}
