import { afterAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	astack,
	commit,
	createWorld,
	git,
	gitResult,
	removeWorlds,
	script,
	sequence,
	viewing,
} from "./pr-head-harness.ts";

afterAll(removeWorlds);

describe("astack check pr-head", () => {
	test("a signalled gh keeps its original diagnostic and stops before Git", () => {
		const world = createWorld();
		writeFileSync(
			join(world.bin, "gh"),
			"#!/bin/sh\nprintf 'original process diagnostic\\n' >&2\nkill -TERM $$\n",
		);
		const run = astack(world, []);
		expect(run.code).toBe(1);
		expect(run.out).toBe("stop: gh pr view did not finish\n");
		expect(run.err).toBe(
			"original process diagnostic\ngh pr view: ended by signal SIGTERM\n",
		);
		expect(run.git).toEqual([]);
	});

	test("a local branch at the PR head exits 0, names both heads and the empty unpushed list, and runs each operation in order", () => {
		const world = createWorld();
		const head = git(world.work, "rev-parse", "HEAD");
		script(world, 1, viewing(12, head));
		const run = astack(world, []);
		expect(run.out).toBe(
			`PR=12\nHEAD=${head}\nPR_HEAD=${head}\nUNPUSHED: none\nok: HEAD equals PR_HEAD\n`,
		);
		expect(run.err).toBe("");
		expect(run.code).toBe(0);
		expect(run.gh).toEqual([["pr", "view", "--json", "number,headRefOid"]]);
		expect(run.git).toEqual(sequence(head));
	});

	test("a local descendant of the PR head exits 0 and lists each unpushed commit, newest first, before the last line", () => {
		const world = createWorld();
		const pushed = git(world.work, "rev-parse", "HEAD");
		const second = commit(world.work, "second");
		const third = commit(world.work, "third");
		script(world, 1, viewing(12, pushed));
		const run = astack(world, []);
		expect(run.out).toBe(
			[
				"PR=12",
				`HEAD=${third}`,
				`PR_HEAD=${pushed}`,
				"UNPUSHED:",
				`${third.slice(0, 7)} third`,
				`${second.slice(0, 7)} second`,
				"ok: HEAD descends from PR_HEAD",
				"",
			].join("\n"),
		);
		expect(run.err).toBe("");
		expect(run.code).toBe(0);
		expect(run.git).toEqual(sequence(pushed));
	});

	test("an explicit PR number goes to gh as an argument and names that PR", () => {
		const world = createWorld();
		const head = git(world.work, "rev-parse", "HEAD");
		script(world, 1, viewing(34, head));
		const run = astack(world, ["--pr", "34"]);
		expect(run.gh).toEqual([
			["pr", "view", "34", "--json", "number,headRefOid"],
		]);
		expect(run.out).toStartWith("PR=34\n");
		expect(run.code).toBe(0);
	});

	test("a PR head that only the remote holds stops the run after the ancestry check, with no unpushed list", () => {
		const world = createWorld();
		const local = git(world.work, "rev-parse", "HEAD");
		const remote = commit(world.other, "remote only");
		git(world.other, "push", "-q", "origin", "feature");
		script(world, 1, viewing(12, remote));
		const run = astack(world, []);
		expect(run.out).toBe(
			`PR=12\nHEAD=${local}\nPR_HEAD=${remote}\nstop: HEAD does not hold PR_HEAD, so pull the PR branch first\n`,
		);
		expect(run.err).toBe("");
		expect(run.code).toBe(1);
		expect(run.git).toEqual(sequence(remote).slice(0, 3));
	});

	test("a diverged history stops the run in the same way", () => {
		const world = createWorld();
		const local = commit(world.work, "local only");
		const remote = commit(world.other, "remote only");
		git(world.other, "push", "-q", "origin", "feature");
		script(world, 1, viewing(12, remote));
		const run = astack(world, []);
		expect(run.out).toBe(
			`PR=12\nHEAD=${local}\nPR_HEAD=${remote}\nstop: HEAD does not hold PR_HEAD, so pull the PR branch first\n`,
		);
		expect(run.code).toBe(1);
		expect(run.git).toEqual(sequence(remote).slice(0, 3));
	});

	test("a later call reads the PR head again, so a head that moved after an ok result stops the run", () => {
		const world = createWorld();
		const head = git(world.work, "rev-parse", "HEAD");
		script(world, 1, viewing(12, head));
		const first = astack(world, []);
		expect(first.code).toBe(0);
		const moved = commit(world.other, "moved");
		git(world.other, "push", "-q", "origin", "feature");
		script(world, 2, viewing(12, moved));
		const second = astack(world, []);
		expect(second.code).toBe(1);
		expect(second.out).toContain(`PR_HEAD=${moved}\n`);
		expect(second.gh).toEqual([["pr", "view", "--json", "number,headRefOid"]]);
		expect(second.git[0]).toEqual(["fetch", "origin", moved]);
	});

	describe.each([
		['no pull requests found for branch "feature"\n'],
		['No pull requests found for branch "feature"\n'],
	])("gh reports %j on the current branch", (message) => {
		test("the run has no PR: exit 3, the original gh error on stderr, and no git operation", () => {
			const world = createWorld();
			script(world, 1, { code: 1, out: "", err: message });
			const run = astack(world, []);
			expect(run.out).toBe("no_pr: the current branch has no pull request\n");
			expect(run.err).toBe(message);
			expect(run.code).toBe(3);
			expect(run.gh).toEqual([["pr", "view", "--json", "number,headRefOid"]]);
			expect(run.git).toEqual([]);
		});
	});

	test("an explicit PR never gives no_pr: the same gh answer stops the run", () => {
		const world = createWorld();
		const message = 'no pull requests found for branch "feature"\n';
		script(world, 1, { code: 1, out: "", err: message });
		const run = astack(world, ["--pr", "34"]);
		expect(run.out).toBe("stop: gh pr view exited 1\n");
		expect(run.err).toBe(message);
		expect(run.code).toBe(1);
		expect(run.git).toEqual([]);
	});

	test.each([
		[
			"a login failure",
			{ code: 1, out: "", err: "HTTP 401: Bad credentials\n" },
		],
		["a failure with no message", { code: 1, out: "", err: "" }],
		[
			"another not-found message",
			{ code: 1, out: "", err: "no pull requests found\n" },
		],
		[
			"the no-PR message with another exit code",
			{
				code: 2,
				out: "",
				err: 'no pull requests found for branch "feature"\n',
			},
		],
	])(
		"%s on the current branch stops the run with the original gh error",
		(_, reply) => {
			const world = createWorld();
			script(world, 1, reply);
			const run = astack(world, []);
			expect(run.out).toBe(`stop: gh pr view exited ${reply.code}\n`);
			expect(run.err).toBe(reply.err);
			expect(run.code).toBe(1);
			expect(run.git).toEqual([]);
		},
	);

	test("a gh that cannot start stops the run", () => {
		const world = createWorld();
		const run = astack(world, [], { PATH: "/usr/bin:/bin" });
		expect(run.out).toBe("stop: gh pr view did not finish\n");
		expect(run.err).toContain("gh");
		expect(run.code).toBe(1);
		expect(run.git).toEqual([]);
	});

	const oid = "a".repeat(40);
	test.each([
		["output that is not JSON", "not json"],
		["output with no head commit", '{"number":12}'],
		["output that is null", "null"],
		["a PR number of zero", `{"number":0,"headRefOid":"${oid}"}`],
		["a PR number with a fraction", `{"number":1.5,"headRefOid":"${oid}"}`],
		["a short head commit", `{"number":12,"headRefOid":"${"a".repeat(39)}"}`],
		[
			"a head commit between the two valid lengths",
			`{"number":12,"headRefOid":"${"a".repeat(50)}"}`,
		],
		[
			"a head commit in upper case",
			`{"number":12,"headRefOid":"${"A".repeat(40)}"}`,
		],
	])("%s stops the run before any git operation", (_, out) => {
		const world = createWorld();
		script(world, 1, { code: 0, out, err: "" });
		const run = astack(world, []);
		expect(run.out).toBe(
			"stop: gh pr view printed no valid PR number and head commit ID\n",
		);
		expect(run.code).toBe(1);
		expect(run.git).toEqual([]);
	});

	test("a failed fetch stops the run with the original git error and no later operation", () => {
		const world = createWorld();
		const missing = "1".repeat(40);
		const direct = gitResult(world.work, "fetch", "origin", missing);
		expect(direct.status).not.toBe(0);
		script(world, 1, viewing(12, missing));
		const run = astack(world, []);
		expect(run.out).toBe("stop: git fetch exited 128\n");
		expect(run.err).toBe(direct.stderr);
		expect(run.code).toBe(1);
		expect(run.git).toEqual([["fetch", "origin", missing]]);
	});

	test("a failed rev-parse stops the run before the ancestry check", () => {
		const world = createWorld();
		const head = git(world.work, "rev-parse", "HEAD");
		git(world.work, "checkout", "-q", "--orphan", "unborn");
		const direct = gitResult(world.work, "rev-parse", "HEAD");
		script(world, 1, viewing(12, head));
		const run = astack(world, []);
		expect(run.out).toBe("stop: git rev-parse HEAD exited 128\n");
		expect(run.err).toBe(direct.stderr);
		expect(run.code).toBe(1);
		expect(run.git).toEqual(sequence(head).slice(0, 2));
	});

	test("a rev-parse that prints no commit ID stops the run before the ancestry check", () => {
		const world = createWorld();
		const head = git(world.work, "rev-parse", "HEAD");
		script(world, 1, viewing(12, head));
		const run = astack(world, [], { SHIM_GARBLE_GIT: "rev-parse" });
		expect(run.out).toBe("stop: git rev-parse HEAD printed no commit ID\n");
		expect(run.code).toBe(1);
		expect(run.git).toEqual(sequence(head).slice(0, 2));
	});

	test("an ancestry check that fails with an error stops the run, with the original git error and no log", () => {
		const world = createWorld();
		const head = git(world.work, "rev-parse", "HEAD");
		script(world, 1, viewing(12, head));
		const run = astack(world, [], { SHIM_FAIL_GIT: "merge-base" });
		expect(run.out).toBe(
			`PR=12\nHEAD=${head}\nPR_HEAD=${head}\nstop: git merge-base --is-ancestor exited 128\n`,
		);
		expect(run.err).toBe("fatal: injected failure of git merge-base\n");
		expect(run.code).toBe(1);
		expect(run.git).toEqual(sequence(head).slice(0, 3));
	});

	test("a failed log stops the run and never prints ok", () => {
		const world = createWorld();
		const head = git(world.work, "rev-parse", "HEAD");
		script(world, 1, viewing(12, head));
		const run = astack(world, [], { SHIM_FAIL_GIT: "log" });
		expect(run.out).toBe(
			`PR=12\nHEAD=${head}\nPR_HEAD=${head}\nstop: git log exited 128\n`,
		);
		expect(run.err).toBe("fatal: injected failure of git log\n");
		expect(run.code).toBe(1);
		expect(run.git).toEqual(sequence(head));
	});

	test.each([
		["a missing value", ["--pr"]],
		["a name", ["--pr", "feature"]],
		["a number with a fraction", ["--pr", "1.5"]],
		["zero", ["--pr", "0"]],
		["a leading zero", ["--pr", "012"]],
		["a number with no flag", ["12"]],
		["an extra argument", ["--pr", "5", "extra"]],
	])("%s is a usage error: exit 2, no output, and no operation", (_, args) => {
		const world = createWorld();
		const run = astack(world, args);
		expect(run.code).toBe(2);
		expect(run.out).toBe("");
		expect(run.err).toBe(
			"astack check pr-head: give no argument, or --pr <n> with a positive whole number\n",
		);
		expect(run.gh).toEqual([]);
		expect(run.git).toEqual([]);
	});
});
