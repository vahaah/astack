import { readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

export const REPO_ROOT = resolve(import.meta.dir, "../..");

const IGNORED_NAMES = new Set([".DS_Store", "node_modules", ".gitkeep"]);

export function listFiles(root: string, prefix = ""): string[] {
	const files: string[] = [];
	const dir = join(root, prefix);
	for (const name of readdirSync(dir).sort()) {
		if (IGNORED_NAMES.has(name)) continue;
		const relpath = prefix === "" ? name : `${prefix}/${name}`;
		const stats = statSync(join(root, relpath));
		if (stats.isDirectory()) files.push(...listFiles(root, relpath));
		else if (stats.isFile()) files.push(relpath);
	}
	return files;
}

export function displayPath(path: string): string {
	const rel = relative(REPO_ROOT, path);
	if (rel === "") return ".";
	return rel.startsWith("..") ? path : rel;
}
