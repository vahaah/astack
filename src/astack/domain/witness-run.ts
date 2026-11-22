import { spawn } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { gitLines, isInside } from "../change-proof/candidate.ts";
import { err, ok, type Result } from "../result.ts";
import type { DomainBlock } from "./notation.ts";
import {
	type ModuleExports,
	type StepLink,
	type StepLinks,
	scanExports,
	type WitnessSource,
} from "./witness.ts";

export type WitnessFinding = {
	readonly line: number;
	readonly message: string;
};

export type WitnessVerdict =
	| { readonly kind: "pass"; readonly checks: number }
	| { readonly kind: "fail"; readonly findings: readonly WitnessFinding[] };

export type WitnessStop = { readonly message: string };

export const WITNESS_CACHE = "node_modules/.cache/astack";
const TSC = "node_modules/.bin/tsc";
const TIMEOUT_MS = 60_000;
const ERROR_LINE = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;
const COPIED_OPTIONS = [
	"allowArbitraryExtensions",
	"allowJs",
	"allowSyntheticDefaultImports",
	"allowUmdGlobalAccess",
	"alwaysStrict",
	"customConditions",
	"esModuleInterop",
	"exactOptionalPropertyTypes",
	"experimentalDecorators",
	"jsx",
	"jsxFactory",
	"jsxFragmentFactory",
	"jsxImportSource",
	"lib",
	"module",
	"moduleDetection",
	"moduleResolution",
	"moduleSuffixes",
	"noImplicitAny",
	"noImplicitThis",
	"noLib",
	"noUncheckedIndexedAccess",
	"preserveSymlinks",
	"resolveJsonModule",
	"resolvePackageJsonExports",
	"resolvePackageJsonImports",
	"rewriteRelativeImportExtensions",
	"skipDefaultLibCheck",
	"skipLibCheck",
	"strict",
	"strictBindCallApply",
	"strictBuiltinIteratorReturn",
	"strictFunctionTypes",
	"strictNullChecks",
	"strictPropertyInitialization",
	"target",
	"types",
	"useDefineForClassFields",
	"useUnknownInCatchVariables",
] as const;
const ROOTED_OPTIONS = ["rootDirs", "typeRoots"] as const;

