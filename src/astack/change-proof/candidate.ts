import { createHash } from "node:crypto";
import {
	lstatSync,
	readFileSync,
	readlinkSync,
	realpathSync,
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

function lstatOrUndefined(
	path: string,
): ReturnType<typeof lstatSync> | undefined {
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
	try {
		if (!statSync(real).isFile())
			return { kind: "problem", problem: "not-a-file" };
		return { kind: "text", text: readFileSync(real, "utf8") };
	} catch {
		return { kind: "problem", problem: "unreadable" };
	}
}

export function readModelFile(root: string, path: string): FileRead {
	const read = readRepoFile(root, path);
	if (read.kind === "problem") return read;
	return realpathSync(join(root, path)) === join(root, path)
		? read
		: { kind: "problem", problem: "symlink" };
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
	if (stat.isSymbolicLink()) return `link ${readlinkSync(full)}`;
	if (stat.isFile())
		return `file ${createHash("sha256").update(readFileSync(full)).digest("hex")}`;
	return stat.isDirectory() ? "directory" : "other";
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
	for (const path of paths)
		hash.update(`${path}\0${entryLine(root, base, path)}\n`);
	return ok({
		head,
		digest: `sha256:${hash.digest("hex")}`,
		files: paths.length,
	});
}
