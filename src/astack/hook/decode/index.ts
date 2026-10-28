import type { HookEventName, Tool } from "../events.ts";
import { decodeClaudeCode } from "./claude-code.ts";
import type { DecodeDeps, Decoded } from "./types.ts";

export function decode(
	tool: Tool,
	event: HookEventName,
	raw: unknown,
	deps: DecodeDeps,
): Decoded | undefined {
	switch (tool) {
		case "claude-code":
			return decodeClaudeCode(event, raw, deps);
		case "codex":
		case "cursor":
		case "grok-build":
			return undefined;
	}
}
