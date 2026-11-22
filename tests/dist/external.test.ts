import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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
