import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { err, ok, type Result } from "../../src/astack/result.ts";
import { tryFrontmatter } from "../dist/frontmatter.ts";
import {
	AGENT_ORIGINS,
	SKILL_ORIGINS,
	type UpstreamName,
} from "./upstreams.ts";

export const STE_EXEMPT_DIR = "scripts/lib/ste-exempt";
export const STE_EXEMPT_CAP: number = 0;

const SKILL_DIR = /^marketplace\/plugins\/[^/]+\/skills\/([^/]+)\//;

export type ExemptEntry = {
	readonly list: string;
	readonly path: string;
	readonly origin: Result<readonly UpstreamName[], string>;
};

function listedPaths(root: string): readonly Omit<ExemptEntry, "origin">[] {
	const dir = join(root, STE_EXEMPT_DIR);
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((name) => name.endsWith(".txt"))
		.sort()
		.flatMap((name) =>
			readFileSync(join(dir, name), "utf8")
				.split("\n")
				.filter((line) => line !== "")
				.map((path) => ({ list: `${STE_EXEMPT_DIR}/${name}`, path })),
		);
}

function itemOrigin(
	root: string,
	path: string,
): Result<readonly UpstreamName[], string> {
	const skill = SKILL_DIR.exec(path);
	if (skill === null || skill[1] === undefined)
		return ok(AGENT_ORIGINS[path] ?? []);
	const file = `${skill[0]}SKILL.md`;
	if (!existsSync(join(root, file))) return err(`${file} does not exist`);
	const split = tryFrontmatter(readFileSync(join(root, file), "utf8"), file);
	return typeof split === "string"
		? err(split)
		: ok(SKILL_ORIGINS.get(skill[1]) ?? []);
}

export function exemptPaths(root: string): readonly string[] {
	return listedPaths(root).map(({ path }) => path);
}

export function exemptEntries(root: string): readonly ExemptEntry[] {
	return listedPaths(root).map((entry) => ({
		...entry,
		origin: itemOrigin(root, entry.path),
	}));
}
