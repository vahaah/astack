import { spawn } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
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

function runTsc(root: string, tsc: string, config: string): Promise<Exit> {
	return new Promise((settle) => {
		const child = spawn(tsc, ["-p", config, "--pretty", "false"], {
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
	const config = projectConfig(source);
	if (!config.ok) return config;
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
					extends: relative(dir, config.value),
					compilerOptions: {
						noEmit: true,
						allowImportingTsExtensions: true,
						rootDir: relative(dir, source.root) || ".",
					},
					files: ["witness.ts"],
					include: [],
				},
				null,
				"\t",
			)}\n`,
		);
		return verdictOf(source, witness, await runTsc(source.root, tsc, project));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}
