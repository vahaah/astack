import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { processPorts } from "../../src/astack/ports.ts";
import {
	type FreeTarget,
	loadSessionRepos,
	type MadeFacts,
	type MadeProbe,
	probeMadeRepo,
	probeRepo,
	type RepoIdentity,
	type SessionRepos,
	saveSessionRepos,
	sessionRepoAt,
	settleRepos,
} from "../../src/astack/session-repos.ts";

const IDENTITY: RepoIdentity = {
	gitDir: "/w/made/.git",
	device: "1",
	inode: "2",
	birth: "3000000000",
	gitDirNode: { device: "1", inode: "5", birth: "3000000000" },
	head: "c0ffee",
	index: "3000000001",
	objects: "3+0",
};

const SINCE = "3000000000";
const MISSING: FreeTarget = { kind: "missing", since: SINCE };
const FRESH = { birth: "3000000000", ctime: "3000000009" };
const MADE: MadeFacts = {
	root: FRESH,
	gitDir: FRESH,
	marker: FRESH,
	head: FRESH,
	oldest: "3000000000",
};

function probe(
	root: string,
	gitDir: string,
	commonDir: string,
	birth = IDENTITY.birth,
	made: Partial<MadeFacts> = {},
): MadeProbe {
	return {
		root,
		commonDir,
		identity: { ...IDENTITY, gitDir, birth },
		made: { ...MADE, root: { ...FRESH, birth }, ...made },
	};
}

describe("[control:sg-session-repo-store] the settle of the session repo record", () => {
	const bound: SessionRepos = [
		{ kind: "bound", path: "/w/old", identity: IDENTITY },
	];

	test.each<[string, MadeProbe | undefined, SessionRepos]>([
		[
			"a repo root with its own git dir binds",
			probe("/w/made", "/w/made/.git", "/w/made/.git"),
			[{ kind: "bound", path: "/w/made", identity: IDENTITY }],
		],
		[
			"a repo root born before the call drops",
			probe("/w/made", "/w/made/.git", "/w/made/.git", "2999999999"),
			[],
		],
		[
			"a git dir born before the call drops",
			probe("/w/made", "/w/made/.git", "/w/made/.git", undefined, {
				gitDir: { birth: "2", ctime: "9" },
			}),
			[],
		],
		[
			"a .git marker born before the call drops",
			probe("/w/made", "/w/made/.git", "/w/made/.git", undefined, {
				marker: { birth: "2", ctime: "9" },
			}),
			[],
		],
		[
			"a HEAD born before the call drops",
			probe("/w/made", "/w/made/.git", "/w/made/.git", undefined, {
				head: { birth: "2", ctime: "9" },
			}),
			[],
		],
		[
			"an index entry or a reflog entry older than the call drops",
			probe("/w/made", "/w/made/.git", "/w/made/.git", undefined, {
				oldest: "2999999999",
			}),
			[],
		],
		[
			"a birth of 0 is unknown, so it drops",
			probe("/w/made", "/w/made/.git", "/w/made/.git", undefined, {
				head: { birth: "0", ctime: "3000000009" },
			}),
			[],
		],
		[
			"a birth equal to its ctime is unknown, so it drops",
			probe("/w/made", "/w/made/.git", "/w/made/.git", undefined, {
				marker: { birth: "3000000005", ctime: "3000000005" },
			}),
			[],
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
			settleRepos(
				[...bound, { kind: "pending", path: "/w/made", free: MISSING }],
				probes,
			),
		).toEqual([...bound, ...settled]);
	});

	test.each<[string, RepoIdentity, SessionRepos]>([
		[
			"the same empty folder binds",
			IDENTITY,
			[{ kind: "bound", path: "/w/made", identity: IDENTITY }],
		],
		["a folder with another inode drops", { ...IDENTITY, inode: "9" }, []],
		["a folder with another birth drops", { ...IDENTITY, birth: "9" }, []],
	])("%s", (_, seen, settled) => {
		const empty: FreeTarget = { kind: "empty", folder: IDENTITY, since: SINCE };
		expect(
			settleRepos(
				[{ kind: "pending", path: "/w/made", free: empty }],
				new Map([
					[
						"/w/made",
						{
							root: "/w/made",
							commonDir: "/w/made/.git",
							identity: seen,
							made: MADE,
						},
					],
				]),
			),
		).toEqual(settled);
	});
});

