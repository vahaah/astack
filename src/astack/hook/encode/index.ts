import type { HookEventName, Tool, Verdict } from "../events.ts";
import { encodeBase, type HookOutput } from "./base.ts";
import { encodeClaudeCode } from "./claude-code.ts";

export function encode(
	tool: Tool,
	event: HookEventName,
	verdict: Verdict,
): HookOutput {
	switch (tool) {
		case "claude-code":
			return encodeClaudeCode(event, verdict);
		case "codex":
		case "cursor":
		case "grok-build":
			return encodeBase(verdict);
	}
}
