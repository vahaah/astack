import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	applyHunks,
	applyPatchEvents,
	parsePatch,
	patchText,
} from "../../src/astack/hook/decode/apply-patch.ts";
import { processHookDeps, runHook } from "../../src/astack/hook/dispatch.ts";

const dirs: string[] = [];

afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function scratch(): string {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), "astack-patch-")));
	dirs.push(dir);
	return dir;
}

const PATCH = [
	"*** Begin Patch",
	"*** Add File: src/new.ts",
	"+export const a = 1;",
	"*** Update File: src/old.ts",
	"@@ export function f() {",
	" export function f() {",
	"-	return 1;",
	"+	return 2;",
	" }",
	"*** Delete File: src/gone.ts",
	"*** End Patch",
].join("\n");

describe("the apply_patch parser", () => {
	test("reads add, update and delete operations", () => {
		expect(parsePatch(PATCH)).toEqual([
			{ kind: "add", path: "src/new.ts", content: "export const a = 1;\n" },
			{
				kind: "update",
				path: "src/old.ts",
				moveTo: undefined,
				hunks: [
					{
						old: "export function f() {\n\treturn 1;\n}",
						new: "export function f() {\n\treturn 2;\n}",
					},
				],
			},
			{ kind: "delete", path: "src/gone.ts" },
		]);
	});

	test("reads a move and refuses text that is not a patch", () => {
		expect(
			parsePatch(
				"*** Begin Patch\n*** Update File: a.ts\n*** Move to: b.ts\n@@\n-x\n+y\n*** End Patch",
			),
		).toEqual([
			{
				kind: "update",
				path: "a.ts",
				moveTo: "b.ts",
				hunks: [{ old: "x", new: "y" }],
			},
		]);
		expect(parsePatch("echo hi")).toBeUndefined();
		expect(parsePatch("*** Begin Patch\n*** Add File: a\n+x")).toBeUndefined();
	});

	test("applies hunks in order and gives up when one does not match", () => {
		expect(
			applyHunks("a\nb\nc\nb\n", [
				{ old: "b", new: "B" },
				{ old: "b", new: "BB" },
			]),
		).toBe("a\nB\nc\nBB\n");
		expect(applyHunks("a\n", [{ old: "z", new: "y" }])).toBeUndefined();
	});

	test("takes the patch from a string or the last element of an argv", () => {
		expect(patchText("p")).toBe("p");
		expect(patchText(["apply_patch", "p"])).toBe("p");
		expect(patchText({})).toBeUndefined();
	});

	test("turns a patch into write events against the files on disk", () => {
		const files: Record<string, string> = {
			"/repo/src/old.ts": "export function f() {\n\treturn 1;\n}\n",
		};
		expect(applyPatchEvents(PATCH, "/repo", (path) => files[path])).toEqual([
			{
				kind: "write",
				path: "/repo/src/new.ts",
				before: undefined,
				after: "export const a = 1;\n",
			},
			{
				kind: "write",
				path: "/repo/src/old.ts",
				before: "export function f() {\n\treturn 1;\n}\n",
				after: "export function f() {\n\treturn 2;\n}\n",
			},
		]);
	});
});

describe("Codex apply_patch through the Claude hook", () => {
	test("denies a patch that adds a ticket tag comment", () => {
		const dir = scratch();
		writeFileSync(join(dir, "a.ts"), "export const a = 1;\n");
		const patch = [
			"*** Begin Patch",
			"*** Update File: a.ts",
			"@@",
			"+// ABC-123: now uses the new API",
			" export const a = 1;",
			"*** End Patch",
		].join("\n");
		const output = runHook(
			"claude-code",
			"PreToolUse",
			JSON.stringify({
				hook_event_name: "PreToolUse",
				cwd: dir,
				tool_name: "apply_patch",
				tool_input: { command: patch },
			}),
			{ CLAUDE_PROJECT_DIR: dir },
			{ ...processHookDeps(), cwd: dir },
		);
		expect(output.exit).toBe(2);
		expect(output.stderr).toContain("ABC-123");
	});
});