describe("[control:sg-session-repo-match] the match of a session repo", () => {
	const repos: SessionRepos = [
		{ kind: "bound", path: "/w/made", identity: IDENTITY },
		{ kind: "pending", path: "/w/later", free: MISSING },
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
		[
			"another git dir node at the same path does not match",
			"/w/made",
			{ ...IDENTITY, gitDirNode: { ...IDENTITY.gitDirNode, inode: "9" } },
			false,
		],
		[
			"another HEAD does not match",
			"/w/made",
			{ ...IDENTITY, head: "f00" },
			false,
		],
		[
			"another index time does not match",
			"/w/made",
			{ ...IDENTITY, index: "3000000002" },
			false,
		],
		[
			"another object count does not match",
			"/w/made",
			{ ...IDENTITY, objects: "4+0" },
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
		{ kind: "pending", path: "/w/later", free: MISSING },
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
						{ kind: "pending", path: "/w/a", free: MISSING },
						{ kind: "bound", path: "/w/b" },
					]),
				),
		],
		[
			"a pending entry with no free target",
			(dir) =>
				writeFileSync(
					join(dir, "session-repos", `${session}.json`),
					JSON.stringify([{ kind: "pending", path: "/w/a" }]),
				),
		],
		[
			"a pending entry whose since is no count",
			(dir) =>
				writeFileSync(
					join(dir, "session-repos", `${session}.json`),
					JSON.stringify([
						{
							kind: "pending",
							path: "/w/b",
							free: { ...MISSING, since: "1e3" },
						},
					]),
				),
		],
		[
			"a record with a relative path or a NUL byte",
			(dir) =>
				writeFileSync(
					join(dir, "session-repos", `${session}.json`),
					JSON.stringify([
						{ kind: "pending", path: "w/a", free: MISSING },
						{ kind: "pending", path: "/w/a\u0000b", free: MISSING },
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
		const seen = probeRepo(processPorts(), made);
		expect(seen?.root).toBe(made);
		expect(seen?.commonDir).toBe(join(made, ".git"));
		expect(seen?.identity.gitDir).toBe(join(made, ".git"));
		expect(seen?.identity.inode).toMatch(/^\d+$/);
	});

	test("a probe of a made repo runs no fsmonitor command of the repo config", () => {
		const made = join(root, "monitored");
		const marker = join(root, "fsmonitor-ran");
		const monitor = join(root, "monitor.sh");
		writeFileSync(monitor, `#!/bin/sh\ntouch '${marker}'\n`, { mode: 0o755 });
		spawnSync("git", ["init", "-q", made]);
		spawnSync("git", ["config", "core.fsmonitor", monitor], { cwd: made });
		writeFileSync(join(made, "a.txt"), "a\n");
		spawnSync("git", ["-c", "core.fsmonitor=false", "add", "a.txt"], {
			cwd: made,
		});
		expect(probeMadeRepo(processPorts(), made)?.root).toBe(made);
		expect(existsSync(marker)).toBe(false);
	});

	test.each([
		["a path that does not exist", "missing"],
		["a folder that is no repo", "plain"],
		["a bare repo", "bare.git"],
	])("a probe of %s gives no identity", (_, name) => {
		mkdirSync(join(root, "plain"), { recursive: true });
		spawnSync("git", ["init", "-q", "--bare", join(root, "bare.git")]);
		expect(probeRepo(processPorts(), join(root, name))).toBeUndefined();
	});
});
