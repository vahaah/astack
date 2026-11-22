import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { checkCompanion } from "../scripts/check-companion.ts";
import { exampleCompanionRoot } from "../scripts/lib/companion.ts";
import { repoRoot } from "../scripts/lib/projects.ts";
import { heavyTestTimeout } from "./heavy-test.ts";

const dirs: string[] = [];

afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix: string): string {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
	dirs.push(dir);
	return dir;
}

function runScript(args: readonly string[]) {
	const run = spawnSync("bun", ["scripts/check-companion.ts", ...args], {
		cwd: repoRoot,
		encoding: "utf8",
	});
	return {
		code: run.status,
		stdout: run.stdout.trim().split("\n"),
		stderr: run.stderr.trim().split("\n").filter(Boolean),
	};
}

const noScan = async (): Promise<string[]> => [];

function companionCopy(
	edits: readonly (readonly [path: string, from: string, to: string])[],
): string {
	const root = tempDir("astack-check-companion-");
	cpSync(exampleCompanionRoot, root, { recursive: true });
	for (const [path, from, to] of edits) {
		const text = readFileSync(join(root, path), "utf8");
		if (!text.includes(from)) throw new Error(`${path} holds no ${from}`);
		writeFileSync(join(root, path), text.replace(from, to));
	}
	return root;
}

describe("bun run check:companion", () => {
	test("examines the one config and the 2 profiles of the example with no problem", async () => {
		expect(await checkCompanion([], noScan)).toEqual({
			code: 0,
			out: [
				`check:companion: 1 config(s) and 2 profile(s) in ${exampleCompanionRoot}, 0 problem(s)`,
			],
			err: [],
		});
	});

	const profile = "projects/acme/pr-review-hardening.profile.md";
	const overlay = "projects/acme/branches/v2/pr-review-hardening.profile.md";
	const printsSecret = (root: string, path: string) =>
		`profile scan: an entry of a profile prints no secret > ${join(root, path)} has no command, setup or check that prints the keys of a stack, the environment, a .env file or a value of the session`;

	test(
		"[control:fx-real-scan] runs the real profile scans once, with the exception rows of the companion, and names each problem of a fallback key, a schema error and a .env entry of a profile and of a branch overlay",
		() => {
			const typecheck = "    command: bun run typecheck\n";
			const printsEnv = "    command: bun run typecheck && cat .env\n";
			const root = companionCopy([
				[profile, "ledger:\n  carry_over: true\n", ""],
				[profile, "after_create_pr: harden\n", "after_create_pr: maybe\n"],
				[profile, typecheck, printsEnv],
				[overlay, typecheck, printsEnv],
			]);
			writeFileSync(
				join(root, "profile-scan.json"),
				JSON.stringify({
					stacks: [
						{
							profile: "acme",
							stack: "db/supabase",
							reset: null,
							oneJob: [],
							watch: [],
							ports: ["54329"],
							why: "A row of a stack that no gate of acme starts.",
						},
					],
				}),
			);
			const scanned = relative(repoRoot, join(root, profile));
			const problems = [
				`acme: ${profile}: after_create_pr: must be one of harden, none. Change it as references/profile.md of the pr-review-hardening skill says`,
				`acme: ${profile}: the stub fallback reads ledger.carry_over, which the profile does not define. Define each key as references/profile.md of the pr-review-hardening skill says`,
				`profile scan: keys the stub fallback reads > ${scanned} defines every key the fallback reads`,
				`profile scan: project profiles > ${scanned} parses with no issues`,
				"profile scan: validateProfile > every repo runs one hardening run after create pr, with a cap of 2",
				printsSecret(root, overlay),
				printsSecret(root, profile),
				"profile scan: the config of a long-lived local stack > each stack port of the table is named by an entry of its profile",
				"profile scan: a gate on a stack that an earlier gate seeded > the first gate of each job of the table resets the stack, and each row names a stack of its profile",
			];
			expect(runScript(["--companion", root])).toEqual({
				code: 1,
				stdout: [
					`check:companion: 1 config(s) and 2 profile(s) in ${root}, ${problems.length} problem(s)`,
				],
				stderr: problems,
			});
		},
		heavyTestTimeout,
	);

	test("fails on an STE deny word in the prose of a profile and names the finding", async () => {
		const root = companionCopy([
			[
				profile,
				"The loop reads the YAML block below.",
				"The loop utilizes the YAML block below.",
			],
		]);
		expect(await checkCompanion(["--companion", root], noScan)).toEqual({
			code: 1,
			out: [
				`check:companion: 1 config(s) and 2 profile(s) in ${root}, 1 problem(s)`,
			],
			err: [
				`${profile}: L3 word-list: Use "use", not "utilizes". Sentence: "The loop utilizes the YAML block below."`,
			],
		});
	});

	test("fails on a config whose ste.mode the repo profile does not accept", async () => {
		const root = companionCopy([
			["projects/acme.json", '"mode": "deny"', '"mode": "strict"'],
		]);
		expect(await checkCompanion(["--companion", root], noScan)).toEqual({
			code: 1,
			out: [],
			err: ['projects/acme.json:\n  ste.mode must be "deny" or "advise"'],
		});
	});

	test("fails on a companion with no config, so it never passes with nothing to examine", async () => {
		const root = tempDir("astack-check-companion-");
		mkdirSync(join(root, "projects"));
		expect(await checkCompanion(["--companion", root], noScan)).toEqual({
			code: 1,
			out: [
				`check:companion: 0 config(s) and 0 profile(s) in ${root}, 1 problem(s)`,
			],
			err: [
				`${join(root, "projects")}: holds 0 project configs, so the gate examines no text that apply renders`,
			],
		});
	});
});
