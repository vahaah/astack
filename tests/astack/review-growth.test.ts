import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CLI = resolve(import.meta.dir, "../../src/astack/cli/bin.ts");
const NAME = "astack check review-growth";
const scratch = realpathSync(
	mkdtempSync(join(tmpdir(), "astack-review-growth-")),
);
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
let count = 0;

type Run = { code: number | null; out: string; err: string };

function git(cwd: string, args: readonly string[]): string {
	const result = spawnSync("git", args, {
		cwd,
		encoding: "utf8",
		env: {
			...process.env,
			GIT_AUTHOR_NAME: "t",
			GIT_AUTHOR_EMAIL: "t@example.com",
			GIT_COMMITTER_NAME: "t",
			GIT_COMMITTER_EMAIL: "t@example.com",
		},
	});
	if (result.status !== 0)
		throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
	return result.stdout.trim();
}

function newRepo(): string {
	count += 1;
	const root = join(scratch, `repo-${count}`);
	mkdirSync(root, { recursive: true });
	git(root, ["init", "-q", "-b", "main"]);
	return root;
}

function commit(
	root: string,
	files: Readonly<Record<string, string | Buffer>>,
): string {
	for (const [path, content] of Object.entries(files))
		writeFileSync(join(root, path), content);
	git(root, ["add", "-A"]);
	git(root, ["commit", "-q", "-m", "c"]);
	return git(root, ["rev-parse", "HEAD"]);
}

const lines = (count: number, tag: string): string =>
	Array.from({ length: count }, (_, i) => `${tag} ${i}\n`).join("");

function growth(cwd: string, args: readonly string[]): Run {
	const result = spawnSync(
		process.execPath,
		[CLI, "check", "review-growth", ...args],
		{ cwd, encoding: "utf8" },
	);
	return { code: result.status, out: result.stdout, err: result.stderr };
}

const sizes = (churn: number) =>
	`threshold: 200 lines (the larger of 200 lines and 50% of the baseline churn of ${churn} lines)`;

