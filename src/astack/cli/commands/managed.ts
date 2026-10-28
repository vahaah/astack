import { existsSync, realpathSync } from "node:fs";
import {
	basename,
	dirname,
	isAbsolute,
	join,
	relative,
	resolve,
	sep,
} from "node:path";
import { repoRoot } from "../../git.ts";
import { type Ownership, ownership } from "../../managed.ts";
import { readProfileJson } from "../../profile.ts";
import type { Command } from "../command.ts";
import { type Io, usageError } from "../io.ts";

function describe(path: string, owner: Ownership): string {
	switch (owner.kind) {
		case "written":
			return `written ${path}: astack apply writes this file. Fix its source in the astack repo. Then apply it again to every repo with a profile.`;
		case "retired":
			return `retired ${path}: astack apply deletes this file. ${owner.reason} Do not fix it here.`;
		case "merged":
			return `merged ${path}: astack apply writes only its plugin wiring keys into this file. Fix a wiring key in the astack repo, and any other key in this repo.`;
		case "repo":
			return `repo ${path}: ${owner.reason}. Fix it in this repo.`;
		case "unknown":
			return `unknown ${path}: .astack/profile.json has no managed list. Run apply again with --update, or ask the owner.`;
	}
}

function exitCode(owner: Ownership): number {
	switch (owner.kind) {
		case "written":
		case "retired":
		case "merged":
			return 0;
		case "repo":
			return 1;
		case "unknown":
			return 2;
	}
}

function realPath(path: string): string {
	if (existsSync(path)) return realpathSync(path);
	const parent = dirname(path);
	return parent === path ? path : join(realPath(parent), basename(path));
}

function run(args: readonly string[], io: Io): number {
	if (args.length === 0)
		return usageError(io, "astack managed: give one or more repo paths");
	const root = repoRoot(io.cwd);
	if (root === undefined)
		return usageError(io, "astack managed: run it inside a git repo");
	const profile = readProfileJson(root);
	let code = 0;
	for (const arg of args) {
		const rel = relative(realPath(root), realPath(resolve(io.cwd, arg)));
		if (rel === "" || rel.startsWith("..") || isAbsolute(rel))
			return usageError(io, `astack managed: ${arg} is not a file in ${root}`);
		const path = rel.split(sep).join("/");
		const owner = ownership(path, profile);
		io.out(`${describe(path, owner)}\n`);
		code = Math.max(code, exitCode(owner));
	}
	return code;
}

export const command: Command = {
	name: "managed",
	summary:
		"Tells whether astack apply writes a repo path. Exits 0 for an astack file, 1 for a repo file and 2 when the profile cannot tell.",
	usage: "managed <path>...",
	run,
};
