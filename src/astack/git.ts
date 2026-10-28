import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseUnifiedDiff } from "./comments/added.ts";

const MAX_BUFFER = 256 * 1024 * 1024;

export interface GitResult {
	ok: boolean;
	stdout: Buffer;
}

export function runGit(cwd: string, args: string[], input?: string): GitResult {
	const result = spawnSync("git", args, { cwd, input, maxBuffer: MAX_BUFFER });
	return { ok: result.status === 0, stdout: result.stdout ?? Buffer.alloc(0) };
}

function gitText(cwd: string, args: string[]): string | undefined {
	const result = runGit(cwd, args);
	return result.ok ? result.stdout.toString("utf8").trim() : undefined;
}

export function repoRoot(cwd: string): string | undefined {
	return gitText(cwd, ["rev-parse", "--show-toplevel"]);
}

export function githubSlug(url: string): string | undefined {
	const match = /github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(
		url.trim(),
	);
	return match ? `${match[1]}/${match[2]}`.toLowerCase() : undefined;
}

export function originSlug(root: string): string | undefined {
	const url = gitText(root, ["remote", "get-url", "origin"]);
	return url === undefined ? undefined : githubSlug(url);
}

export function readBlobs(
	root: string,
	specs: string[],
): Map<string, string | undefined> {
	const blobs = new Map<string, string | undefined>();
	if (specs.length === 0) return blobs;
	const { stdout } = runGit(
		root,
		["cat-file", "--batch"],
		`${specs.join("\n")}\n`,
	);
	let at = 0;
	for (const spec of specs) {
		const newline = stdout.indexOf(10, at);
		if (newline < 0) break;
		const header = stdout.toString("utf8", at, newline);
		at = newline + 1;
		const size = Number(header.split(" ")[2]);
		if (!/ blob \d+$/.test(header) || Number.isNaN(size)) {
			blobs.set(spec, undefined);
			continue;
		}
		blobs.set(spec, stdout.toString("utf8", at, at + size));
		at += size + 1;
	}
	return blobs;
}

export interface GitFileChange {
	path: string;
	before: string | undefined;
	after: string;
	added: Set<number> | undefined;
}

export type Pathspec = "all" | string[];

export interface ChangeSources {
	staged?: boolean;
	worktree?: Pathspec;
	untracked?: Pathspec;
	base?: string;
}

const DIFF = [
	"-c",
	"core.quotePath=false",
	"diff",
	"-U0",
	"-M",
	"--no-color",
	"--no-ext-diff",
	"--src-prefix=a/",
	"--dst-prefix=b/",
];

function pathArgs(spec: Pathspec): string[] {
	return spec === "all" ? [] : ["--", ...spec];
}

function headOrEmptyTree(root: string): string | undefined {
	if (runGit(root, ["rev-parse", "--verify", "-q", "HEAD"]).ok) return "HEAD";
	return gitText(root, ["hash-object", "-t", "tree", "/dev/null"]);
}

function readWorktree(root: string, path: string): string | undefined {
	try {
		return readFileSync(join(root, path), "utf8");
	} catch {
		return undefined;
	}
}

function fromDiff(
	root: string,
	diffArgs: string[],
	oldRev: string | undefined,
	newSide: (path: string) => string,
	read: (paths: string[]) => (path: string) => string | undefined,
): GitFileChange[] | undefined {
	const diff = runGit(root, [...DIFF, ...diffArgs]);
	if (!diff.ok) return undefined;
	const files = parseUnifiedDiff(diff.stdout.toString("utf8")).filter(
		(file) => file.added.size > 0,
	);
	const oldSpecs = oldRev
		? files.flatMap((file) =>
				file.oldPath ? [`${oldRev}:${file.oldPath}`] : [],
			)
		: [];
	const olds = readBlobs(root, oldSpecs);
	const newContent = read(files.map((file) => file.path));
	const changes: GitFileChange[] = [];
	for (const file of files) {
		const after = newContent(newSide(file.path));
		if (after === undefined) continue;
		const before =
			oldRev && file.oldPath
				? olds.get(`${oldRev}:${file.oldPath}`)
				: undefined;
		changes.push({ path: file.path, before, after, added: file.added });
	}
	return changes;
}

function blobReader(root: string, specOf: (path: string) => string) {
	return (paths: string[]) => {
		const blobs = readBlobs(root, paths.map(specOf));
		return (spec: string) => blobs.get(spec);
	};
}

function worktreeReader(root: string) {
	return () => (path: string) => readWorktree(root, path);
}

export function gitChanges(
	root: string,
	sources: ChangeSources,
): GitFileChange[] | undefined {
	const byPath = new Map<string, GitFileChange>();
	const add = (changes: GitFileChange[] | undefined): boolean => {
		if (!changes) return false;
		for (const change of changes) byPath.set(change.path, change);
		return true;
	};

	if (sources.base) {
		const mergeBase = gitText(root, ["merge-base", sources.base, "HEAD"]);
		if (!mergeBase) return undefined;
		const ok = add(
			fromDiff(
				root,
				[mergeBase, "HEAD"],
				mergeBase,
				(path) => `HEAD:${path}`,
				blobReader(root, (path) => `HEAD:${path}`),
			),
		);
		return ok ? [...byPath.values()] : undefined;
	}

	const head = headOrEmptyTree(root);
	if (!head) return undefined;
	const oldRev = head === "HEAD" ? "HEAD" : undefined;
	if (sources.staged) {
		const ok = add(
			fromDiff(
				root,
				["--cached", head],
				oldRev,
				(path) => `:${path}`,
				blobReader(root, (path) => `:${path}`),
			),
		);
		if (!ok) return undefined;
	}
	if (sources.worktree) {
		const ok = add(
			fromDiff(
				root,
				[head, ...pathArgs(sources.worktree)],
				oldRev,
				(path) => path,
				worktreeReader(root),
			),
		);
		if (!ok) return undefined;
	}
	if (sources.untracked) {
		const listed = runGit(root, [
			"ls-files",
			"--others",
			"--exclude-standard",
			"-z",
			...pathArgs(sources.untracked),
		]);
		if (!listed.ok) return undefined;
		for (const path of listed.stdout
			.toString("utf8")
			.split("\0")
			.filter(Boolean)) {
			const after = readWorktree(root, path);
			if (after !== undefined)
				byPath.set(path, { path, before: undefined, after, added: undefined });
		}
	}
	return [...byPath.values()];
}
