import { lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { runGit } from "./git.ts";
import { ADR_CANDIDATES, GLOSSARY_CANDIDATES, type RepoFacts } from "./init.ts";
import { readOptional } from "./paths.ts";

const TEMPLATE_NAMES: ReadonlySet<string> = new Set([
	"pull_request_template.md",
	"pull_request_template",
]);

export type PathKind = "missing" | "file" | "directory" | "other";

export function kindOf(path: string): PathKind {
	try {
		const stat = lstatSync(path);
		if (stat.isFile()) return "file";
		if (stat.isDirectory()) return "directory";
		return "other";
	} catch {
		return "missing";
	}
}

function gitLines(root: string, args: string[]): string[] {
	const result = runGit(root, args);
	return result.ok
		? result.stdout.toString("utf8").split("\n").filter(Boolean)
		: [];
}

function branchName(ref: string): string | undefined {
	const local = /^refs\/heads\/(.+)$/.exec(ref)?.[1];
	if (local !== undefined) return local;
	const remote = /^refs\/remotes\/[^/]+\/(.+)$/.exec(ref)?.[1];
	return remote === "HEAD" ? undefined : remote;
}

function defaultBranch(root: string, branches: readonly string[]): string {
	const remoteHead = gitLines(root, [
		"symbolic-ref",
		"--short",
		"refs/remotes/origin/HEAD",
	])[0];
	if (remoteHead?.startsWith("origin/"))
		return remoteHead.slice("origin/".length);
	return (
		["main", "master"].find((name) => branches.includes(name)) ??
		gitLines(root, ["branch", "--show-current"])[0] ??
		"main"
	);
}

export function findPrTemplate(root: string): string | undefined {
	for (const dir of [".github", "", "docs"]) {
		let names: string[];
		try {
			names = readdirSync(join(root, dir));
		} catch {
			continue;
		}
		const found = names.find((name) => TEMPLATE_NAMES.has(name.toLowerCase()));
		if (found !== undefined) return dir === "" ? found : `${dir}/${found}`;
	}
	return undefined;
}

export function jsonIndent(biomeConfig: string | undefined): string {
	if (biomeConfig === undefined) return "  ";
	const style = /"indentStyle"\s*:\s*"(tab|space)"/.exec(biomeConfig)?.[1];
	if (style !== "space") return "\t";
	const width = Number(
		/"indentWidth"\s*:\s*(\d+)/.exec(biomeConfig)?.[1] ?? "2",
	);
	return " ".repeat(width);
}

export function readFacts(root: string): RepoFacts {
	const branches = [
		...new Set(
			gitLines(root, [
				"for-each-ref",
				"--format=%(refname)",
				"refs/heads",
				"refs/remotes",
			]).flatMap((ref) => branchName(ref) ?? []),
		),
	];
	const biome =
		readOptional(join(root, "biome.json")) ??
		readOptional(join(root, "biome.jsonc"));
	return {
		branches,
		subjects: gitLines(root, ["log", "-200", "--format=%s"]),
		remoteUrl: gitLines(root, ["remote", "get-url", "origin"])[0],
		defaultBranch: defaultBranch(root, branches),
		prTemplate: findPrTemplate(root),
		glossary: GLOSSARY_CANDIDATES.find(
			(path) => kindOf(join(root, path)) === "file",
		),
		adrDir: ADR_CANDIDATES.find(
			(path) => kindOf(join(root, path)) === "directory",
		),
		issueTemplate: [".github/ISSUE_TEMPLATE", ".github/ISSUE_TEMPLATE.md"].find(
			(path) => kindOf(join(root, path)) !== "missing",
		),
		indent: jsonIndent(biome),
	};
}
