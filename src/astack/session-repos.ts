import {
	type BigIntStats,
	lstatSync,
	mkdirSync,
	readdirSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { READ_ONLY_GIT, runGit } from "./git.ts";
import { canonicalFile, readOptional } from "./paths.ts";
import { err, ok, type Result } from "./result.ts";
import { sessionFileName, stateDir } from "./state.ts";

type Env = Readonly<Record<string, string | undefined>>;

export type FolderIdentity = {
	readonly device: string;
	readonly inode: string;
	readonly birth: string;
};

export type RepoIdentity = FolderIdentity & {
	readonly gitDir: string;
	readonly gitDirNode: FolderIdentity;
	readonly head: string;
	readonly index: string;
	readonly objects: string;
};

export type FreeTarget =
	| { readonly kind: "missing"; readonly since: string }
	| {
			readonly kind: "empty";
			readonly folder: FolderIdentity;
			readonly since: string;
	  };

export type RepoProbe = {
	readonly root: string;
	readonly commonDir: string;
	readonly identity: RepoIdentity;
};

export type Stamp = { readonly birth: string; readonly ctime: string };

export type MadeFacts = {
	readonly root: Stamp;
	readonly gitDir: Stamp;
	readonly marker: Stamp;
	readonly head: Stamp;
	readonly oldest: string | undefined;
};

export type MadeProbe = RepoProbe & { readonly made: MadeFacts };

export type SessionRepo =
	| {
			readonly kind: "pending";
			readonly path: string;
			readonly free: FreeTarget;
	  }
	| {
			readonly kind: "bound";
			readonly path: string;
			readonly identity: RepoIdentity;
	  };

export type SessionRepos = readonly SessionRepo[];

function ownsGitDir(probe: RepoProbe): boolean {
	const { gitDir } = probe.identity;
	return (
		gitDir === join(probe.root, ".git") ||
		dirname(gitDir) === join(probe.commonDir, "worktrees")
	);
}

function sameFolder(a: FolderIdentity, b: FolderIdentity): boolean {
	return a.device === b.device && a.inode === b.inode && a.birth === b.birth;
}

function knownBirth(stamp: Stamp): boolean {
	return stamp.birth !== "0" && stamp.birth !== stamp.ctime;
}

function madeAfter(free: FreeTarget, probe: MadeProbe): boolean {
	const { made } = probe;
	const since = BigInt(free.since);
	const after = (stamp: Stamp) => BigInt(stamp.birth) >= since;
	const fresh =
		[made.root, made.gitDir, made.marker, made.head].every(knownBirth) &&
		after(made.gitDir) &&
		after(made.marker) &&
		after(made.head) &&
		(made.oldest === undefined || BigInt(made.oldest) >= since);
	switch (free.kind) {
		case "missing":
			return fresh && after(made.root);
		case "empty":
			return fresh && sameFolder(free.folder, probe.identity);
		default: {
			const unknown: never = free;
			return unknown;
		}
	}
}

export function settleRepos(
	repos: SessionRepos,
	probes: ReadonlyMap<string, MadeProbe>,
): SessionRepos {
	return repos.flatMap((repo): SessionRepo[] => {
		if (repo.kind === "bound") return [repo];
		const probe = probes.get(repo.path);
		return probe !== undefined &&
			probe.root === repo.path &&
			ownsGitDir(probe) &&
			madeAfter(repo.free, probe)
			? [{ kind: "bound", path: repo.path, identity: probe.identity }]
			: [];
	});
}

function sameIdentity(a: RepoIdentity, b: RepoIdentity): boolean {
	return (
		a.gitDir === b.gitDir &&
		sameFolder(a, b) &&
		sameFolder(a.gitDirNode, b.gitDirNode) &&
		a.head === b.head &&
		a.index === b.index &&
		a.objects === b.objects
	);
}

export function sessionRepoAt(
	repos: SessionRepos,
	root: string,
	identity: RepoIdentity,
): boolean {
	return repos.some(
		(repo) =>
			repo.kind === "bound" &&
			repo.path === root &&
			sameIdentity(repo.identity, identity),
	);
}

export function probeRepo(path: string): RepoProbe | undefined {
	const listed = runGit(path, [
		"rev-parse",
		"--show-toplevel",
		"--absolute-git-dir",
		"--git-common-dir",
	]);
	const [root, gitDir, common] = listed.ok
		? listed.stdout.toString("utf8").split("\n")
		: [];
	const objects = root ? objectCount(root) : undefined;
	if (!root || !gitDir || !common || objects === undefined) return undefined;
	try {
		const stat = statSync(root, { bigint: true });
		const index = statSync(join(gitDir, "index"), {
			bigint: true,
			throwIfNoEntry: false,
		});
		return {
			root,
			commonDir: resolve(path, common),
			identity: {
				gitDir,
				...folderOf(stat),
				gitDirNode: folderOf(statSync(gitDir, { bigint: true })),
				head: headCommit(root),
				index: index === undefined ? "none" : String(index.mtimeNs),
				objects,
			},
		};
	} catch {
		return undefined;
	}
}

function headCommit(root: string): string {
	const head = runGit(root, [
		...READ_ONLY_GIT,
		"rev-parse",
		"--verify",
		"--quiet",
		"HEAD",
	]);
	return head.ok ? head.stdout.toString("utf8").trim() : "none";
}

const OBJECT_COUNTS = /^(?:count|in-pack): (\d+)$/gm;

function objectCount(root: string): string | undefined {
	const counted = runGit(root, [...READ_ONLY_GIT, "count-objects", "-v"]);
	const counts = counted.ok
		? [...counted.stdout.toString("utf8").matchAll(OBJECT_COUNTS)].map(
				([, count]) => count,
			)
		: [];
	return counts.length === 2 ? counts.join("+") : undefined;
}

function folderOf(stat: BigIntStats): FolderIdentity {
	return {
		device: String(stat.dev),
		inode: String(stat.ino),
		birth: String(stat.birthtimeNs),
	};
}

function stampOf(path: string): Stamp {
	const stat = lstatSync(path, { bigint: true });
	return { birth: String(stat.birthtimeNs), ctime: String(stat.ctimeNs) };
}

const NS_PER_SECOND = 1_000_000_000n;
const INDEX_CTIME = /^\s+ctime: (\d+):(\d+)$/gm;
const REFLOG_TIME = /> (\d+) [+-]\d{4}\t?/;

function oldestEntry(root: string, gitDir: string): string | undefined {
	const listed = runGit(root, [...READ_ONLY_GIT, "ls-files", "--debug"]);
	if (!listed.ok) return "0";
	const times = [...listed.stdout.toString("utf8").matchAll(INDEX_CTIME)].map(
		([, seconds = "0", nanos = "0"]) =>
			BigInt(seconds) * NS_PER_SECOND + BigInt(nanos),
	);
	const reflog = readOptional(join(gitDir, "logs", "HEAD"));
	const first = reflog === undefined ? undefined : REFLOG_TIME.exec(reflog);
	if (first?.[1] !== undefined)
		times.push((BigInt(first[1]) + 1n) * NS_PER_SECOND - 1n);
	else if (
		runGit(root, [...READ_ONLY_GIT, "rev-parse", "--verify", "--quiet", "HEAD"])
			.ok
	)
		times.push(0n);
	return times.length === 0
		? undefined
		: String(times.reduce((low, time) => (time < low ? time : low)));
}

export function probeMadeRepo(path: string): MadeProbe | undefined {
	const probe = probeRepo(path);
	if (probe === undefined) return undefined;
	try {
		return {
			...probe,
			made: {
				root: stampOf(probe.root),
				gitDir: stampOf(probe.identity.gitDir),
				marker: stampOf(join(probe.root, ".git")),
				head: stampOf(join(probe.identity.gitDir, "HEAD")),
				oldest: oldestEntry(probe.root, probe.identity.gitDir),
			},
		};
	} catch {
		return undefined;
	}
}

function recordPath(env: Env, session: string | undefined): string | undefined {
	const state = stateDir(env);
	const name = session === undefined ? undefined : sessionFileName(session);
	return state === undefined || name === undefined
		? undefined
		: join(state, "session-repos", `${name}.json`);
}

function field(value: object, key: string): unknown {
	return Reflect.get(value, key);
}

const COUNT = /^\d+$/;

function parseFolder(value: unknown): FolderIdentity | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const device = field(value, "device");
	const inode = field(value, "inode");
	const birth = field(value, "birth");
	return typeof device === "string" &&
		typeof inode === "string" &&
		typeof birth === "string" &&
		COUNT.test(birth)
		? { device, inode, birth }
		: undefined;
}

