import { readFileSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";

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

export function projectRelative(projectDir: string, file: string): string {
	const rel = relative(projectDir, file);
	return toPosix(rel.startsWith("..") || isAbsolute(rel) ? file : rel);
}

export function canonicalRelative(
	projectDir: string,
	absolute: string,
): string {
	return projectRelative(
		canonical(projectDir),
		join(canonical(dirname(absolute)), basename(absolute)),
	);
}
