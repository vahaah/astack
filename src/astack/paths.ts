import {
	existsSync,
	lstatSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	realpathSync,
	statSync,
} from "node:fs";
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

export function realPath(path: string): string | undefined {
	try {
		return realpathSync(path);
	} catch {
		return undefined;
	}
}

export function canonical(dir: string): string {
	return realPath(dir) ?? dir;
}

export function listDir(path: string): readonly string[] | undefined {
	try {
		return readdirSync(path);
	} catch {
		return undefined;
	}
}

export function isExecutable(path: string): boolean {
	try {
		const stat = statSync(path, { throwIfNoEntry: false });
		return stat?.isFile() === true && (stat.mode & 0o111) !== 0;
	} catch {
		return false;
	}
}

export type FolderId = {
	readonly device: string;
	readonly inode: string;
	readonly birth: string;
	readonly ctime: string;
	readonly mtime: string;
};

export function folderId(path: string): FolderId | undefined {
	try {
		const stat = lstatSync(path, { bigint: true, throwIfNoEntry: false });
		return stat === undefined
			? undefined
			: {
					device: String(stat.dev),
					inode: String(stat.ino),
					birth: String(stat.birthtimeNs),
					ctime: String(stat.ctimeNs),
					mtime: String(stat.mtimeNs),
				};
	} catch {
		return undefined;
	}
}

export function canonicalFile(path: string): string {
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

const MAX_LINK_HOPS = 40;

function linkTarget(path: string, hops = 0): string {
	const stat = lstatSync(path, { throwIfNoEntry: false });
	if (!stat?.isSymbolicLink() || hops >= MAX_LINK_HOPS) return path;
	const dir = dirname(canonicalFile(path));
	return linkTarget(resolve(dir, readlinkSync(path)), hops + 1);
}

function resolvedFile(path: string): string | undefined {
	try {
		return canonicalFile(linkTarget(resolve(path)));
	} catch {
		return undefined;
	}
}

export function isScratchPath(projectDir: string, path: string): boolean {
	const file = resolvedFile(path);
	if (file === undefined || isWithin(canonical(projectDir), file)) return false;
	return workTreeRoot(dirname(file)) === undefined;
}
