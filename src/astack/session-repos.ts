import {
	lstatSync,
	mkdirSync,
	readdirSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { runGit } from "./git.ts";
import { canonicalFile, readOptional } from "./paths.ts";
import { err, ok, type Result } from "./result.ts";
import { sessionFileName, stateDir } from "./state.ts";

type Env = Readonly<Record<string, string | undefined>>;

export type RepoIdentity = {
	readonly gitDir: string;
	readonly device: string;
	readonly inode: string;
	readonly birth: string;
};

export type RepoProbe = {
	readonly root: string;
	readonly commonDir: string;
	readonly identity: RepoIdentity;
};

export type SessionRepo =
	| { readonly kind: "pending"; readonly path: string }
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

export function settleRepos(
	repos: SessionRepos,
	probes: ReadonlyMap<string, RepoProbe>,
): SessionRepos {
	return repos.flatMap((repo): SessionRepo[] => {
		if (repo.kind === "bound") return [repo];
		const probe = probes.get(repo.path);
		return probe !== undefined && probe.root === repo.path && ownsGitDir(probe)
			? [{ kind: "bound", path: repo.path, identity: probe.identity }]
			: [];
	});
}

function sameIdentity(a: RepoIdentity, b: RepoIdentity): boolean {
	return (
		a.gitDir === b.gitDir &&
		a.device === b.device &&
		a.inode === b.inode &&
		a.birth === b.birth
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

function parseIdentity(value: unknown): RepoIdentity | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const gitDir = field(value, "gitDir");
	const device = field(value, "device");
	const inode = field(value, "inode");
	const birth = field(value, "birth");
	return typeof gitDir === "string" &&
		typeof device === "string" &&
		typeof inode === "string" &&
		typeof birth === "string"
		? { gitDir, device, inode, birth }
		: undefined;
}

function parseRepo(value: unknown): SessionRepo | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const kind = field(value, "kind");
	const path = field(value, "path");
	if (typeof path !== "string") return undefined;
	if (kind === "pending") return { kind, path };
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

function freeFolder(target: string): string | undefined {
	try {
		const stat = lstatSync(target, { throwIfNoEntry: false });
		return stat === undefined ||
			(stat.isDirectory() && readdirSync(target).length === 0)
			? canonicalFile(target)
			: undefined;
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
	const paths = targets.flatMap((target) => freeFolder(target) ?? []);
	if (paths.length === 0) return ok(undefined);
	return saveSessionRepos(env, session, [
		...repos.filter((repo) => !paths.includes(repo.path)),
		...paths.map((path): SessionRepo => ({ kind: "pending", path })),
	]);
}
