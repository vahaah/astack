import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CLI = resolve(import.meta.dir, "../../src/astack/cli/bin.ts");
function findGit(): string {
	const found = Bun.which("git");
	if (found === null) throw new Error("git is not on PATH");
	return found;
}

const realGit = findGit();

const GH_SHIM = `#!/bin/sh
dir="$SHIM_DIR/gh"
n=$(( $(cat "$dir/count" 2>/dev/null || echo 0) + 1 ))
echo "$n" > "$dir/count"
{ for a in "$@"; do printf '%s\\n' "$a"; done; echo '--'; } >> "$dir/calls"
if [ ! -f "$dir/$n.code" ]; then
	echo "fake gh: call $n has no scripted response" >&2
	exit 99
fi
cat "$dir/$n.out"
cat "$dir/$n.err" >&2
exit "$(cat "$dir/$n.code")"
`;

const GIT_SHIM = `#!/bin/sh
{ for a in "$@"; do printf '%s\\n' "$a"; done; echo '--'; } >> "$SHIM_DIR/git.calls"
if [ "$1" = "$SHIM_FAIL_GIT" ]; then
	echo "fatal: injected failure of git $1" >&2
	exit 128
fi
if [ "$1" = "$SHIM_GARBLE_GIT" ]; then
	echo "not a commit id"
	exit 0
fi
exec "$REAL_GIT" "$@"
`;

const worlds: string[] = [];
afterAll(() => {
	for (const dir of worlds) rmSync(dir, { recursive: true, force: true });
});

type World = {
	readonly base: string;
	readonly work: string;
	readonly other: string;
	readonly bin: string;
	readonly state: string;
};

type Reply = {
	readonly code: number;
	readonly out: string;
	readonly err: string;
};

type Run = {
	readonly code: number | null;
	readonly out: string;
	readonly err: string;
	readonly gh: string[][];
	readonly git: string[][];
};

function git(cwd: string, ...args: string[]): string {
	const result = spawnSync(
		realGit,
		[
			"-c",
			"user.name=Test",
			"-c",
			"user.email=test@example.com",
			"-c",
			"commit.gpgsign=false",
			...args,
		],
		{
			cwd,
			encoding: "utf8",
			env: {
				PATH: "/usr/bin:/bin",
				GIT_CONFIG_GLOBAL: "/dev/null",
				GIT_CONFIG_NOSYSTEM: "1",
			},
		},
	);
	if (result.status !== 0)
		throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
	return result.stdout.trim();
}

function commit(cwd: string, subject: string): string {
	git(cwd, "commit", "-q", "--allow-empty", "-m", subject);
	return git(cwd, "rev-parse", "HEAD");
}

function createWorld(): World {
	const base = mkdtempSync(join(tmpdir(), "astack-pr-head-"));
	worlds.push(base);
	const origin = join(base, "origin.git");
	const work = join(base, "work");
	const other = join(base, "other");
	const bin = join(base, "bin");
	const state = join(base, "state");
	git(base, "init", "-q", "--bare", "-b", "main", origin);
	git(base, "clone", "-q", origin, work);
	git(work, "checkout", "-q", "-b", "feature");
	commit(work, "first");
	git(work, "push", "-q", "origin", "feature");
	git(base, "clone", "-q", "-b", "feature", origin, other);
	mkdirSync(bin);
	mkdirSync(join(state, "gh"), { recursive: true });
	for (const [name, text] of [
		["gh", GH_SHIM],
		["git", GIT_SHIM],
	] as const) {
		writeFileSync(join(bin, name), text);
		chmodSync(join(bin, name), 0o755);
	}
	return { base, work, other, bin, state };
}

function script(world: World, call: number, reply: Reply): void {
	const dir = join(world.state, "gh");
	writeFileSync(join(dir, `${call}.code`), `${reply.code}\n`);
	writeFileSync(join(dir, `${call}.out`), reply.out);
	writeFileSync(join(dir, `${call}.err`), reply.err);
}

function viewing(number: number, oid: string): Reply {
	return { code: 0, out: JSON.stringify({ number, headRefOid: oid }), err: "" };
}

function recorded(path: string): string[][] {
	if (!existsSync(path)) return [];
	const found: string[][] = [];
	let current: string[] = [];
	for (const line of readFileSync(path, "utf8").split("\n").slice(0, -1)) {
		if (line === "--") {
			found.push(current);
			current = [];
		} else current.push(line);
	}
	return found;
}

function astack(
	world: World,
	args: readonly string[],
	env: Readonly<Record<string, string>> = {},
): Run {
	rmSync(join(world.state, "git.calls"), { force: true });
	const before = recorded(join(world.state, "gh", "calls")).length;
	const result = spawnSync(
		process.execPath,
		[CLI, "check", "pr-head", ...args],
		{
			cwd: world.work,
			encoding: "utf8",
			env: {
				PATH: `${world.bin}:/usr/bin:/bin`,
				HOME: world.base,
				GIT_CONFIG_GLOBAL: "/dev/null",
				GIT_CONFIG_NOSYSTEM: "1",
				SHIM_DIR: world.state,
				REAL_GIT: realGit,
				...env,
			},
		},
	);
	return {
		code: result.status,
		out: result.stdout,
		err: result.stderr,
		gh: recorded(join(world.state, "gh", "calls")).slice(before),
		git: recorded(join(world.state, "git.calls")),
	};
}

const sequence = (oid: string): string[][] => [
	["fetch", "origin", oid],
	["rev-parse", "HEAD"],
	["merge-base", "--is-ancestor", oid, "HEAD"],
	["log", "--oneline", `${oid}..HEAD`],
];

describe("astack check pr-head", () => {
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
		const direct = spawnSync(realGit, ["fetch", "origin", missing], {
			cwd: world.work,
			encoding: "utf8",
			env: { PATH: "/usr/bin:/bin", GIT_CONFIG_GLOBAL: "/dev/null" },
		});
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
		const direct = spawnSync(realGit, ["rev-parse", "HEAD"], {
			cwd: world.work,
			encoding: "utf8",
			env: { PATH: "/usr/bin:/bin", GIT_CONFIG_GLOBAL: "/dev/null" },
		});
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
