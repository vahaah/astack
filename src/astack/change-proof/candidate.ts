import { isUtf8 } from "node:buffer";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	lstatSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	realpathSync,
	type Stats,
	statSync,
} from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import { type GitResult, runGit } from "../git.ts";
import { err, ok, type Result } from "../result.ts";
import type {
	ChangedPath,
	FileRead,
	IntegrationHistory,
	Snapshot,
} from "./admission.ts";
import { isRepoPath } from "./contract.ts";

export function isInside(root: string, path: string): boolean {
	const rel = relative(root, path);
	return (
		rel !== "" &&
		rel !== ".." &&
		!rel.startsWith(`..${sep}`) &&
		!isAbsolute(rel)
	);
}

function gitLines(
	root: string,
	args: readonly string[],
): Result<readonly string[], string> {
	const result = runGit(root, [...args]);
	if (!result.ok) return err(`git ${args.join(" ")} failed`);
	if (!isUtf8(result.stdout))
		return err(`git ${args.join(" ")} returned a path that is not UTF-8`);
	return ok(
		result.stdout
			.toString("utf8")
			.split("\0")
			.filter((path) => path !== ""),
	);
}

export function gitText(
	root: string,
	args: readonly string[],
	reader: typeof runGit = runGit,
): string | undefined {
	const result = reader(root, [...args]);
	return result.ok ? result.stdout.toString("utf8").trim() : undefined;
}

export function resolveCommit(
	root: string,
	ref: string,
	reader: typeof runGit = runGit,
): string | undefined {
	return gitText(
		root,
		["rev-parse", "--verify", "--quiet", "--end-of-options", `${ref}^{commit}`],
		reader,
	);
}

export function isAncestor(
	root: string,
	base: string,
	head: string,
	reader: typeof runGit = runGit,
): boolean {
	return reader(root, ["merge-base", "--is-ancestor", base, head]).ok;
}

export function changedPaths(
	root: string,
	base: string,
): Result<readonly ChangedPath[], string> {
	const lists = [
		gitLines(root, ["diff", "--name-only", "-z", "--no-renames", base, "--"]),
		gitLines(root, [
			"diff",
			"--cached",
			"--name-only",
			"-z",
			"--no-renames",
			base,
			"--",
		]),
		gitLines(root, ["ls-files", "-z", "--others", "--exclude-standard"]),
	];
	const paths = new Set<string>();
	for (const list of lists) {
		if (!list.ok) return list;
		for (const path of list.value) paths.add(path);
	}
	return ok(
		[...paths].sort().map((path) => ({
			path,
			present: lstatOrUndefined(join(root, path)) !== undefined,
		})),
	);
}

function lstatOrUndefined(path: string): Stats | undefined {
	try {
		return lstatSync(path);
	} catch {
		return undefined;
	}
}

export function readRepoFile(root: string, path: string): FileRead {
	let real: string;
	try {
		real = realpathSync(join(root, path));
	} catch {
		return { kind: "problem", problem: "missing" };
	}
	if (!isInside(root, real)) return { kind: "problem", problem: "outside" };
	if (real !== join(root, path)) return { kind: "problem", problem: "symlink" };
	try {
		if (!statSync(real).isFile())
			return { kind: "problem", problem: "not-a-file" };
		const bytes = readFileSync(real);
		return isUtf8(bytes)
			? { kind: "text", text: bytes.toString("utf8") }
			: { kind: "problem", problem: "unreadable" };
	} catch {
		return { kind: "problem", problem: "unreadable" };
	}
}

function readCommittedFile(
	root: string,
	commit: string,
	path: string,
): FileRead {
	if (!isRepoPath(path)) return { kind: "problem", problem: "outside" };
	const tree = historyGit(root, ["ls-tree", "-z", commit, "--", path]);
	if (!tree.ok || !isUtf8(tree.stdout))
		return { kind: "problem", problem: "unreadable" };
	if (tree.stdout.length === 0) return { kind: "problem", problem: "missing" };
	const entry = tree.stdout.toString("utf8");
	const tab = entry.indexOf("\t");
	if (tab < 0 || entry.slice(tab + 1) !== `${path}\0`)
		return { kind: "problem", problem: "unreadable" };
	const [mode, type, object] = entry.slice(0, tab).split(" ");
	if (mode === "120000") return { kind: "problem", problem: "symlink" };
	if ((mode !== "100644" && mode !== "100755") || type !== "blob")
		return { kind: "problem", problem: "not-a-file" };
	if (object === undefined) return { kind: "problem", problem: "unreadable" };
	const bytes = historyGit(root, ["cat-file", "blob", object]);
	return bytes.ok && isUtf8(bytes.stdout)
		? { kind: "text", text: bytes.stdout.toString("utf8") }
		: { kind: "problem", problem: "unreadable" };
}

export function historyGit(root: string, args: readonly string[]): GitResult {
	const result = spawnSync(
		"git",
		["--no-replace-objects", "--no-lazy-fetch", ...args],
		{
			cwd: root,
			maxBuffer: 256 * 1024 * 1024,
			env: { ...process.env, GIT_GRAFT_FILE: "" },
		},
	);
	return { ok: result.status === 0, stdout: result.stdout ?? Buffer.alloc(0) };
}

