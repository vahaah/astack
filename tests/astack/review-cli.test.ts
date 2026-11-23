import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CLI = resolve(import.meta.dir, "../../src/astack/cli/bin.ts");
const scratch = realpathSync(mkdtempSync(join(tmpdir(), "astack-review-")));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
let count = 0;

function git(root: string, ...args: string[]): string {
	const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
	if (result.status !== 0) throw new Error(result.stderr);
	return result.stdout.trim();
}

function commit(root: string, file: string): string {
	writeFileSync(join(root, file), `${file}\n`);
	git(root, "add", "-A");
	git(root, "commit", "-q", "-m", file);
	return git(root, "rev-parse", "HEAD");
}

function review(root: string, ...args: string[]) {
	const result = spawnSync(process.execPath, [CLI, "review", ...args], {
		cwd: root,
		encoding: "utf8",
	});
	return { code: result.status, out: result.stdout, err: result.stderr };
}

function cleanBranch() {
	count += 1;
	const root = join(scratch, `repo-${count}`);
	mkdirSync(root);
	git(root, "init", "-q", "-b", "main");
	git(root, "config", "user.email", "fixture@example.com");
	git(root, "config", "user.name", "Fixture");
	const base = commit(root, "base.txt");
	git(root, "checkout", "-q", "-b", "feature/x");
	const clean = commit(root, "clean.txt");
	const path = join(
		resolve(root, git(root, "rev-parse", "--git-common-dir")),
		"pr-review-hardening",
		"feature-x.review.json",
	);
	return { root, base, clean, path };
}

describe("astack review", () => {
	test("[control:review-cli-delta] a recorded clean head that HEAD holds gives delta: with exit 0", () => {
		const repo = cleanBranch();
		expect(
			review(repo.root, "record", "--base", "main", "--head", "HEAD"),
		).toEqual({
			code: 0,
			out: `ok: ${repo.path} holds 0 heads and 0 launches\n`,
			err: "",
		});
		expect(
			review(
				repo.root,
				"record",
				"--base",
				"main",
				"--head",
				"HEAD",
				"--decision",
				"stop_clean",
				"--launches",
				"4",
			),
		).toEqual({
			code: 0,
			out: `ok: ${repo.path} holds 1 heads and 4 launches\n`,
			err: "",
		});
		commit(repo.root, "fix.txt");
		expect(review(repo.root, "base", "--head", "HEAD")).toEqual({
			code: 0,
			out: [
				`baseSha: ${repo.base}`,
				`firstReviewedHead: ${repo.clean}`,
				"launches: 4",
				`delta: ${repo.clean}`,
				"",
			].join("\n"),
			err: "",
		});
	});

	test("[control:review-cli-keep] a stop at a later head keeps the first-review fields and adds the head to the stored record", () => {
		const repo = cleanBranch();
		review(
			repo.root,
			"record",
			"--base",
			"main",
			"--head",
			"HEAD",
			"--decision",
			"stop_clean",
			"--launches",
			"4",
		);
		const later = commit(repo.root, "later.txt");
		expect(
			review(
				repo.root,
				"record",
				"--base",
				"main",
				"--head",
				later,
				"--decision",
				"stop_recurring",
				"--launches",
				"2",
			),
		).toEqual({
			code: 0,
			out: `ok: ${repo.path} holds 2 heads and 6 launches\n`,
			err: "",
		});
		expect(review(repo.root, "base", "--head", "HEAD")).toEqual({
			code: 0,
			out: [
				`baseSha: ${repo.base}`,
				`firstReviewedHead: ${repo.clean}`,
				"launches: 6",
				`delta: ${repo.clean}`,
				"",
			].join("\n"),
			err: "",
		});
	});

	test.each(["a rebase", "a replace ref"])(
		"[control:review-cli-full] after %s, HEAD holds no clean head, so the base is full: with exit 3",
		(kind) => {
			const repo = cleanBranch();
			review(
				repo.root,
				"record",
				"--base",
				"main",
				"--head",
				"HEAD",
				"--decision",
				"stop_clean",
				"--launches",
				"2",
			);
			git(repo.root, "reset", "-q", "--hard", repo.base);
			const rebased = commit(repo.root, "rebased.txt");
			if (kind === "a replace ref")
				git(repo.root, "replace", "--graft", rebased, repo.clean);
			expect(review(repo.root, "base", "--head", "HEAD")).toEqual({
				code: 3,
				out: [
					`baseSha: ${repo.base}`,
					`firstReviewedHead: ${repo.clean}`,
					"launches: 2",
					"full: HEAD holds no stop_clean head of the record",
					"",
				].join("\n"),
				err: "",
			});
		},
	);

	test("[control:review-cli-no-record] a branch with no record gives full: with exit 3", () => {
		const repo = cleanBranch();
		expect(review(repo.root, "base", "--head", "HEAD")).toEqual({
			code: 3,
			out: `full: no review record at ${repo.path}\n`,
			err: "",
		});
	});

	test("[control:review-cli-unreadable] an unreadable record exits 1, and record never writes over it", () => {
		const repo = cleanBranch();
		review(repo.root, "record", "--base", "main", "--head", "HEAD");
		writeFileSync(repo.path, "{");
		const error = `astack review: the review record ${repo.path} is unreadable: not JSON. Repair or move it by hand\n`;
		expect(review(repo.root, "base", "--head", "HEAD")).toEqual({
			code: 1,
			out: "",
			err: error,
		});
		expect(
			review(
				repo.root,
				"record",
				"--base",
				"main",
				"--head",
				"HEAD",
				"--decision",
				"stop_clean",
				"--launches",
				"1",
			),
		).toEqual({ code: 1, out: "", err: error });
		expect(readFileSync(repo.path, "utf8")).toBe("{");
	});

	test.each([
		[["base"], "astack review base: give --head <ref>"],
		[
			[
				"record",
				"--base",
				"main",
				"--head",
				"HEAD",
				"--decision",
				"stop_clean",
			],
			"astack review record: give --decision and --launches together",
		],
		[
			[
				"record",
				"--base",
				"main",
				"--head",
				"HEAD",
				"--decision",
				"clean",
				"--launches",
				"1",
			],
			"astack review record: --decision must be one of stop_clean, stop_converged, stop_recurring, stop_principled_incompletion",
		],
		[
			[
				"record",
				"--base",
				"main",
				"--head",
				"HEAD",
				"--decision",
				"stop_clean",
				"--launches",
				"-1",
			],
			"astack review record: --launches must be a whole number",
		],
		[["merge"], "astack review: give base or record"],
	])("wrong arguments %j exit 2", (args, message) => {
		const repo = cleanBranch();
		expect(review(repo.root, ...args)).toEqual({
			code: 2,
			out: "",
			err: `${message}\n`,
		});
	});
});
