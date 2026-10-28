import { isAbsolute, join, resolve } from "node:path";
import { sessionAttended } from "../../attended.ts";
import { applyEdit } from "../../comments/added.ts";
import { stateDir } from "../../state.ts";
import { humanPrompt, replyInteractive } from "../../ste/session.ts";
import { CRONS_FILE, parseCrons, sessionDir } from "../../ste/state.ts";
import type { HookEvent, HookEventName } from "../events.ts";
import { applyPatchEvents, patchText } from "./apply-patch.ts";
import type { DecodeDeps, Decoded } from "./types.ts";

type Payload = Readonly<Record<string, unknown>>;

function isPayload(value: unknown): value is Payload {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function payloadOf(value: unknown): Payload {
	return isPayload(value) ? value : {};
}

function text(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function absoluteIn(projectDir: string, filePath: string): string {
	return isAbsolute(filePath) ? filePath : resolve(projectDir, filePath);
}

function writeEvents(
	input: Payload,
	projectDir: string,
	deps: DecodeDeps,
): HookEvent[] {
	const filePath = text(input.file_path);
	const content = text(input.content);
	if (!filePath || content === undefined) return [];
	const path = absoluteIn(projectDir, filePath);
	return [{ kind: "write", path, before: deps.readText(path), after: content }];
}

function editEvents(
	input: Payload,
	projectDir: string,
	deps: DecodeDeps,
): HookEvent[] {
	const filePath = text(input.file_path);
	const oldText = text(input.old_string);
	const newText = text(input.new_string);
	if (!filePath || oldText === undefined || newText === undefined) return [];
	const path = absoluteIn(projectDir, filePath);
	const before = deps.readText(path);
	const edit = applyEdit(before, oldText, newText, input.replace_all === true);
	if (!edit) return [];
	if (before === undefined)
		return [{ kind: "write", path, before: undefined, after: edit.content }];
	return [
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

function multiEditEvents(
	input: Payload,
	projectDir: string,
	deps: DecodeDeps,
): HookEvent[] {
	const filePath = text(input.file_path);
	const edits = Array.isArray(input.edits) ? input.edits : [];
	if (!filePath || edits.length === 0) return [];
	const path = absoluteIn(projectDir, filePath);
	const before = deps.readText(path);
	let content = before;
	for (const raw of edits) {
		const edit = payloadOf(raw);
		const oldText = text(edit.old_string);
		const newText = text(edit.new_string);
		if (oldText === undefined || newText === undefined) return [];
		const applied = applyEdit(
			content,
			oldText,
			newText,
			edit.replace_all === true,
		);
		if (!applied) return [];
		content = applied.content;
	}
	return content === undefined
		? []
		: [{ kind: "write", path, before, after: content }];
}

export function mcpParts(name: string): { server: string; tool: string } {
	const rest = name.slice("mcp__".length);
	const split = rest.lastIndexOf("__");
	return split < 0
		? { server: rest, tool: "" }
		: { server: rest.slice(0, split), tool: rest.slice(split + 2) };
}

function toolEvents(
	payload: Payload,
	cwd: string,
	projectDir: string,
	deps: DecodeDeps,
): HookEvent[] {
	const name = text(payload.tool_name) ?? "";
	const input = payloadOf(payload.tool_input);
	if (name === "Write") return writeEvents(input, projectDir, deps);
	if (name === "Edit") return editEvents(input, projectDir, deps);
	if (name === "MultiEdit") return multiEditEvents(input, projectDir, deps);
	if (name === "apply_patch") {
		const patch = patchText(input.command) ?? text(input.patch);
		return patch === undefined
			? []
			: applyPatchEvents(patch, projectDir, deps.readText);
	}
	if (name === "Bash") {
		const command = text(input.command);
		return command ? [{ kind: "shell", command, cwd }] : [];
	}
	if (name.startsWith("mcp__"))
		return [{ kind: "mcp", ...mcpParts(name), input: payload.tool_input }];
	return [];
}

function payloads(value: unknown): readonly Payload[] {
	return Array.isArray(value) ? value.filter(isPayload) : [];
}

function cronPrompts(value: unknown): readonly string[] {
	return payloads(value).flatMap((cron) => {
		const prompt = text(cron.prompt);
		return prompt === undefined ? [] : [prompt];
	});
}

function savedCrons(session: string, deps: DecodeDeps): readonly string[] {
	const root = stateDir(deps.env);
	const dir = root ? sessionDir(root, session) : undefined;
	return dir ? parseCrons(deps.readText(join(dir, CRONS_FILE))) : [];
}

function eventsFor(
	event: HookEventName,
	payload: Payload,
	cwd: string,
	projectDir: string | undefined,
	deps: DecodeDeps,
): HookEvent[] {
	const session = text(payload.session_id) ?? "";
	switch (event) {
		case "PreToolUse":
			return toolEvents(payload, cwd, projectDir ?? cwd, deps);
		case "SessionStart":
			return [
				{ kind: "session-start", cwd, attended: sessionAttended(deps.env) },
			];
		case "UserPromptSubmit": {
			const prompt = text(payload.prompt) ?? "";
			return [
				{
					kind: "prompt",
					text: prompt,
					human: humanPrompt(
						text(payload.source),
						prompt,
						deps.env,
						savedCrons(session, deps),
					),
					session,
				},
			];
		}
		case "Stop":
			return [
				{
					kind: "reply",
					text: text(payload.last_assistant_message),
					session,
					interactive: replyInteractive(deps.env),
					subagent: Boolean(text(payload.agent_id)),
					fresh: payload.stop_hook_active === false,
					chain: text(payload.prompt_id) ?? text(payload.turn_id),
					crons: cronPrompts(payload.session_crons),
				},
			];
	}
}

export function decodeClaudeCode(
	event: HookEventName,
	raw: unknown,
	deps: DecodeDeps,
): Decoded | undefined {
	if (!isPayload(raw)) return undefined;
	const cwd = text(raw.cwd) ?? deps.cwd;
	const projectDir = deps.env.CLAUDE_PROJECT_DIR || undefined;
	const session = text(raw.session_id);
	return {
		cwd,
		projectDir,
		...(session ? { session } : {}),
		events: eventsFor(event, raw, cwd, projectDir, deps),
	};
}