export function readIntegrationHistory(
	root: string,
	base: string,
	integratedAt: string,
	paths: readonly string[],
): Result<IntegrationHistory, string> {
	if (
		resolveCommit(root, integratedAt, historyGit) !== integratedAt ||
		historyGit(root, ["cat-file", "-t", integratedAt])
			.stdout.toString("utf8")
			.trim() !== "commit"
	)
		return err(
			`ratification ${integratedAt} is not a full commit in this repository`,
		);
	if (
		resolveCommit(root, base, historyGit) !== base ||
		!historyGit(root, ["merge-base", "--is-ancestor", base, "HEAD"]).ok
	)
		return err(`the fixed proof base ${base} is not an ancestor of HEAD`);
	if (!historyGit(root, ["merge-base", "--is-ancestor", integratedAt, base]).ok)
		return err(
			`ratification ${integratedAt} is not an ancestor of the fixed proof base ${base}`,
		);
	return ok({
		integratedAt,
		base,
		files: new Map(
			paths.map((path) => [path, readCommittedFile(root, integratedAt, path)]),
		),
		baseFiles: new Map(
			paths.map((path) => [path, readCommittedFile(root, base, path)]),
		),
	});
}

function entryLine(root: string, base: string, path: string): string {
	const full = join(root, path);
	const stat = lstatOrUndefined(full);
	if (stat === undefined) {
		const blob = gitText(root, [
			"rev-parse",
			"--verify",
			"--quiet",
			`${base}:${path}`,
		]);
		return `absent ${blob ?? "none"}`;
	}
	if (stat.isSymbolicLink())
		return `link ${readlinkSync(full, { encoding: "buffer" }).toString("base64")}`;
	if (stat.isFile()) {
		const gitMode = (stat.mode & 0o100) !== 0 ? "100755" : "100644";
		return `file ${gitMode} ${createHash("sha256").update(readFileSync(full)).digest("hex")}`;
	}
	return stat.isDirectory() ? "directory" : "other";
}

interface DirectoryEntry {
	readonly line: string;
	readonly files: number;
	readonly nested: boolean;
}

function directoryEntry(
	root: string,
	path: string,
	submodule: boolean,
	paths: readonly string[],
): Result<DirectoryEntry, string> {
	try {
		const full = realpathSync(join(root, path));
		if (!isInside(root, full))
			return err(`candidate directory ${path} is outside the repository`);
		if (gitText(full, ["rev-parse", "--show-toplevel"]) !== full) {
			if (submodule && readdirSync(full).length > 0)
				return err(
					`submodule ${path} has files but is not a readable Git worktree`,
				);
			return ok({
				line: submodule ? "submodule uninitialized" : "directory",
				files: 1,
				nested: false,
			});
		}
		const head = resolveCommit(full, "HEAD");
		if (head === undefined)
			return err(`nested repository ${path} has no HEAD commit`);
		const changed = changedPaths(full, head);
		if (!changed.ok) return err(`nested repository ${path}: ${changed.error}`);
		const prefix = `${path.replace(/\/+$/, "")}/`;
		const explicit = paths
			.filter(
				(entry) => entry.startsWith(prefix) && entry.length > prefix.length,
			)
			.map((entry) => entry.slice(prefix.length));
		const nested = snapshot(full, head, changed.value, explicit);
		if (!nested.ok) return err(`nested repository ${path}: ${nested.error}`);
		return ok({
			line: `repository ${nested.value.head} ${nested.value.digest}`,
			files: 1 + nested.value.files,
			nested: true,
		});
	} catch {
		return err(`cannot read candidate directory ${path}`);
	}
}

export function snapshot(
	root: string,
	base: string,
	changed: readonly ChangedPath[],
	explicit: readonly string[],
	history = "",
): Result<Snapshot, string> {
	const head = gitText(root, ["rev-parse", "--verify", "HEAD"]);
	if (head === undefined) return err("the repository has no HEAD commit");
	const listed = gitLines(root, [
		"ls-files",
		"-z",
		"--cached",
		"--others",
		"--exclude-standard",
	]);
	if (!listed.ok) return listed;
	const index = runGit(root, ["ls-files", "--stage", "-z"]);
	if (!index.ok) return err("git cannot read the candidate index");
	const gitlinks = new Set<string>();
	for (const row of index.stdout.toString("utf8").split("\0")) {
		if (!row.startsWith("160000 ")) continue;
		const tab = row.indexOf("\t");
		if (tab < 0) return err("git returned a malformed submodule index entry");
		gitlinks.add(row.slice(tab + 1));
	}
	const paths = [
		...new Set([
			...listed.value,
			...changed.map((entry) => entry.path),
			...explicit,
		]),
	].sort();
	const hash = createHash("sha256");
	if (history !== "")
		hash.update("ratification\0").update(history).update("\0");
	hash.update("index\0");
	hash.update(index.stdout);
	hash.update("\0worktree\0");
	const covered: string[] = [];
	let files = 0;
	for (const path of paths) {
		if (covered.some((prefix) => path.startsWith(prefix))) continue;
		const line = entryLine(root, base, path);
		if (
			gitlinks.has(path) &&
			line !== "directory" &&
			!line.startsWith("absent ")
		)
			return err(`submodule ${path} is not a directory`);
		if (line === "directory") {
			const entry = directoryEntry(root, path, gitlinks.has(path), paths);
			if (!entry.ok) return entry;
			hash.update(`${path}\0${entry.value.line}\n`);
			files += entry.value.files;
			if (entry.value.nested) covered.push(`${path.replace(/\/+$/, "")}/`);
		} else {
			hash.update(`${path}\0${line}\n`);
			files++;
		}
	}
	return ok({
		head,
		digest: `sha256:${hash.digest("hex")}`,
		files,
	});
}
