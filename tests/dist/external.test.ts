import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { codexHashFindings } from "../../scripts/dist/external.ts";
import {
	type CodexHooksRead,
	parseHookList,
} from "../../src/astack/codex-hooks.ts";
import { CODEX_HOOK_HASHES } from "../../src/astack/codex-trust.ts";
import { codexTrustKey } from "../../src/astack/doctor.ts";
import {
	type RecordedReply,
	recordedReply,
	withHook,
} from "../astack/codex-fake.ts";
import { envWithoutCompanion } from "../child-env.ts";

const root = resolve(import.meta.dir, "../..");
const bin = mkdtempSync(join(tmpdir(), "external-bin-"));
symlinkSync(process.execPath, join(bin, "bun"));

afterAll(() => rmSync(bin, { recursive: true, force: true }));

test.each([
	{
		tool: "claude",
		call: "claudeValidate([], process.cwd(), [])",
		expected: {
			id: "claude-validate",
			errors: [],
			summary: "no claude on PATH, so the check cannot run",
			skipped: true,
		},
	},
	{
		tool: "codex",
		call: "codexProbe(process.cwd(), [])",
		expected: {
			id: "codex",
			errors: [],
			summary: "no codex on PATH, so the check cannot run",
			skipped: true,
		},
	},
])(
	"a probe with no $tool on PATH reports a labelled skip, not a pass",
	({ call, expected }) => {
		const run = Bun.spawnSync(
			[
				"bun",
				"-e",
				`import { claudeValidate, codexProbe } from "./scripts/dist/external.ts"; console.log(JSON.stringify(${call}));`,
			],
			{ cwd: root, env: { ...envWithoutCompanion(), PATH: bin } },
		);
		expect({
			stderr: run.stderr.toString(),
			report: JSON.parse(run.stdout.toString()),
		}).toEqual({ stderr: "", report: expected });
	},
);

describe("codexHashFindings", () => {
	const listed = (reply: RecordedReply): CodexHooksRead => {
		const list = parseHookList(reply.result);
		if (list === undefined) throw new Error("the reply does not parse");
		return { kind: "listed", list };
	};

	test("[control:dt-dist-cause] a failed hooks/list read names its cause", () => {
		expect(
			codexHashFindings({
				kind: "failed",
				cause: "codex app-server gave no hooks/list reply in 30 s",
			}),
		).toEqual([
			"codex app-server hooks/list failed: codex app-server gave no hooks/list reply in 30 s",
		]);
	});

	test("compares the first part of each current hash with its pin", () => {
		const key = codexTrustKey("astack@astack", "stop");
		expect(codexHashFindings(listed(recordedReply()))).toEqual([]);
		expect(
			codexHashFindings(
				listed(withHook(key, { currentHash: "sha256:new/sha256:content" })),
			),
		).toEqual([
			`Codex shows sha256:new for ${key}, but src/astack/codex-trust.ts pins ${CODEX_HOOK_HASHES.stop}. Update the pin when hooks.json changes on purpose.`,
		]);
	});
});
