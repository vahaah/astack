import { afterAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { git, scratchDir, writeFiles } from "./change-proof-fixture.ts";

const CLI = resolve(import.meta.dir, "../../src/astack/cli/bin.ts");
const root = scratchDir("astack-proof-migration-");
afterAll(() => rmSync(root, { recursive: true, force: true }));

test("[control:proof-migration-stop] a mixed tool adoption retains its CI-pin stop and review state", () => {
	git(root, "init", "-q", "-b", "main");
	const workflow = (version: string) =>
		`on: pull_request\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/setup-node@v4\n        with:\n          node-version: '${version}'\n      - run: echo check\n`;
	writeFiles(root, { ".github/workflows/check.yml": workflow("20") });
	git(root, "add", "-A");
	git(root, "commit", "-q", "-m", "baseline");
	const base = git(root, "rev-parse", "HEAD");
	const check = () =>
		spawnSync(process.execPath, [CLI, "check", "ci-pins", "--base", base], {
			cwd: root,
			encoding: "utf8",
		});
	const positive = check();
	expect(positive.status).toBe(0);
	expect(positive.stdout).toBe(
		"ok: the PR changes no CI file and no tool version that CI reads from a file\n",
	);
	const ledger = ".git/pr-review-hardening/adoption.json";
	const growth = ".git/pr-review-hardening/adoption.review.json";
	const profile = ".claude/pr-review-hardening.profile.md";
	writeFiles(root, {
		[ledger]: JSON.stringify({
			stopped: null,
			entries: [{ iteration: 2, status: "fixed" }],
		}),
		[growth]: JSON.stringify({ baseSha: base, firstReviewedHead: base }),
		[profile]: "version: 1\niterations: {min: 1, max: 2}\n",
	});
	const paths = [ledger, growth, profile];
	const before = paths.map((path) => readFileSync(join(root, path), "utf8"));
	writeFiles(root, {
		".github/workflows/check.yml": workflow("22"),
		"formal/Admission.tla": "---- MODULE Admission ----\nReady == TRUE\n====\n",
	});
	git(root, "add", "-A");
	git(root, "commit", "-q", "-m", "prepare adoption");
	const stopped = check();
	expect(stopped.status).toBe(1);
	expect(stopped.stdout).toContain("the PR changes this CI file");
	expect(stopped.stdout.trim().split("\n").at(-1)).toBe(
		"stop: only CI can prove this PR, for the reason in each line above",
	);
	expect(paths.map((path) => readFileSync(join(root, path), "utf8"))).toEqual(
		before,
	);
});
