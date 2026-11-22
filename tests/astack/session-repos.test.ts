import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	loadSessionRepos,
	probeRepo,
	type RepoIdentity,
	type RepoProbe,
	type SessionRepos,
	saveSessionRepos,
	sessionRepoAt,
	settleRepos,
} from "../../src/astack/session-repos.ts";

const IDENTITY: RepoIdentity = {
	gitDir: "/w/made/.git",
	device: "1",
	inode: "2",
	birth: "3",
};

function probe(root: string, gitDir: string, commonDir: string): RepoProbe {
	return { root, commonDir, identity: { ...IDENTITY, gitDir } };
}

describe("[control:sg-session-repo-store] the settle of the session repo record", () => {
	const bound: SessionRepos = [
		{ kind: "bound", path: "/w/old", identity: IDENTITY },
	];

	test.each<[string, RepoProbe | undefined, SessionRepos]>([
		[
			"a repo root with its own git dir binds",
			probe("/w/made", "/w/made/.git", "/w/made/.git"),
			[{ kind: "bound", path: "/w/made", identity: IDENTITY }],
		],
		[
			"a worktree with a git dir under the worktrees folder binds",
			probe("/w/made", "/w/main/.git/worktrees/made", "/w/main/.git"),
			[
				{
					kind: "bound",
					path: "/w/made",
					identity: { ...IDENTITY, gitDir: "/w/main/.git/worktrees/made" },
				},
			],
		],
		["a path that is no repo drops", undefined, []],
		[
			"a folder inside another repo drops",
			probe("/w", "/w/.git", "/w/.git"),
			[],
		],
		[
			"a repo with a separate git dir drops",
			probe("/w/made", "/other/.git", "/other/.git"),
			[],
		],
	])("%s", (_, seen, settled) => {
		const probes = new Map(seen === undefined ? [] : [["/w/made", seen]]);
		expect(
			settleRepos([...bound, { kind: "pending", path: "/w/made" }], probes),
		).toEqual([...bound, ...settled]);
	});
});

describe("[control:sg-session-repo-match] the match of a session repo", () => {
	const repos: SessionRepos = [
		{ kind: "bound", path: "/w/made", identity: IDENTITY },
		{ kind: "pending", path: "/w/later" },
	];

	test.each<[string, string, RepoIdentity, boolean]>([
		["the same root and identity match", "/w/made", IDENTITY, true],
		["another root does not match", "/w/other", IDENTITY, false],
		["a pending path does not match", "/w/later", IDENTITY, false],
		[
			"another git dir does not match",
			"/w/made",
			{ ...IDENTITY, gitDir: "/x/.git" },
			false,
		],
		[
			"another device does not match",
			"/w/made",
			{ ...IDENTITY, device: "9" },
			false,
		],
		[
			"another inode does not match",
			"/w/made",
			{ ...IDENTITY, inode: "9" },
			false,
		],
		[
			"another birth time does not match",
			"/w/made",
			{ ...IDENTITY, birth: "9" },
			false,
		],
	])("%s", (_, root, identity, matches) => {
		expect(sessionRepoAt(repos, root, identity)).toBe(matches);
	});
});

describe("[control:sg-session-repo-edge] the edge of the session repo record", () => {
	let root = "";
	const session = "session-1";
	const record: SessionRepos = [
		{ kind: "pending", path: "/w/later" },
		{ kind: "bound", path: "/w/made", identity: IDENTITY },
	];

	beforeAll(() => {
		root = realpathSync(mkdtempSync(join(tmpdir(), "astack-session-repos-")));
	});

	afterAll(() => rmSync(root, { recursive: true, force: true }));

	function stateAt(name: string): string {
		const dir = join(root, name);
		mkdirSync(join(dir, "session-repos"), { recursive: true });
		return dir;
	}

	test("a saved record loads as the same entries", () => {
		const env = { ASTACK_STATE_DIR: join(root, "saved") };
		expect(saveSessionRepos(env, session, record)).toEqual({
			ok: true,
			value: undefined,
		});
		expect(loadSessionRepos(env, session)).toEqual(record);
	});

	test.each<[string, (dir: string) => void]>([
		[
			"a record file that is a folder",
			(dir) => mkdirSync(join(dir, "session-repos", `${session}.json`)),
		],
		[
			"a record that is not JSON",
			(dir) =>
				writeFileSync(join(dir, "session-repos", `${session}.json`), "[{"),
		],
		[
			"a record of a wrong shape",
			(dir) =>
				writeFileSync(
					join(dir, "session-repos", `${session}.json`),
					JSON.stringify([
						{ kind: "pending", path: "/w/a" },
						{ kind: "bound", path: "/w/b" },
					]),
				),
		],
		[
			"a record with a relative path or a NUL byte",
			(dir) =>
				writeFileSync(
					join(dir, "session-repos", `${session}.json`),
					JSON.stringify([
						{ kind: "pending", path: "w/a" },
						{ kind: "pending", path: "/w/a\u0000b" },
					]),
				),
		],
	])("%s loads as no record", (name, make) => {
		const dir = stateAt(name.replaceAll(" ", "-"));
		make(dir);
		expect(loadSessionRepos({ ASTACK_STATE_DIR: dir }, session)).toEqual([]);
	});

	test.each<[string, Readonly<Record<string, string>>, string | undefined]>([
		["no session id", { ASTACK_STATE_DIR: "STATE" }, undefined],
		["an id with a slash", { ASTACK_STATE_DIR: "STATE" }, "a/b"],
		["no state folder", {}, session],
		["a state path that is a file", { ASTACK_STATE_DIR: "FILE" }, session],
		["a record file that is a folder", { ASTACK_STATE_DIR: "FOLDER" }, session],
	])(
		"a save with %s returns an error and loads as no record",
		(_, given, id) => {
			const file = join(root, "state-file");
			writeFileSync(file, "x");
			const folder = stateAt("folder-record");
			mkdirSync(join(folder, "session-repos", `${session}.json`), {
				recursive: true,
			});
			const env = Object.fromEntries(
				Object.entries(given).map(([key, value]) => [
					key,
					value
						.replace("STATE", join(root, "fresh"))
						.replace("FILE", file)
						.replace("FOLDER", folder),
				]),
			);
			expect(saveSessionRepos(env, id, record).ok).toBe(false);
			expect(loadSessionRepos(env, id)).toEqual([]);
		},
	);

	test("a probe of a repo root gives its root, git dir and identity", () => {
		const made = join(root, "probed");
		spawnSync("git", ["init", "-q", made]);
		const seen = probeRepo(made);
		expect(seen?.root).toBe(made);
		expect(seen?.commonDir).toBe(join(made, ".git"));
		expect(seen?.identity.gitDir).toBe(join(made, ".git"));
		expect(seen?.identity.inode).toMatch(/^\d+$/);
	});

	test.each([
		["a path that does not exist", "missing"],
		["a folder that is no repo", "plain"],
		["a bare repo", "bare.git"],
	])("a probe of %s gives no identity", (_, name) => {
		mkdirSync(join(root, "plain"), { recursive: true });
		spawnSync("git", ["init", "-q", "--bare", join(root, "bare.git")]);
		expect(probeRepo(join(root, name))).toBeUndefined();
	});
});
