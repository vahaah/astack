import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseHookList, readCodexHooks } from "../../src/astack/codex-hooks.ts";
import { CODEX_HOOK_EVENTS } from "../../src/astack/codex-trust.ts";
import { codexTrustKey } from "../../src/astack/doctor.ts";
import { fakeCodex, recordedReply } from "./codex-fake.ts";

const dirs: string[] = [];
afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function bin(): string {
	const dir = mkdtempSync(join(tmpdir(), "astack-codex-bin-"));
	dirs.push(dir);
	return dir;
}

function shellCodex(body: string): string {
	const dir = bin();
	writeFileSync(join(dir, "codex"), `#!/bin/sh\n${body}\n`);
	chmodSync(join(dir, "codex"), 0o755);
	return dir;
}

const read = (path: string, timeoutMs = 2000) =>
	readCodexHooks({ cwd: tmpdir(), env: { PATH: path }, timeoutMs });

describe("readCodexHooks", () => {
	test("[control:dt-reader-order] waits for the initialize reply, then reads the trust of each hook", async () => {
		const path = fakeCodex(bin(), { kind: "reply", reply: recordedReply() });
		const result = await read(path);
		expect(result.kind).toBe("listed");
		if (result.kind !== "listed") throw new Error(result.cause);
		expect(
			result.list.data.flatMap((entry) =>
				entry.hooks.map((hook) => [hook.key, hook.enabled, hook.trustStatus]),
			),
		).toEqual(
			["pre_tool_use", "session_start", "user_prompt_submit", "stop"].map(
				(event) => [codexTrustKey("astack@astack", event), true, "trusted"],
			),
		);
	});

	test.each([
		[
			"[control:dt-read-hang] a codex that hangs",
			() => shellCodex("exec /bin/sleep 30"),
			"codex app-server gave no hooks/list reply in 0.5 s",
		],
		[
			"[control:dt-read-exit] a codex that exits 1",
			() => shellCodex("exit 1"),
			"codex app-server exited with code 1 before the hooks/list reply",
		],
		[
			"[control:dt-read-rpc-error] a JSON-RPC error",
			() =>
				fakeCodex(bin(), {
					kind: "error",
					error: { code: -32601, message: "method not found" },
				}),
			"codex app-server answered hooks/list with error -32601: method not found",
		],
		[
			"[control:dt-read-no-codex] no codex on PATH",
			() => bin(),
			"no codex on PATH",
		],
	])("%s gives the cause before the deadline", async (_name, path, cause) => {
		const started = performance.now();
		expect(await read(path(), 500)).toEqual({ kind: "failed", cause });
		expect(performance.now() - started).toBeLessThan(2000);
	});
});

describe("parseHookList", () => {
	test("[control:dt-reader-shape] a reply with no trustStatus cannot be read", () => {
		const reply = recordedReply();
		const result = parseHookList({
			data: reply.result.data.map((entry) => ({
				...entry,
				hooks: entry.hooks.map(({ trustStatus: _dropped, ...hook }) => hook),
			})),
		});
		expect(result).toBeUndefined();
	});

	test("keeps the errors and warnings of each entry", () => {
		const reply = recordedReply();
		const result = parseHookList({
			data: [
				{
					...reply.result.data[0],
					errors: [{ path: "/codex-home/hooks.json", message: "bad matcher" }],
					warnings: ["slow hook"],
				},
			],
		});
		expect(result?.data[0]?.errors).toEqual([
			{ path: "/codex-home/hooks.json", message: "bad matcher" },
		]);
		expect(result?.data[0]?.warnings).toEqual(["slow hook"]);
		expect(result?.data[0]?.hooks).toHaveLength(CODEX_HOOK_EVENTS.length);
	});
});
