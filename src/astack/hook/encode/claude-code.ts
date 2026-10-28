import type { HookEventName, Verdict } from "../events.ts";
import { encodeBase, type HookOutput } from "./base.ts";

function noteOutput(event: HookEventName, text: string): unknown {
	switch (event) {
		case "Stop":
			return { systemMessage: text };
		case "PreToolUse":
		case "UserPromptSubmit":
		case "SessionStart":
			return {
				hookSpecificOutput: { hookEventName: event, additionalContext: text },
			};
	}
}

export function encodeClaudeCode(
	event: HookEventName,
	verdict: Verdict,
): HookOutput {
	switch (verdict.kind) {
		case "continue":
			return event === "Stop"
				? {
						stdout: `${JSON.stringify({ decision: "block", reason: verdict.prompt })}\n`,
						stderr: "",
						exit: 0,
					}
				: encodeBase(verdict);
		case "allow":
		case "deny":
			return encodeBase(verdict);
		case "note":
			return {
				stdout: `${JSON.stringify(noteOutput(event, verdict.text))}\n`,
				stderr: "",
				exit: 0,
			};
	}
}
