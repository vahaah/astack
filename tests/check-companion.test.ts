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
import { exampleCompanionRoot } from "../scripts/lib/companion.ts";
import { repoRoot } from "../scripts/lib/projects.ts";

const dirs: string[] = [];

afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix: string): string {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
	dirs.push(dir);
	return dir;
}

function checkCompanion(args: readonly string[]) {
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

describe("bun run check:companion", () => {
	test("examines the one config and the 2 profiles of the example with no problem", () => {
		expect(checkCompanion([])).toEqual({
			code: 0,
			stdout: [
				`check:companion: 1 config(s) and 2 profile(s) in ${exampleCompanionRoot}, 0 problem(s)`,
			],
			stderr: [],
		});
	});

	const profile = "projects/acme/pr-review-hardening.profile.md";
	const overlay = "projects/acme/branches/v2/pr-review-hardening.profile.md";
	const printsSecret = (path: string) =>
		`profile scan: an entry of a profile prints no secret > ${path} has no command, setup or check that prints the keys of a stack, the environment, a .env file or a value of the session`;

	test.each<[string, string, string, string, (root: string) => string[]]>([
		[
			"a profile that does not define a key that the stub fallback reads",
			profile,
			"ledger:\n  carry_over: true\n",
			"",
			(root) => [
				`acme: ${profile}: the stub fallback reads ledger.carry_over, which the profile does not define`,
				`profile scan: keys the stub fallback reads > ${relative(repoRoot, join(root, profile))} defines every key the fallback reads`,
			],
		],
		[
			"an STE deny word in the prose of a profile",
			profile,
			"The loop reads the YAML block below.",
			"The loop utilizes the YAML block below.",
			() => [
				`${profile}: L3 word-list: Use "use", not "utilizes". Sentence: "The loop utilizes the YAML block below."`,
			],
		],
		[
			"a schema error in the YAML block of a profile",
			profile,
			"after_create_pr: harden\n",
			"after_create_pr: maybe\n",
			(root) => [
				`acme: ${profile}: after_create_pr: must be one of harden, none`,
				`profile scan: project profiles > ${relative(repoRoot, join(root, profile))} parses with no issues`,
				"profile scan: validateProfile > every repo runs one hardening run after create pr, with a cap of 2",
			],
		],
		[
			"a profile entry that prints a .env file",
			profile,
			"    command: bun run typecheck\n",
			"    command: bun run typecheck && cat .env\n",
			(root) => [printsSecret(join(root, profile))],
		],
		[
			"an entry of the profile of a branch overlay that prints a .env file",
			overlay,
			"    command: bun run typecheck\n",
			"    command: bun run typecheck && cat .env\n",
			(root) => [printsSecret(join(root, overlay))],
		],
	])(
		"fails on %s and names each problem",
		(_name, path, from, to, problems) => {
			const root = tempDir("astack-check-companion-");
			cpSync(exampleCompanionRoot, root, { recursive: true });
			writeFileSync(
				join(root, path),
				readFileSync(join(root, path), "utf8").replace(from, to),
			);
			expect(checkCompanion(["--companion", root])).toEqual({
				code: 1,
				stdout: [
					`check:companion: 1 config(s) and 2 profile(s) in ${root}, ${problems(root).length} problem(s)`,
				],
				stderr: problems(root),
			});
		},
	);

	test("fails on a config whose ste.mode the repo profile does not accept", () => {
		const root = tempDir("astack-check-companion-");
		cpSync(exampleCompanionRoot, root, { recursive: true });
		const config = join(root, "projects/acme.json");
		writeFileSync(
			config,
			readFileSync(config, "utf8").replace(
				'"mode": "deny"',
				'"mode": "strict"',
			),
		);
		expect(checkCompanion(["--companion", root])).toEqual({
			code: 1,
			stdout: [""],
			stderr: ["projects/acme.json:", '  ste.mode must be "deny" or "advise"'],
		});
	});

	test("reads the exception rows of the profile scans from the companion", () => {
		const root = tempDir("astack-check-companion-");
		cpSync(exampleCompanionRoot, root, { recursive: true });
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
		expect(checkCompanion(["--companion", root])).toEqual({
			code: 1,
			stdout: [
				`check:companion: 1 config(s) and 2 profile(s) in ${root}, 2 problem(s)`,
			],
			stderr: [
				"profile scan: the config of a long-lived local stack > each stack port of the table is named by an entry of its profile",
				"profile scan: a gate on a stack that an earlier gate seeded > the first gate of each job of the table resets the stack, and each row names a stack of its profile",
			],
		});
	});

	test("fails on a companion with no config, so it never passes with nothing to examine", () => {
		const root = tempDir("astack-check-companion-");
		mkdirSync(join(root, "projects"));
		expect(checkCompanion(["--companion", root])).toEqual({
			code: 1,
			stdout: [
				`check:companion: 0 config(s) and 0 profile(s) in ${root}, 1 problem(s)`,
			],
			stderr: [
				`${join(root, "projects")}: holds 0 project configs, so the gate examines no text that apply renders`,
			],
		});
	});
});
