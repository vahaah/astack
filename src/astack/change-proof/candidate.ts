import { isUtf8 } from "node:buffer";
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
import { runGit } from "../git.ts";
import { err, ok, type Result } from "../result.ts";
import type { ChangedPath, FileRead, Snapshot } from "./admission.ts";

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
): string | undefined {
	const result = runGit(root, [...args]);
	return result.ok ? result.stdout.toString("utf8").trim() : undefined;
}

export function resolveCommit(root: string, ref: string): string | undefined {
	return gitText(root, [
		"rev-parse",
		"--verify",
		"--quiet",
		"--end-of-options",
		`${ref}^{commit}`,
	]);
}

export function isAncestor(root: string, base: string, head: string): boolean {
	return runGit(root, ["merge-base", "--is-ancestor", base, head]).ok;
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
		return { kind: "text", text: readFileSync(real, "utf8") };
	} catch {
		return { kind: "problem", problem: "unreadable" };
	}
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