function parseIdentity(value: unknown): RepoIdentity | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const folder = parseFolder(value);
	const gitDir = field(value, "gitDir");
	const gitDirNode = parseFolder(field(value, "gitDirNode"));
	const head = field(value, "head");
	const index = field(value, "index");
	const objects = field(value, "objects");
	return folder !== undefined &&
		typeof gitDir === "string" &&
		gitDirNode !== undefined &&
		typeof head === "string" &&
		typeof index === "string" &&
		typeof objects === "string"
		? { ...folder, gitDir, gitDirNode, head, index, objects }
		: undefined;
}

function parseFree(value: unknown): FreeTarget | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const kind = field(value, "kind");
	const since = field(value, "since");
	if (typeof since !== "string" || !COUNT.test(since)) return undefined;
	if (kind === "missing") return { kind, since };
	const folder = parseFolder(field(value, "folder"));
	return kind === "empty" && folder !== undefined
		? { kind, folder, since }
		: undefined;
}

function parseRepo(value: unknown): SessionRepo | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const kind = field(value, "kind");
	const path = field(value, "path");
	if (typeof path !== "string" || !isAbsolute(path) || path.includes("\0"))
		return undefined;
	if (kind === "pending") {
		const free = parseFree(field(value, "free"));
		return free === undefined ? undefined : { kind, path, free };
	}
	const identity = parseIdentity(field(value, "identity"));
	return kind === "bound" && identity !== undefined
		? { kind, path, identity }
		: undefined;
}

