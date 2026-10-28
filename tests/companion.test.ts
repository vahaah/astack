import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, relative } from "node:path";
import { parseArgs } from "../scripts/apply.ts";
import {
	COMPANION_ENV,
	type Companion,
	companionFrom,
	exampleCompanionRoot,
	openCompanion,
	writable,
} from "../scripts/lib/companion.ts";
import { sha256 } from "../scripts/lib/neutrality.ts";
import { repoRoot } from "../scripts/lib/projects.ts";

describe("companionFrom", () => {
	test.each<[string, string | undefined, string | undefined, Companion]>([
		[
			"the flag wins over the variable",
			"/srv/flag-companion",
			"/srv/env-companion",
			{ source: "flag", root: "/srv/flag-companion" },
		],
		[
			"the variable wins over the example",
			undefined,
			"/srv/env-companion",
			{ source: "env", root: "/srv/env-companion" },
		],
		[
			"the example is the default",
			undefined,
			undefined,
			{ source: "example", root: join(repoRoot, "examples", "companion") },
		],
		[
			"an empty variable takes the example",
			undefined,
			"",
			{ source: "example", root: join(repoRoot, "examples", "companion") },
		],
		[
			"a relative flag resolves against the current folder",
			"companion-here",
			undefined,
			{ source: "flag", root: join(process.cwd(), "companion-here") },
		],
		[
			"a home variable expands",
			undefined,
			"~/companion-home",
			{ source: "env", root: join(homedir(), "companion-home") },
		],
	])("%s", (_name, flag, value, expected) => {
		const env = value === undefined ? {} : { [COMPANION_ENV]: value };
		expect(companionFrom(flag, env)).toEqual(expected);
	});
});

describe("writable", () => {
	test("refuses the synthetic example", () => {
		expect(writable({ source: "example", root: exampleCompanionRoot })).toEqual(
			{
				ok: false,
				error: `${exampleCompanionRoot} is the synthetic example companion. Pass --companion <dir> or set ${COMPANION_ENV} to write.`,
			},
		);
	});

	test("accepts a companion from the flag or the variable", () => {
		const companion: Companion = { source: "env", root: "/srv/companion" };
		expect(writable(companion)).toEqual({ ok: true, value: companion });
	});
});

describe("openCompanion", () => {
	test("refuses a root with no projects folder and names the root", () => {
		const root = mkdtempSync(join(tmpdir(), "astack-companion-"));
		expect(openCompanion(root, {})).toEqual({
			ok: false,
			error: `${root} holds no projects/ folder`,
		});
	});

	test("opens a root with a projects folder", () => {
		const root = mkdtempSync(join(tmpdir(), "astack-companion-"));
		mkdirSync(join(root, "projects"));
		expect(openCompanion(root, {})).toEqual({
			ok: true,
			value: { source: "flag", root },
		});
	});
});

describe("the --companion flag of apply", () => {
	test("passes the folder to a project apply", () => {
		expect(
			parseArgs(["--project", "acme", "--dry-run", "--companion", "c"]),
		).toMatchObject({ mode: "project", name: "acme", companion: "c" });
		expect(
			parseArgs(["--project", "acme", "--worktree", "--companion", "c"]),
		).toMatchObject({ mode: "worktree", name: "acme", companion: "c" });
	});

	test("does not apply to --global", () => {
		expect(parseArgs(["--global", "--companion", "c"])).toBe(
			"--global takes only --dry-run",
		);
	});
});

describe("the test preload", () => {
	test("a test run reads the example and writes no deny list while the shell names another companion", () => {
		const root = mkdtempSync(join(tmpdir(), "astack-preload-"));
		mkdirSync(join(root, "projects"));
		mkdirSync(join(root, "deny"));
		const list = `${sha256("zorblax")}\n`;
		writeFileSync(join(root, "deny/names.sha256"), list);
		writeFileSync(join(root, "deny/canary"), "zorblax\n");
		const run = spawnSync(
			"bun",
			["test", "./tests/fixtures/preload/companion-probe.ts"],
			{
				cwd: repoRoot,
				encoding: "utf8",
				env: { ...process.env, [COMPANION_ENV]: root },
			},
		);
		expect({
			code: run.status,
			list: readFileSync(join(root, "deny/names.sha256"), "utf8"),
		}).toEqual({ code: 0, list });
	});

	test("no other test file names the companion variable", async () => {
		const testsDir = join(repoRoot, "tests");
		const allowed = [
			"tests/preload.ts",
			"tests/child-env.ts",
			"tests/companion.test.ts",
			"tests/apply/companion-flag.test.ts",
		];
		const files = await Array.fromAsync(
			new Bun.Glob("**/*.ts").scan({ cwd: testsDir }),
		);
		const naming = files
			.map((file) => relative(repoRoot, join(testsDir, file)))
			.filter((path) => !allowed.includes(path))
			.filter((path) => {
				const text = readFileSync(join(repoRoot, path), "utf8");
				return text.includes(COMPANION_ENV) || /\bCOMPANION_ENV\b/.test(text);
			});
		expect(naming).toEqual([]);
	});
});
