import { join } from "node:path";
import { err, ok, type Result } from "../../src/astack/result.ts";
import { type Companion, companionPaths } from "./companion.ts";
import {
	type Finding,
	HashMatcher,
	lintFiles,
	nameHash,
	parseHashList,
	sha256,
	type TextFile,
	wordTokens,
} from "./neutrality.ts";
import { type ProjectConfig, projectPath } from "./projects.ts";

export type HashLists = { hashes: Set<string>; warnings: string[] };

export type TargetDeny = {
	readonly projects: readonly ProjectConfig[];
	readonly hashes: ReadonlySet<string>;
};

export async function readDenyList(
	companion: Companion,
): Promise<Result<ReadonlySet<string>, string>> {
	const paths = companionPaths(companion);
	const list = Bun.file(paths.deny);
	if (!(await list.exists()))
		return err(
			`${paths.deny} does not exist. Add a name with bun run deny add <name>.`,
		);
	const parsed = parseHashList(await list.text());
	if (parsed.errors.length > 0)
		return err(`${paths.deny}: ${parsed.errors.join(", ")}`);
	if (parsed.hashes.size === 0)
		return err(
			`${paths.deny} holds no hash. Add a name with bun run deny add <name>.`,
		);
	if (companion.source === "example") return ok(parsed.hashes);
	const canary = Bun.file(paths.canary);
	if (!(await canary.exists()))
		return err(
			`${paths.canary} does not exist. Write one private token in it, and add the token with bun run deny add <token>.`,
		);
	const found = new HashMatcher(parsed.hashes).listedPrefixes(
		await canary.text(),
	);
	return found.length > 0
		? ok(parsed.hashes)
		: err(
				`The scan finds no listed name in ${paths.canary}, so the deny list or the scan is wrong.`,
			);
}

export async function readTargetDeny(
	companion: Companion,
	projects: readonly ProjectConfig[],
): Promise<Result<TargetDeny, string>> {
	const hashes = await readDenyList(companion);
	if (!hashes.ok) return err(hashes.error);
	return ok({
		projects: companion.source === "example" ? [] : projects,
		hashes: hashes.value,
	});
}

function denylistFor(projects: readonly ProjectConfig[]): Set<string> {
	return new Set(projects.map((project) => nameHash(project.name)));
}

export async function loadHashLists(
	projects: readonly ProjectConfig[],
	companionHashes: ReadonlySet<string>,
): Promise<HashLists> {
	const hashes = new Set([...denylistFor(projects), ...companionHashes]);
	const warnings: string[] = [];
	for (const project of projects) {
		const list = project.lint.neverNameList;
		if (list === undefined) continue;
		const path = join(projectPath(project), list);
		const file = Bun.file(path);
		if (!(await file.exists())) {
			warnings.push(
				`${project.name}: ${path} not found, so its never-name hashes were not checked`,
			);
			continue;
		}
		const parsed = parseHashList(await file.text());
		for (const error of parsed.errors) {
			warnings.push(`${project.name}: ${list}: ${error}`);
		}
		for (const hash of parsed.hashes) hashes.add(hash);
	}
	return { hashes, warnings };
}

export function withoutOwnName(
	projectName: string,
	hashes: ReadonlySet<string>,
): Set<string> {
	const tokens = wordTokens(projectName);
	const own = new Set(
		tokens.flatMap((_, start) =>
			tokens
				.slice(start)
				.map((_, size) =>
					sha256(tokens.slice(start, start + size + 1).join("")),
				),
		),
	);
	return new Set([...hashes].filter((hash) => !own.has(hash)));
}

export async function lintTarget(
	project: ProjectConfig,
	files: readonly TextFile[],
	deny: TargetDeny,
): Promise<{ findings: Finding[]; warnings: string[] }> {
	const lists = await loadHashLists(deny.projects, deny.hashes);
	const findings = lintFiles(files, {
		matcher: new HashMatcher(withoutOwnName(project.name, lists.hashes)),
		adrCitation: project.lint.adrCitation,
		conflictMarkers: project.lint.conflictMarkers,
		denySubstrings: project.lint.denySubstrings,
		denySubstringsExempt: project.lint.denySubstringsExempt ?? [],
	});
	return { findings, warnings: lists.warnings };
}
