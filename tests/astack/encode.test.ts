import { describe, expect, test } from "bun:test";
import { encodeBase, SILENT } from "../../src/astack/hook/encode/base.ts";
import { encode } from "../../src/astack/hook/encode/index.ts";
import {
	ALLOW,
	continueWith,
	deny,
	HOOK_EVENTS,
	note,
	TOOLS,
} from "../../src/astack/hook/events.ts";

describe("the base encoder", () => {
	test("denies and continues with exit 2 and the reason on stderr", () => {
		expect(encodeBase(deny("no"))).toEqual({
			stdout: "",
			stderr: "no\n",
			exit: 2,
		});
		expect(encodeBase(continueWith("again"))).toEqual({
			stdout: "",
			stderr: "again\n",
			exit: 2,
		});
	});

	test("allows in silence and drops a note", () => {
		expect(encodeBase(ALLOW)).toEqual(SILENT);
		expect(encodeBase(note("n"))).toEqual(SILENT);
	});

	test("every tool and event denies the same way", () => {
		for (const tool of TOOLS)
			for (const event of HOOK_EVENTS)
				expect(encode(tool, event, deny("no"))).toEqual(encodeBase(deny("no")));
	});
});

describe("the Claude Code adapter", () => {
	test("a note is additionalContext on PreToolUse, UserPromptSubmit and SessionStart", () => {
		for (const event of [
			"PreToolUse",
			"UserPromptSubmit",
			"SessionStart",
		] as const) {
			const output = encode("claude-code", event, note("look"));
			expect(output.exit).toBe(0);
			expect(output.stderr).toBe("");
			expect(JSON.parse(output.stdout)).toEqual({
				hookSpecificOutput: { hookEventName: event, additionalContext: "look" },
			});
		}
	});

	test("a rewrite on Stop is decision block JSON, which Claude Code and Codex both read", () => {
		expect(encode("claude-code", "Stop", continueWith("again"))).toEqual({
			stdout: '{"decision":"block","reason":"again"}\n',
			stderr: "",
			exit: 0,
		});
	});

	test("a note on Stop is a systemMessage", () => {
		expect(
			JSON.parse(encode("claude-code", "Stop", note("pushed")).stdout),
		).toEqual({ systemMessage: "pushed" });
	});

	test("allow prints nothing", () => {
		for (const event of HOOK_EVENTS)
			expect(encode("claude-code", event, ALLOW)).toEqual(SILENT);
	});
});
