import {
	lstatSync,
	mkdirSync,
	readdirSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { runGit } from "./git.ts";
import { canonicalFile, readOptional } from "./paths.ts";
import { err, ok, type Result } from "./result.ts";
import { sessionFileName, stateDir } from "./state.ts";

type Env = Readonly<Record<string, string | undefined>>;

export type FolderIdentity = {
	readonly device: string;
	readonly inode: string;
	readonly birth: string;
};

export type RepoIdentity = FolderIdentity & { readonly gitDir: string };

export type FreeTarget =
	| { readonly kind: "missing"; readonly since: string }
	| { readonly kind: "empty"; readonly folder: FolderIdentity };

export type RepoProbe = {
	readonly root: string;
	readonly commonDir: string;
	readonly identity: RepoIdentity;
};

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

function madeAfter(free: FreeTarget, identity: RepoIdentity): boolean {
	switch (free.kind) {
		case "missing":
			return BigInt(identity.birth) >= BigInt(free.since);
		case "empty":
			return sameFolder(free.folder, identity);
		default: {
			const unknown: never = free;
			return unknown;
		}
	}
}

export function settleRepos(
	repos: SessionRepos,
	probes: ReadonlyMap<string, RepoProbe>,
): SessionRepos {
	return repos.flatMap((repo): SessionRepo[] => {
		if (repo.kind === "bound") return [repo];
		const probe = probes.get(repo.path);
		return probe !== undefined &&
			probe.root === repo.path &&
			ownsGitDir(probe) &&
			madeAfter(repo.free, probe.identity)
			? [{ kind: "bound", path: repo.path, identity: probe.identity }]
			: [];
	});
}

function sameIdentity(a: RepoIdentity, b: RepoIdentity): boolean {
	return a.gitDir === b.gitDir && sameFolder(a, b);
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
	if (!root || !gitDir || !common) return undefined;
	try {
		const stat = statSync(root, { bigint: true });
		return {
			root,
			commonDir: resolve(path, common),
			identity: {
				gitDir,
				device: String(stat.dev),
				inode: String(stat.ino),
				birth: String(stat.birthtimeNs),
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
	return folder !== undefined && typeof gitDir === "string"
		? { ...folder, gitDir }
		: undefined;
}

function parseFree(value: unknown): FreeTarget | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const kind = field(value, "kind");
	const since = field(value, "since");
	if (kind === "missing")
		return typeof since === "string" && COUNT.test(since)
			? { kind, since }
			: undefined;
	const folder = parseFolder(field(value, "folder"));
	return kind === "empty" && folder !== undefined
		? { kind, folder }
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

const CLOCK_SLACK_MS = 1000n;

function freeTarget(target: string): SessionRepo | undefined {
	try {
		const stat = lstatSync(target, { bigint: true, throwIfNoEntry: false });
		const free: FreeTarget | undefined =
			stat === undefined
				? {
						kind: "missing",
						since: String((BigInt(Date.now()) - CLOCK_SLACK_MS) * 1_000_000n),
					}
				: stat.isDirectory() && readdirSync(target).length === 0
					? {
							kind: "empty",
							folder: {
								device: String(stat.dev),
								inode: String(stat.ino),
								birth: String(stat.birthtimeNs),
							},
						}
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
		pending.flatMap((repo): [string, RepoProbe][] => {
			const probe = probeRepo(repo.path);
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
	const pending = targets.flatMap((target) => freeTarget(target) ?? []);
	if (pending.length === 0) return ok(undefined);
	const paths = pending.map((repo) => repo.path);
	return saveSessionRepos(env, session, [
		...repos.filter((repo) => !paths.includes(repo.path)),
		...pending,
	]);
}