type Json = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is Json {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stepLinks(
	root: string,
	block: DomainBlock,
	cells: readonly string[],
	ports: ReadonlyMap<string, string>,
): StepLinks {
	const names = new Set(block.steps.map((step) => step.name));
	const steps = new Map<string, StepLink>();
	for (const cell of cells) {
		const [module = "", name = ""] = cell.split("#");
		if (names.has(name) && !steps.has(name)) steps.set(name, { module, name });
	}
	const modules = [
		...block.aggs.map((agg) => agg.module),
		...[...steps.values()].map((link) => link.module),
	];
	const exports = new Map<string, ModuleExports>();
	for (const module of new Set(modules)) {
		try {
			exports.set(
				module,
				scanExports(readFileSync(join(root, module), "utf8")),
			);
		} catch {
			exports.set(module, scanExports(""));
		}
	}
	return { root, steps, exports, ports };
}

function nearestConfig(root: string, module: string): string | undefined {
	let dir = dirname(resolve(root, module));
	while (dir.startsWith(root)) {
		const config = join(dir, "tsconfig.json");
		if (existsSync(config)) return config;
		if (dir === root) return undefined;
		dir = dirname(dir);
	}
	return undefined;
}

function projectConfig(source: WitnessSource): Result<string, WitnessStop> {
	const [first, ...rest] = source.modules;
	if (first === undefined)
		return err({
			message:
				"the domain block links no module, so the witness has nothing to check",
		});
	const config = nearestConfig(source.root, first);
	if (config === undefined)
		return err({ message: `no tsconfig.json governs ${first}` });
	const other = rest.find(
		(module) => nearestConfig(source.root, module) !== config,
	);
	return other === undefined
		? ok(config)
		: err({
				message: `${other} is under another tsconfig than ${relative(source.root, config)}, so one witness cannot check both`,
			});
}

type Exit = {
	readonly code: number | null;
	readonly output: string;
	readonly failed: string | undefined;
};

function runTsc(
	root: string,
	tsc: string,
	args: readonly string[],
): Promise<Exit> {
	return new Promise((settle) => {
		const child = spawn(tsc, args, {
			cwd: root,
			stdio: ["ignore", "pipe", "pipe"],
		});
		const chunks: Buffer[] = [];
		let failed: string | undefined;
		const timer = setTimeout(() => {
			failed = `tsc ran past ${TIMEOUT_MS} ms`;
			child.kill("SIGKILL");
		}, TIMEOUT_MS);
		child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
		child.stderr.on("data", (chunk: Buffer) => chunks.push(chunk));
		child.on("error", (error) => {
			failed ??= error.message;
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			settle({ code, output: Buffer.concat(chunks).toString("utf8"), failed });
		});
	});
}

function trackedTsc(root: string, tsc: string): string | undefined {
	const targets = [tsc, join(root, "node_modules/typescript")].flatMap(
		(path) => {
			try {
				const real = realpathSync(path);
				return isInside(root, real) ? [relative(root, real)] : [];
			} catch {
				return [];
			}
		},
	);
	const tracked = gitLines(root, [
		"ls-files",
		"-z",
		"--",
		"node_modules",
		...targets,
	]);
	if (!tracked.ok)
		return `${tracked.error}, so the witness cannot show that the tree tracks no tsc`;
	const [first] = tracked.value;
	return first === undefined
		? undefined
		: `git tracks ${first}, so the witness does not run a tsc of the candidate tree`;
}

function jsoncValue(text: string): unknown {
	let out = "";
	let comma = false;
	const emit = (part: string) => {
		out += comma ? `,${part}` : part;
		comma = false;
	};
	for (let at = 0; at < text.length; at++) {
		const char = text[at] ?? "";
		if (char === '"') {
			let end = at + 1;
			while (end < text.length && text[end] !== '"')
				end += text[end] === "\\" ? 2 : 1;
			emit(text.slice(at, end + 1));
			at = end;
		} else if (char === "/" && text[at + 1] === "/") {
			while (at < text.length && text[at] !== "\n") at++;
			out += "\n";
		} else if (char === "/" && text[at + 1] === "*") {
			const end = text.indexOf("*/", at + 2);
			at = end < 0 ? text.length : end + 1;
			out += " ";
		} else if (char === ",") {
			if (comma) out += ",";
			comma = true;
		} else if (/\s/.test(char)) out += char;
		else if (char === "}" || char === "]") {
			comma = false;
			out += char;
		} else emit(char);
	}
	try {
		return JSON.parse(out);
	} catch {
		return undefined;
	}
}

function fileAt(path: string): string | undefined {
	try {
		return statSync(path).isFile() ? path : undefined;
	} catch {
		return undefined;
	}
}

function extendedConfig(dir: string, name: string): string | undefined {
	if (name.startsWith(".") || isAbsolute(name)) {
		const path = resolve(dir, name);
		return fileAt(path) ?? fileAt(`${path}.json`);
	}
	for (let at = dir; ; at = dirname(at)) {
		const path = join(at, "node_modules", name);
		const found =
			fileAt(path) ??
			fileAt(`${path}.json`) ??
			fileAt(join(path, "tsconfig.json"));
		if (found !== undefined || dirname(at) === at) return found;
	}
}

function pathsBase(config: string, seen: Set<string>): string | undefined {
	if (seen.has(config)) return undefined;
	seen.add(config);
	let raw: unknown;
	try {
		raw = jsoncValue(readFileSync(config, "utf8"));
	} catch {
		return undefined;
	}
	if (!isRecord(raw)) return undefined;
	if (isRecord(raw.compilerOptions) && raw.compilerOptions.paths !== undefined)
		return dirname(config);
	const parents =
		typeof raw.extends === "string"
			? [raw.extends]
			: Array.isArray(raw.extends)
				? raw.extends
				: [];
	for (const parent of [...parents].reverse()) {
		if (typeof parent !== "string") continue;
		const file = extendedConfig(dirname(config), parent);
		const base = file === undefined ? undefined : pathsBase(file, seen);
		if (base !== undefined) return base;
	}
	return undefined;
}

function rebasedPaths(
	paths: unknown,
	base: string | undefined,
): Record<string, string[]> | undefined {
	if (!isRecord(paths)) return undefined;
	const out: Record<string, string[]> = {};
	for (const [pattern, targets] of Object.entries(paths)) {
		if (!Array.isArray(targets)) return undefined;
		const rebased: string[] = [];
		for (const target of targets) {
			if (typeof target !== "string") return undefined;
			if (isAbsolute(target)) rebased.push(target);
			else if (base === undefined) return undefined;
			else rebased.push(resolve(base, target));
		}
		out[pattern] = rebased;
	}
	return out;
}

async function witnessOptions(
	root: string,
	tsc: string,
	config: string,
): Promise<Result<Json, WitnessStop>> {
	const shown = await runTsc(root, tsc, ["--showConfig", "-p", config]);
	if (shown.failed !== undefined) return err({ message: shown.failed });
	const where = relative(root, config);
	const parsed = shown.code === 0 ? jsoncValue(shown.output) : undefined;
	const options = isRecord(parsed) ? parsed.compilerOptions : undefined;
	if (!isRecord(options))
		return err({
			message: `tsc --showConfig -p ${where} gives no compiler options: ${shown.output.trim()}`,
		});
	const copied: Record<string, unknown> = {};
	for (const key of COPIED_OPTIONS)
		if (options[key] !== undefined) copied[key] = options[key];
	for (const key of ROOTED_OPTIONS) {
		const value = options[key];
		if (Array.isArray(value))
			copied[key] = value.flatMap((path) =>
				typeof path === "string" ? [resolve(dirname(config), path)] : [],
			);
	}
	if (options.paths === undefined) return ok(copied);
	const paths = rebasedPaths(options.paths, pathsBase(config, new Set()));
	return paths === undefined
		? err({
				message: `the witness cannot find the tsconfig that declares the paths of ${where}`,
			})
		: ok({ ...copied, paths });
}

function verdictOf(
	source: WitnessSource,
	witness: string,
	exit: Exit,
): Result<WitnessVerdict, WitnessStop> {
	if (exit.failed !== undefined) return err({ message: exit.failed });
	if (exit.code === 0) return ok({ kind: "pass", checks: source.lines.size });
	const findings = new Map<number, WitnessFinding>();
	for (const text of exit.output.split(/\r?\n/)) {
		const match = ERROR_LINE.exec(text);
		if (match === null) continue;
		const [, file = "", line = "0", , code = "", message = ""] = match;
		const at = source.lines.get(Number(line));
		if (resolve(source.root, file) !== witness || at === undefined)
			return err({
				message: `tsc fails outside the witness checks at ${relative(source.root, resolve(source.root, file))}:${line}: ${code} ${message}`,
			});
		const seen = findings.get(Number(line));
		findings.set(Number(line), {
			line: at.line,
			message:
				seen === undefined
					? `${at.what}: ${message}`
					: `${seen.message} ${message}`,
		});
	}
	if (findings.size === 0)
		return err({
			message: `tsc exited ${exit.code} with no error line: ${exit.output.trim()}`,
		});
	return ok({
		kind: "fail",
		findings: [...findings.values()].sort(
			(a, b) => a.line - b.line || a.message.localeCompare(b.message),
		),
	});
}

export async function typeCheck(
	source: WitnessSource,
): Promise<Result<WitnessVerdict, WitnessStop>> {
	const tsc = join(source.root, TSC);
	if (!existsSync(tsc))
		return err({ message: `${TSC} is missing, so the witness cannot run tsc` });
	const refused = trackedTsc(source.root, tsc);
	if (refused !== undefined) return err({ message: refused });
	const config = projectConfig(source);
	if (!config.ok) return config;
	const options = await witnessOptions(source.root, tsc, config.value);
	if (!options.ok) return options;
	const cache = join(source.root, WITNESS_CACHE);
	let dir: string;
	try {
		mkdirSync(cache, { recursive: true });
		dir = mkdtempSync(join(cache, `witness-${process.pid}-`));
	} catch (error) {
		return err({
			message: `cannot write ${WITNESS_CACHE}: ${error instanceof Error ? error.message : String(error)}`,
		});
	}
	try {
		const witness = join(dir, "witness.ts");
		const project = join(dir, "tsconfig.json");
		writeFileSync(witness, source.text);
		writeFileSync(
			project,
			`${JSON.stringify(
				{
					compilerOptions: {
						...options.value,
						noEmit: true,
						allowImportingTsExtensions: true,
					},
					files: ["witness.ts"],
					include: [],
				},
				null,
				"\t",
			)}\n`,
		);
		return verdictOf(
			source,
			witness,
			await runTsc(source.root, tsc, ["-p", project, "--pretty", "false"]),
		);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}