describe("astack check review-growth", () => {
	test("reports no growth for the unchanged snapshot and a negative growth after a return to the base", () => {
		const root = newRepo();
		const base = commit(root, { "a.txt": "one\ntwo\nthree\n" });
		const first = commit(root, {
			"a.txt": "uno\ntwo\nthree\n",
			"b.txt": lines(10, "b"),
		});
		const same = growth(root, ["--base", base, "--first-reviewed", first]);
		expect(same.err).toBe("");
		expect(same.code).toBe(0);
		expect(same.out).toBe(
			[
				`base: ${base}`,
				`first-reviewed: ${first}`,
				`head: ${first}`,
				"baseline: 2 files, +11 -1, 0 binary files",
				"current: 2 files, +11 -1, 0 binary files",
				"net growth: 0 lines",
				sizes(12),
				"ok: net growth 0 lines does not exceed the threshold",
				"",
			].join("\n"),
		);
		const back = growth(root, [
			"--base",
			base,
			"--first-reviewed",
			first,
			"--head",
			base,
		]);
		expect(back.code).toBe(0);
		expect(back.out).toContain("current: 0 files, +0 -0, 0 binary files\n");
		expect(back.out).toContain("net growth: -12 lines\n");
	});

	test.each([
		["default threshold, growth at the line limit", [], 200, "ok"],
		["default threshold, growth one over the line limit", [], 201, "warn"],
		[
			"percent limit, growth at 50% of the baseline",
			["--max-growth-lines", "0", "--max-growth-percent", "50"],
			50,
			"ok",
		],
		[
			"percent limit, growth one over 50% of the baseline",
			["--max-growth-lines", "0", "--max-growth-percent", "50"],
			51,
			"warn",
		],
	])("%s", (_name, flags, extra, verdict) => {
		const root = newRepo();
		const base = commit(root, { "a.txt": "a\n" });
		const first = commit(root, { "f.txt": lines(100, "f") });
		const head = commit(root, { "g.txt": lines(extra, "g") });
		const run = growth(root, [
			"--base",
			base,
			"--first-reviewed",
			first,
			"--head",
			head,
			...flags,
		]);
		expect(run.code).toBe(0);
		expect(run.err).toBe("");
		const limit = flags.length === 0 ? "200" : "50";
		const last = run.out.trimEnd().split("\n").at(-1);
		expect(last).toBe(
			verdict === "ok"
				? `ok: net growth +${extra} lines does not exceed the threshold`
				: `warn: net growth +${extra} lines exceeds the threshold of ${limit} lines`,
		);
	});

	test("counts binary files apart, warns on added ones, and reads paths with a tab, a newline and a space", () => {
		const root = newRepo();
		const base = commit(root, { "text.txt": "x\n" });
		const first = commit(root, { "img.bin": Buffer.from([0, 1, 2, 0]) });
		const head = commit(root, {
			"img2.bin": Buffer.from([0, 9, 8, 0]),
			"tab\there.txt": "1\n2\n",
			"new\nline.txt": "1\n2\n3\n",
			"sp ace é.txt": "1\n",
		});
		const run = growth(root, [
			"--base",
			base,
			"--first-reviewed",
			first,
			"--head",
			head,
		]);
		expect(run.err).toBe("");
		expect(run.code).toBe(0);
		expect(run.out).toBe(
			[
				`base: ${base}`,
				`first-reviewed: ${first}`,
				`head: ${head}`,
				"baseline: 1 file, +0 -0, 1 binary file",
				"current: 5 files, +6 -0, 2 binary files",
				"net growth: +6 lines",
				sizes(0),
				"note: the line metric is incomplete, because git gives no line counts for binary files (baseline 1, current 2)",
				"warn: the current diff holds 1 binary file more than the baseline",
				"",
			].join("\n"),
		);
	});

	describe("refuses what it cannot prove", () => {
		const root = newRepo();
		const base = commit(root, { "a.txt": "a\n" });
		const first = commit(root, { "b.txt": "b\n" });
		git(root, ["tag", "-a", "-m", "t", "v1"]);
		const tag = git(root, ["rev-parse", "v1"]);
		const tree = git(root, ["rev-parse", "HEAD^{tree}"]);
		git(root, ["checkout", "-q", "--orphan", "other"]);
		const unrelated = commit(root, { "z.txt": "z\n" });
		git(root, ["checkout", "-q", "main"]);
		const missing = "0123456789abcdef0123456789abcdef01234567";
		const ok = ["--base", base, "--first-reviewed", first];

		test.each([
			[
				[],
				"give --base <full commit SHA> and --first-reviewed <full commit SHA>",
			],
			[
				["--base", "main", "--first-reviewed", first],
				"--base needs a full commit SHA of 40 or 64 lowercase hex digits, not main",
			],
			[[...ok, "--head"], "--head needs a value"],
			[[...ok, "--head", "--max-growth-lines", "3"], "--head needs a value"],
			[
				[...ok, "--max-growth-lines", "1.5"],
				"--max-growth-lines needs a whole number of 0 or more, not 1.5",
			],
			[
				[...ok, "--max-growth-percent", "abc"],
				"--max-growth-percent needs a number of 0 or more, not abc",
			],
			[
				[...ok, "--max-growth-percent", `1${"0".repeat(400)}`],
				`--max-growth-percent needs a number of 0 or more, not 1${"0".repeat(400)}`,
			],
			[[...ok, "--base", base], "--base is given twice"],
			[[...ok, "--verbose"], "unknown argument --verbose"],
		])("exits 2 for the arguments %p", (args, message) => {
			const run = growth(root, args);
			expect(run.out).toBe("");
			expect(run.err).toBe(`${NAME}: ${message}\n`);
			expect(run.code).toBe(2);
		});

		test.each([
			[
				"an id that is no object",
				["--base", missing, "--first-reviewed", first],
				`git cannot resolve --base ${missing} to a commit`,
			],
			[
				"the id of a tree",
				["--base", base, "--first-reviewed", tree],
				`git cannot resolve --first-reviewed ${tree} to a commit`,
			],
			[
				"the id of an annotated tag",
				["--base", base, "--first-reviewed", tag],
				`--first-reviewed ${tag} is not the id of a commit`,
			],
			[
				"a head ref that does not exist",
				[...ok, "--head", "no-such-ref"],
				"git cannot resolve --head no-such-ref to a commit",
			],
			[
				"a base that is no ancestor of the first reviewed commit",
				["--base", first, "--first-reviewed", base],
				`base ${first} is not an ancestor of first-reviewed ${base}`,
			],
			[
				"a first reviewed commit with unrelated history",
				["--base", base, "--first-reviewed", unrelated],
				`base ${base} is not an ancestor of first-reviewed ${unrelated}`,
			],
			[
				"a head with unrelated history",
				[...ok, "--head", unrelated],
				`base ${base} is not an ancestor of head ${unrelated}`,
			],
		])("exits 1 for %s and prints no report", (_name, args, message) => {
			const run = growth(root, args);
			expect(run.out).toBe("");
			expect(run.err).toBe(`${NAME}: ${message}\n`);
			expect(run.code).toBe(1);
		});

		test("exits 1 outside a git repository", () => {
			const outside = join(scratch, "not-a-repo");
			mkdirSync(outside);
			const run = growth(outside, ok);
			expect(run.out).toBe("");
			expect(run.err).toBe(`${NAME}: not inside a git repository\n`);
			expect(run.code).toBe(1);
		});
	});

	test("leaves refs, index, objects, and a dirty worktree as they were, and ignores the worktree", () => {
		const root = newRepo();
		const base = commit(root, { "a.txt": "a\n" });
		const first = commit(root, { "b.txt": lines(3, "b") });
		writeFileSync(join(root, "a.txt"), "changed\n");
		writeFileSync(join(root, "staged.txt"), "s\n");
		git(root, ["add", "staged.txt"]);
		writeFileSync(join(root, "untracked.txt"), lines(500, "u"));
		const snapshot = (): string[] => {
			const walk = (dir: string): string[] =>
				readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
					const path = join(dir, entry.name);
					const stat = statSync(path);
					return entry.isDirectory()
						? [`${path} dir ${stat.mtimeMs}`, ...walk(path)]
						: [
								`${path} ${stat.size} ${stat.mtimeMs} ${readFileSync(path).toString("hex")}`,
							];
				});
			return walk(root).sort();
		};
		const refs = () =>
			[
				git(root, ["status", "--porcelain=v1", "-z", "--ignored"]),
				git(root, ["for-each-ref"]),
				git(root, ["stash", "list"]),
				git(root, ["rev-parse", "HEAD"]),
			].join("\n");
		const refsBefore = refs();
		const before = snapshot();
		const run = growth(root, ["--base", base, "--first-reviewed", first]);
		expect(run.code).toBe(0);
		expect(run.out).toContain("current: 1 file, +3 -0, 0 binary files\n");
		expect(snapshot()).toEqual(before);
		expect(refs()).toBe(refsBefore);
	});
});
