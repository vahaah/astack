import { basename, dirname } from "node:path";
import type { ProfileGate } from "../../src/astack/pr-review-profile.ts";
import { type PackageScripts, serverPackages } from "./task-cache.ts";

export type EnvRepo = {
	readonly packages: readonly PackageScripts[];
	readonly read: (path: string) => string | undefined;
};

export type EnvApp = {
	readonly dir: string;
	readonly name: string | undefined;
	readonly examples: readonly string[];
};

const EXAMPLE = /^(\.env(?:\.[\w-]+)*?)[.-](?:example|sample|template|dist)$/;

const ENV_PATH =
	/(?<![\w./@-])(?:\.\/)?((?:[\w@.-]+\/)*\.env(?:\.[\w-]+)*)(?![\w/-])/g;

const RUNTIME = "(?:exec\\s+)?(?:bunx?|node|npx|npm|pnpm|yarn|next|turbo)\\b";

function escaped(word: string): string {
	return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function inDir(dir: string, file: string): string {
	return dir === "." ? file : `${dir}/${file}`;
}

export function exampleTarget(path: string): string | undefined {
	const match = EXAMPLE.exec(basename(path));
	return match?.[1] === undefined ? undefined : inDir(dirname(path), match[1]);
}

export function envApps(
	tracked: readonly string[],
	packageName: (dir: string) => string | undefined,
): EnvApp[] {
	const byDir = new Map<string, string[]>();
	for (const path of tracked) {
		if (exampleTarget(path) === undefined) continue;
		const dir = dirname(path);
		byDir.set(dir, [...(byDir.get(dir) ?? []), path]);
	}
	return [...byDir.entries()].map(([dir, examples]) => ({
		dir,
		name: packageName(dir),
		examples,
	}));
}

export function namedEnvPaths(text: string): string[] {
	return [...text.matchAll(ENV_PATH)].flatMap((match) =>
		match[1] === undefined || exampleTarget(match[1]) !== undefined
			? []
			: [match[1]],
	);
}

function runsIn(text: string, app: EnvApp): boolean {
	if (app.dir === ".") return false;
	const dir = `(?:\\./)?${escaped(app.dir)}/?`;
	const scoped = [
		`\\bcd\\s+${dir}\\s*&&\\s*${RUNTIME}`,
		`--cwd[= ]${dir}(?![\\w/-])`,
		...(app.name === undefined
			? []
			: [`(?:--filter[= ]|-F\\s+)['"]?${escaped(app.name)}['"]?(?![\\w/-])`]),
	];
	return scoped.some((source) => new RegExp(source).test(text));
}

export function envFileGaps(
	apps: readonly EnvApp[],
	gates: readonly ProfileGate[],
	ignored: ReadonlySet<string>,
	repo: EnvRepo = { packages: [], read: () => undefined },
): string[] {
	return gates.flatMap((gate) => {
		const entries = [gate.command, ...gate.preparation];
		const servers = entries.flatMap((text) =>
			serverPackages(text, ".", repo.packages, repo.read),
		);
		return apps.flatMap((app) => {
			const example = app.examples.find((path) => {
				const target = exampleTarget(path);
				return target !== undefined && ignored.has(target);
			});
			if (example === undefined) return [];
			const runs =
				entries.some((text) => runsIn(text, app)) ||
				(app.dir !== "." && servers.includes(app.dir));
			if (!runs) return [];
			const checked = gate.checks
				.flatMap(namedEnvPaths)
				.some((path) => dirname(path) === app.dir && ignored.has(path));
			if (checked) return [];
			const target = exampleTarget(example) ?? example;
			return [
				`The gate ${gate.name} runs ${app.dir}, and git tracks ${example} there. The app reads an env file that git ignores, so a new worktree does not have it, and the gate fails on the base too. Add a prerequisite whose check names that file, such as \`test -f ${target}\`.`,
			];
		});
	});
}
