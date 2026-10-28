import { readFileSync } from "node:fs";
import { runCursorHook } from "../../hook/cursor.ts";
import { parseCursorEvent } from "../../hook/decode/cursor.ts";
import { runHook } from "../../hook/dispatch.ts";
import type { HookOutput } from "../../hook/encode/base.ts";
import { parseEventName, parseTool } from "../../hook/events.ts";
import type { Command } from "../command.ts";
import type { Io } from "../io.ts";

function readStdin(): string {
	try {
		return readFileSync(0, "utf8");
	} catch {
		return "";
	}
}

function outputFor(args: readonly string[], io: Io): HookOutput | undefined {
	const tool = parseTool(args[0]);
	if (tool === "cursor") {
		const event = parseCursorEvent(args[1]);
		return event === undefined
			? undefined
			: runCursorHook(event, readStdin(), io.env);
	}
	const event = parseEventName(args[1]);
	return tool === undefined || event === undefined
		? undefined
		: runHook(tool, event, readStdin(), io.env);
}

function run(args: readonly string[], io: Io): number {
	const output = outputFor(args, io);
	if (!output) return 0;
	if (output.stdout) io.out(output.stdout);
	if (output.stderr) io.err(output.stderr);
	return output.exit;
}

export const command: Command = {
	name: "hook",
	summary:
		"Reads a hook payload on stdin and runs the hook handlers. Exits 2 with the reason on stderr to deny. Fails open.",
	usage:
		"hook <claude-code|codex|grok-build> <event>\nhook cursor <cursor event>",
	run,
};
