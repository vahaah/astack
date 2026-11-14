import { existsSync, readFileSync, realpathSync } from "node:fs";
import {
	basename,
	dirname,
	isAbsolute,
	join,
	relative,
	resolve,
	sep,
} from "node:path";
import { PROFILE_PATH } from "./profile.ts";

export function readOptional(path: string): string | undefined {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return undefined;
	}
}

export function toPosix(path: string): string {
	return sep === "/" ? path : path.split(sep).join("/");
}

export function canonical(dir: string): string {
	try {
		return realpathSync(dir);
	} catch {
		return dir;
	}
}

function canonicalFile(path: string): string {
	const dir = dirname(path);
	if (dir === path) return path;
	try {
		return join(realpathSync(dir), basename(path));
	} catch {
		return join(canonicalFile(dir), basename(path));
	}
}

export function projectRelative(projectDir: string, file: string): string {
	const rel = relative(projectDir, file);
	return toPosix(rel.startsWith("..") || isAbsolute(rel) ? file : rel);
}

export function canonicalRelative(
	projectDir: string,
	absolute: string,
): string {
	return projectRelative(canonical(projectDir), canonicalFile(absolute));
}

function isWithin(dir: string, path: string): boolean {
	const rel = relative(dir, path);
	return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

export function workTreeRoot(start: string): string | undefined {
	let dir = resolve(start);
	for (;;) {
		if (existsSync(join(dir, PROFILE_PATH)) || existsSync(join(dir, ".git")))
			return dir;
		const parent = dirname(dir);
		if (parent === dir) return undefined;
		dir = parent;
	}
}

export function isScratchPath(projectDir: string, path: string): boolean {
	const file = canonicalFile(resolve(path));
	if (isWithin(canonical(projectDir), file)) return false;
	return workTreeRoot(dirname(file)) === undefined;
}
