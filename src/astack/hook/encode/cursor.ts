import type { CursorEvent } from "../decode/cursor.ts";
import type { Verdict } from "../events.ts";
import { type HookOutput, SILENT } from "./base.ts";

const NAMESPACED =
	/(?<![\w.:-])(\/)?(astack|flow|pstack):([a-z0-9]+(?:-[a-z0-9]+)*)/g;
const SKILL_PATH = /\bastack skill-path (?:astack|flow|pstack):[a-z0-9-]+/g;

export function cursorSkillNames(text: string): string {
	const kept: string[] = [];
	const masked = text.replace(SKILL_PATH, (match) => {
		kept.push(match);
		return `\uE000${kept.length - 1}\uE001`;
	});
	return masked
		.replace(
			NAMESPACED,
			(_match, slash: string | undefined, plugin: string, name: string) =>
				`${slash ?? ""}${plugin === "astack" ? `astack-${name}` : name}`,
		)
		.replace(
			/\uE000(\d+)\uE001/g,
			(_match, index: string) => kept[Number(index)] ?? "",
		);
}

function renamed(verdict: Verdict): Verdict {
	switch (verdict.kind) {
		case "allow":
			return verdict;
		case "note":
			return { kind: "note", text: cursorSkillNames(verdict.text) };
		case "deny":
			return { kind: "deny", reason: cursorSkillNames(verdict.reason) };
		case "continue":
			return { kind: "continue", prompt: cursorSkillNames(verdict.prompt) };
	}
}

function json(value: unknown): HookOutput {
	return { stdout: `${JSON.stringify(value)}\n`, stderr: "", exit: 0 };
}

function firstLine(text: string): string {
	return text.split("\n").find((line) => line.trim() !== "") ?? text;
}

function permission(verdict: Verdict): HookOutput {
	switch (verdict.kind) {
		case "allow":
			return json({ permission: "allow" });
		case "note":
			return json({ permission: "allow", agent_message: verdict.text });
		case "deny":
			return json({
				permission: "deny",
				user_message: firstLine(verdict.reason),
				agent_message: verdict.reason,
			});
		case "continue":
			return json({
				permission: "deny",
				user_message: firstLine(verdict.prompt),
				agent_message: verdict.prompt,
			});
	}
}

function prompt(verdict: Verdict): HookOutput {
	switch (verdict.kind) {
		case "allow":
		case "note":
		case "continue":
			return json({ continue: true });
		case "deny":
			return json({ continue: false, user_message: verdict.reason });
	}
}

function stop(verdict: Verdict): HookOutput {
	switch (verdict.kind) {
		case "allow":
		case "note":
			return json({});
		case "deny":
			return json({ followup_message: verdict.reason });
		case "continue":
			return json({ followup_message: verdict.prompt });
	}
}

export const UNATTENDED_ENV = { ASTACK_ATTENDED: "0" } as const;

function sessionStart(verdict: Verdict, attended: boolean): HookOutput {
	return json({
		...(verdict.kind === "note" ? { additional_context: verdict.text } : {}),
		...(attended ? {} : { env: UNATTENDED_ENV }),
	});
}

export function encodeCursor(
	event: CursorEvent,
	original: Verdict,
	attended = true,
): HookOutput {
	const verdict = renamed(original);
	switch (event) {
		case "preToolUse":
		case "beforeShellExecution":
		case "beforeMCPExecution":
			return permission(verdict);
		case "beforeSubmitPrompt":
			return prompt(verdict);
		case "stop":
			return stop(verdict);
		case "sessionStart":
			return sessionStart(verdict, attended);
		case "afterFileEdit":
		case "afterAgentResponse":
			return SILENT;
	}
}