export function loadSessionRepos(
	env: Env,
	session: string | undefined,
): SessionRepos {
	const path = recordPath(env, session);
	const text = path === undefined ? undefined : readOptional(path);
	if (text === undefined) return [];
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return [];
	}
	if (!Array.isArray(parsed)) return [];
	const repos = parsed
		.map(parseRepo)
		.filter((repo): repo is SessionRepo => repo !== undefined);
	return repos.length === parsed.length ? repos : [];
}

function reason(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function saveSessionRepos(
	env: Env,
	session: string | undefined,
	repos: SessionRepos,
): Result<void, string> {
	const path = recordPath(env, session);
	if (path === undefined)
		return err("the session has no id that astack can use or no state folder");
	const temporary = `${path}.${process.pid}.tmp`;
	try {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(temporary, `${JSON.stringify(repos)}\n`);
	} catch (error) {
		return err(reason(error));
	}
	try {
		renameSync(temporary, path);
		return ok(undefined);
	} catch (error) {
		rmSync(temporary, { force: true });
		return err(reason(error));
	}
}

function fileClock(env: Env, session: string | undefined): string | undefined {
	const path = recordPath(env, session);
	if (path === undefined) return undefined;
	const marker = `${path}.${process.pid}.clock`;
	try {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(marker, "");
		const { mtimeNs } = statSync(marker, { bigint: true });
		rmSync(marker);
		return String(mtimeNs);
	} catch {
		return undefined;
	}
}

function freeTarget(
	target: string,
	since: string | undefined,
): SessionRepo | undefined {
	if (since === undefined) return undefined;
	try {
		const stat = lstatSync(target, { bigint: true, throwIfNoEntry: false });
		const free: FreeTarget | undefined =
			stat === undefined
				? { kind: "missing", since }
				: stat.isDirectory() && readdirSync(target).length === 0
					? { kind: "empty", folder: folderOf(stat), since }
					: undefined;
		return free === undefined
			? undefined
			: { kind: "pending", path: canonicalFile(target), free };
	} catch {
		return undefined;
	}
}

export function settledRepos(
	env: Env,
	session: string | undefined,
): SessionRepos {
	const loaded = loadSessionRepos(env, session);
	const pending = loaded.filter((repo) => repo.kind === "pending");
	if (pending.length === 0) return loaded;
	const probes = new Map(
		pending.flatMap((repo): [string, MadeProbe][] => {
			const probe = probeMadeRepo(repo.path);
			return probe === undefined ? [] : [[repo.path, probe]];
		}),
	);
	const settled = settleRepos(loaded, probes);
	saveSessionRepos(env, session, settled);
	return settled;
}

export function isSessionRepo(repos: SessionRepos, root: string): boolean {
	if (!repos.some((repo) => repo.kind === "bound")) return false;
	const probe = probeRepo(root);
	return (
		probe !== undefined &&
		probe.root === root &&
		sessionRepoAt(repos, root, probe.identity)
	);
}

export function rememberRepos(
	env: Env,
	session: string | undefined,
	repos: SessionRepos,
	targets: readonly string[],
): Result<void, string> {
	const since = targets.length === 0 ? undefined : fileClock(env, session);
	const pending = targets.flatMap((target) => freeTarget(target, since) ?? []);
	if (pending.length === 0) return ok(undefined);
	const paths = pending.map((repo) => repo.path);
	return saveSessionRepos(env, session, [
		...repos.filter((repo) => !paths.includes(repo.path)),
		...pending,
	]);
}
