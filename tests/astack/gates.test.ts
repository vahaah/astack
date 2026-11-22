import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Io } from "../../src/astack/cli/io.ts";
import { main } from "../../src/astack/cli/main.ts";

const root = mkdtempSync(join(tmpdir(), "astack-gates-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function git(dir: string, ...args: string[]): string {
	return spawnSync("git", args, { cwd: dir, encoding: "utf8" }).stdout.trim();
}

type Gate = {
	readonly name: string;
	readonly command: string;
	readonly extra?: string;
};

function profile(gates: readonly Gate[], last: Gate): string {
	const entry = (gate: Gate, indent: string) =>
		[
			`name: ${gate.name}`,
			`command: ${JSON.stringify(gate.command)}`,
			...(gate.extra ?? "").split("\n").filter(Boolean),
		]
			.map((line, index) => `${index === 0 ? "" : indent}${line}`)
			.join("\n");
	return [
		"# Profile",
		"",
		"```yaml",
		"version: 1",
		"gates:",
		...gates.map((gate) => `  - ${entry(gate, "    ")}`),
		"test:",
		`  ${entry(last, "  ")}`,
		"```",
		"",
	].join("\n");
}

let count = 0;

function repo(gates: readonly Gate[], last: Gate): string {
	count++;
	const dir = join(root, `repo-${count}`);
	mkdirSync(join(dir, ".claude"), { recursive: true });
	mkdirSync(join(dir, "src"));
	git(dir, "init", "-q", "-b", "main");
	git(dir, "config", "user.email", "t@example.com");
	git(dir, "config", "user.name", "T");
	writeFileSync(
		join(dir, ".claude/pr-review-hardening.profile.md"),
		profile(gates, last),
	);
	writeFileSync(join(dir, "tracked.txt"), "a\n");
	writeFileSync(join(dir, "gen.txt"), "a\n");
	git(dir, "add", ".");
	git(dir, "commit", "-q", "-m", "base");
	git(dir, "checkout", "-q", "-b", "feature");
	writeFileSync(join(dir, "src/a.ts"), "export {};\n");
	git(dir, "add", ".");
	git(dir, "commit", "-q", "-m", "work");
	return dir;
}

function run(dir: string, env: Record<string, string> = {}) {
	let out = "";
	let err = "";
	const state = join(dir, "..", `state-${count}`);
	const io: Io = {
		out: (text) => {
			out += text;
		},
		err: (text) => {
			err += text;
		},
		cwd: dir,
		env: { ...process.env, ASTACK_STATE_DIR: state, ...env },
		today: "2026-11-22",
		now: new Date("2026-11-22T10:00:00Z"),
		scriptPath: undefined,
	};
	const head = git(dir, "rev-parse", "HEAD");
	const code = main(["gates", "run", "--base", "main"], io);
	const path = join(state, "gates", `${head}.json`);
	return {
		code,
		out,
		err,
		record: existsSync(path)
			? JSON.parse(readFileSync(path, "utf8"))
			: undefined,
	};
}

const PASS: Gate = { name: "test", command: "true" };

describe("astack gates run", () => {
	test("a run where each gate that applies exits 0 records HEAD, the base and the gates", () => {
		const dir = repo(
			[
				{
					name: "lint",
					command: 'test "$CI" = true && test "$MODE" = strict',
					extra: "ci_env:\n  - name: MODE\n    value: strict",
				},
				{
					name: "docs",
					command: "false",
					extra: "when_changed:\n  - 'docs/**'",
				},
				{
					name: "build",
					command: "echo b > gen.txt",
					extra:
						"when_changed:\n  - 'src/**'\nrewrites:\n  - path: gen.txt\n    why: the build writes it",
				},
			],
			PASS,
		);
		const result = run(dir);
		expect(result.code).toBe(0);
		expect(result.record).toEqual({
			head: git(dir, "rev-parse", "HEAD"),
			base: "main",
			baseSha: git(dir, "rev-parse", "main"),
			ran: ["lint", "build", "test"],
			skipped: ["docs"],
		});
		expect(result.out).toContain("DOCS_EXIT=SKIPPED");
		expect(git(dir, "status", "--porcelain")).toBe("");
	});

	test.each([
		["a red gate", [{ name: "lint", command: "exit 3" }], {}, "LINT_EXIT=3"],
		[
			"a missing env variable",
			[
				{
					name: "lint",
					command: "true",
					extra:
						"env:\n  - name: ASTACK_GATES_TOKEN\n    why: the lint reads it",
				},
			],
			{},
			"LINT_EXIT=NOT_STARTED",
		],
		[
			"a prerequisite that fails",
			[
				{
					name: "lint",
					command: "true",
					extra:
						"requires:\n  - name: db\n    check: 'false'\n    on_missing: stop",
				},
			],
			{},
			"LINT_EXIT=NOT_STARTED",
		],
		[
			"a tracked change outside rewrites",
			[{ name: "lint", command: "echo b > tracked.txt" }],
			{},
			"tracked.txt",
		],
		[
			"a moved HEAD",
			[{ name: "lint", command: "git commit -q --allow-empty -m moved" }],
			{},
			"HEAD moved",
		],
		[
			"a gate after a red gate",
			[
				{ name: "build", command: "false" },
				{ name: "e2e", command: "true", extra: "after:\n  - build" },
			],
			{},
			"E2E_EXIT=BLOCKED",
		],
	] as const)("%s records nothing", (_, gates, env, text) => {
		const dir = repo(gates, PASS);
		const result = run(dir, env);
		expect(result.code).toBe(1);
		expect(`${result.out}${result.err}`).toContain(text);
		expect(result.record).toBeUndefined();
	});

	test("a dirty tree records nothing and runs no gate", () => {
		const dir = repo([{ name: "lint", command: "touch ran.txt" }], PASS);
		writeFileSync(join(dir, "scratch.txt"), "x\n");
		const result = run(dir);
		expect(result.code).toBe(1);
		expect(result.err).toContain("scratch.txt");
		expect(existsSync(join(dir, "ran.txt"))).toBe(false);
		expect(result.record).toBeUndefined();
	});
});
