import { posix } from "node:path";
import {
	FIXER_FLAGS,
	type ProfileGate,
} from "../../src/astack/pr-review-profile.ts";

export type PackageScripts = {
	readonly dir: string;
	readonly name: string | undefined;
	readonly scripts: Readonly<Record<string, string>>;
};

export type TaskRepo = {
	readonly packages: readonly PackageScripts[];
	readonly uncached: ReadonlySet<string>;
};

const SEPARATOR = /&&|\|\||[;|\n]/;

const TURBO = /(?<![\w.-])(?:[\w.-]*\/)*turbo(?:@[\w.^~-]+)?(?=\s)/g;

const TASK = /^[\w:.#/@-]+$/;

const FORCE = /(?<![\w-])--force(?:=true)?(?![\w-])/;

const DRY = /(?<![\w-])--dry(?:-run)?(?:=\S+)?(?![\w-])/;

const MESSAGE = /^\s*(?:echo|printf)\b/;

const RUN =
	/(?:\bcd\s+(?:\.\/)?([\w@./-]+?)\/?\s*&&\s*)?\b(?:bun|npm|pnpm|yarn)\s+run((?:\s+(?:--filter[= ]|-F\s+|--cwd[= ])\S+)*)\s+([\w:.@/-]+)([^;&|)\n"']*)/g;

const SHORT_RUN =
	/(?:\bcd\s+(?:\.\/)?([\w@./-]+?)\/?\s*&&\s*)?(?<![\w./-])(bun|pnpm|yarn)((?:\s+(?:--filter[= ]|-F\s+|--cwd[= ])\S+)*)\s+([\w:.@/-]+)([^;&|)\n"']*)/g;

const OWN_COMMANDS: Readonly<Record<string, readonly string[]>> = {
	bun: [
		"run",
		"test",
		"x",
		"exec",
		"repl",
		"install",
		"i",
		"add",
		"a",
		"remove",
		"rm",
		"update",
		"outdated",
		"link",
		"unlink",
		"publish",
		"patch",
		"pm",
		"init",
		"create",
		"c",
		"upgrade",
		"build",
		"audit",
		"info",
		"why",
	],
	pnpm: [
		"run",
		"exec",
		"dlx",
		"install",
		"i",
		"add",
		"remove",
		"rm",
		"update",
		"up",
		"create",
		"init",
		"publish",
		"link",
		"unlink",
		"why",
		"list",
		"ls",
		"outdated",
		"audit",
		"rebuild",
		"prune",
		"patch",
	],
	yarn: [
		"run",
		"exec",
		"dlx",
		"install",
		"add",
		"remove",
		"up",
		"upgrade",
		"init",
		"create",
		"info",
		"why",
		"link",
		"unlink",
		"publish",
		"pack",
		"config",
		"cache",
		"workspace",
		"workspaces",
		"patch",
		"rebuild",
	],
};

type ScriptRun = {
	readonly cd: string | undefined;
	readonly scope: string;
	readonly script: string;
	readonly args: string;
};

function scriptRuns(text: string): ScriptRun[] {
	const runs = [...text.matchAll(RUN)].map(
		([, cd, scope = "", script = "", args = ""]): ScriptRun => ({
			cd,
			scope,
			script,
			args,
		}),
	);
	const short = [...text.matchAll(SHORT_RUN)].flatMap(
		([, cd, tool = "", scope = "", script = "", args = ""]): ScriptRun[] =>
			(OWN_COMMANDS[tool] ?? []).includes(script)
				? []
				: [{ cd, scope, script, args }],
	);
	return [...runs, ...short];
}

export type ReachedScript = {
	readonly dir: string;
	readonly script: string;
	readonly body: string;
};

export function reachedScripts(
	text: string,
	context: string,
	packages: readonly PackageScripts[],
): ReachedScript[] {
	return scriptRuns(text).flatMap(({ cd, scope, script }) => {
		const target = targetPackage(packages, context, cd, scope);
		const body = target?.scripts[script];
		return target === undefined || body === undefined
			? []
			: [{ dir: target.dir, script, body }];
	});
}

const FORCED_VALUES: readonly string[] = ["true", "1"];

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function packageScripts(
	dir: string,
	packageJson: string | undefined,
): PackageScripts | undefined {
	if (packageJson === undefined) return undefined;
	let parsed: unknown;
	try {
		parsed = JSON.parse(packageJson);
	} catch {
		return undefined;
	}
	if (!isRecord(parsed)) return undefined;
	const scripts = isRecord(parsed.scripts)
		? Object.entries(parsed.scripts).flatMap(
				([name, script]): [string, string][] =>
					typeof script === "string" ? [[name, script]] : [],
			)
		: [];
	return {
		dir,
		name: typeof parsed.name === "string" ? parsed.name : undefined,
		scripts: Object.fromEntries(scripts),
	};
}

export function uncachedTasks(turboJson: string | undefined): Set<string> {
	if (turboJson === undefined) return new Set();
	let parsed: unknown;
	try {
		parsed = Bun.JSONC.parse(turboJson);
	} catch {
		return new Set();
	}
	if (!isRecord(parsed)) return new Set();
	const tasks = isRecord(parsed.tasks) ? parsed.tasks : parsed.pipeline;
	if (!isRecord(tasks)) return new Set();
	return new Set(
		Object.entries(tasks).flatMap(([name, task]) =>
			isRecord(task) && task.cache === false ? [name] : [],
		),
	);
}

function turboTasks(rest: string): string[] {
	const tasks: string[] = [];
	const words = rest.trim().split(/\s+/);
	for (const [index, word] of words.entries()) {
		if (index === 0 && word === "run") continue;
		if (word.startsWith("-") && word.includes("=")) continue;
		if (word.startsWith("-") || !TASK.test(word)) break;
		tasks.push(word);
	}
	return tasks;
}

function unforcedTurbo(
	text: string,
	uncached: ReadonlySet<string>,
): string | undefined {
	for (const segment of text.split(SEPARATOR)) {
		if (MESSAGE.test(segment) || FORCE.test(segment) || DRY.test(segment))
			continue;
		for (const match of segment.matchAll(TURBO)) {
			const tasks = turboTasks(segment.slice(match.index + match[0].length));
			if (tasks.some((task) => !uncached.has(task)))
				return `turbo run ${tasks.join(" ")}`;
		}
	}
	return undefined;
}

function targetPackage(
	packages: readonly PackageScripts[],
	context: string,
	cd: string | undefined,
	scope: string,
): PackageScripts | undefined {
	const filter = /(?:--filter[= ]|-F\s+)['"]?([^\s'"]+)/.exec(scope)?.[1];
	if (filter !== undefined)
		return packages.find((entry) => entry.name === filter);
	const cwd = /--cwd[= ]['"]?([^\s'"]+)/.exec(scope)?.[1] ?? cd;
	const dir = cwd === undefined ? context : posix.join(context, cwd);
	const normal = dir.replace(/\/$/, "") || ".";
	return packages.find((entry) => entry.dir === normal);
}

function cachedTurbo(
	text: string,
	context: string,
	repo: TaskRepo,
	seen: ReadonlySet<string>,
): string | undefined {
	const direct = unforcedTurbo(text, repo.uncached);
	if (direct !== undefined) return direct;
	for (const { cd, scope, script, args } of scriptRuns(text)) {
		const target = targetPackage(repo.packages, context, cd, scope);
		const body = target?.scripts[script];
		if (target === undefined || body === undefined) continue;
		const key = `${target.dir}#${script}`;
		if (seen.has(key)) continue;
		const found = cachedTurbo(
			`${body}${args}`,
			target.dir,
			repo,
			new Set([...seen, key]),
		);
		if (found !== undefined) return found;
	}
	return undefined;
}

function forcesTurbo(gate: ProfileGate): boolean {
	return gate.ciEnv.some(
		(entry) =>
			entry.name === "TURBO_FORCE" &&
			entry.kind !== "leave" &&
			FORCED_VALUES.includes(entry.value),
	);
}

export function taskCacheGaps(
	repo: TaskRepo,
	gates: readonly ProfileGate[],
): string[] {
	return gates.flatMap((gate) => {
		if (forcesTurbo(gate)) return [];
		const turbo = [gate.command, ...gate.preparation]
			.map((text) => cachedTurbo(text, ".", repo, new Set()))
			.find((found) => found !== undefined);
		if (turbo === undefined) return [];
		return [
			`The gate ${gate.name} runs \`${turbo}\` with no --force, so turbo can replay a cached green over a red tree. CI has no turbo cache. Set TURBO_FORCE to "true" in the ci_env of the gate, with a why.`,
		];
	});
}

type ScriptFixer = {
	readonly dir: string;
	readonly script: string;
	readonly flag: string;
};

function turboRuns(
	text: string,
	packages: readonly PackageScripts[],
): { readonly target: PackageScripts; readonly script: string }[] {
	return text
		.split(SEPARATOR)
		.flatMap((segment) =>
			MESSAGE.test(segment)
				? []
				: [...segment.matchAll(TURBO)].flatMap((match) =>
						turboTasks(segment.slice(match.index + match[0].length)).flatMap(
							(task) =>
								packages
									.filter(
										(entry) =>
											entry.dir !== "." && entry.scripts[task] !== undefined,
									)
									.map((target) => ({ target, script: task })),
						),
					),
		);
}

function fixerIn(
	text: string,
	context: string,
	packages: readonly PackageScripts[],
	seen: ReadonlySet<string>,
): ScriptFixer | undefined {
	const reached = [
		...scriptRuns(text).flatMap(({ cd, scope, script }) => {
			const target = targetPackage(packages, context, cd, scope);
			return target === undefined ? [] : [{ target, script }];
		}),
		...turboRuns(text, packages),
	];
	for (const { target, script } of reached) {
		const body = target.scripts[script];
		const key = `${target.dir}#${script}`;
		if (body === undefined || seen.has(key)) continue;
		const flag = FIXER_FLAGS.find(({ pattern }) => pattern.test(body))?.flag;
		if (flag !== undefined) return { dir: target.dir, script, flag };
		const found = fixerIn(body, target.dir, packages, new Set([...seen, key]));
		if (found !== undefined) return found;
	}
	return undefined;
}

export function scriptFixerGaps(
	packages: readonly PackageScripts[],
	gates: readonly ProfileGate[],
): string[] {
	return gates.flatMap((gate) => {
		const found = [gate.command, ...gate.preparation]
			.map((text) => fixerIn(text, ".", packages, new Set()))
			.find((fixer) => fixer !== undefined);
		if (found === undefined) return [];
		const folder = found.dir === "." ? "the repo root" : found.dir;
		return [
			`The gate ${gate.name} runs the ${found.script} script of ${folder}, and that script runs ${found.flag}, a flag that changes files. So the gate can fix the tree and hide a red. Run a script that only checks.`,
		];
	});
}

const PLAYWRIGHT = /\bplaywright\s+test\b/;

const PLAYWRIGHT_CONFIGS: readonly string[] = [
	"playwright.config.ts",
	"playwright.config.mts",
	"playwright.config.cts",
	"playwright.config.js",
	"playwright.config.mjs",
	"playwright.config.cjs",
];

export function serverPackages(
	text: string,
	context: string,
	packages: readonly PackageScripts[],
	read: (path: string) => string | undefined,
	started = false,
	seen: ReadonlySet<string> = new Set(),
): string[] {
	const dirs: string[] = [];
	for (const { cd, scope, script } of scriptRuns(text)) {
		const target = targetPackage(packages, context, cd, scope);
		const body = target?.scripts[script];
		if (target === undefined || body === undefined) continue;
		const key = `${target.dir}#${script}`;
		if (seen.has(key)) continue;
		const next = new Set([...seen, key]);
		if (started) dirs.push(target.dir);
		dirs.push(
			...serverPackages(body, target.dir, packages, read, started, next),
		);
		if (!PLAYWRIGHT.test(body)) continue;
		for (const name of PLAYWRIGHT_CONFIGS) {
			const config = read(posix.join(target.dir, name));
			if (config !== undefined)
				dirs.push(
					...serverPackages(config, target.dir, packages, read, true, next),
				);
		}
	}
	return [...new Set(dirs)];
}
