import { spawnSync } from "node:child_process";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	renameSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { runGit } from "./git.ts";
import { MANAGED_PATHS } from "./managed.ts";
import type { ProfileGate, ToolVersion } from "./pr-review-profile.ts";
import { sessionFileName, stateDir } from "./state.ts";

type Env = Readonly<Record<string, string | undefined>>;

export type GateOutcome =
	| { readonly kind: "passed" }
	| { readonly kind: "skipped" }
	| { readonly kind: "red"; readonly exit: string }
	| { readonly kind: "blocked"; readonly by: string }
	| { readonly kind: "not-started"; readonly reason: string };

export type GateRecord = {
	readonly head: string;
	readonly base: string;
	readonly baseSha: string;
	readonly profile: string;
	readonly ran: readonly string[];
	readonly skipped: readonly string[];
};

export type GateRun = {
	readonly name: string;
	readonly outcome: GateOutcome;
};

export function gateLabel(name: string): string {
	return name.toUpperCase().replaceAll("-", "_");
}

export function outcomeText(outcome: GateOutcome): string {
	switch (outcome.kind) {
		case "passed":
			return "0";
		case "skipped":
			return "SKIPPED";
		case "red":
			return outcome.exit;
		case "blocked":
			return `BLOCKED by ${outcome.by}`;
		case "not-started":
			return `NOT_STARTED: ${outcome.reason}`;
	}
}

function gateEnv(
	gate: ProfileGate,
	session: Env,
	toolFolders: readonly string[],
): Record<string, string | undefined> {
	const env: Record<string, string | undefined> = { ...session };
	const leaves = gate.ciEnv.some(
		(entry) => entry.kind === "leave" && entry.name === "CI",
	);
	if (!leaves) env.CI = "true";
	for (const entry of gate.ciEnv)
		if (entry.kind !== "leave") env[entry.name] = entry.value;
	if (toolFolders.length > 0)
		env.PATH = [...toolFolders, session.PATH ?? ""].join(delimiter);
	return env;
}

export function recordOf(
	runs: readonly GateRun[],
	head: string,
	base: string,
	baseSha: string,
	profile: string,
): GateRecord | undefined {
	const green = runs.every(
		(run) => run.outcome.kind === "passed" || run.outcome.kind === "skipped",
	);
	if (!green) return undefined;
	const named = (kind: GateOutcome["kind"]) =>
		runs.filter((run) => run.outcome.kind === kind).map((run) => run.name);
	return {
		head,
		base,
		baseSha,
		profile,
		ran: named("passed"),
		skipped: named("skipped"),
	};
}

export function sameProfile(
	record: GateRecord,
	sourceBlob: string,
	baseBlob: string,
): boolean {
	return record.profile === sourceBlob && record.profile === baseBlob;
}

function gitLine(root: string, args: string[]): string | undefined {
	const result = runGit(root, args);
	const line = result.ok ? result.stdout.toString("utf8").trim() : "";
	return line === "" ? undefined : line;
}

export type ProfileBlobs = {
	readonly mergeBase: string;
	readonly source: string;
	readonly base: string;
};

export function profileBlobs(
	root: string,
	source: string,
	baseSha: string,
): ProfileBlobs | undefined {
	const mergeBase = gitLine(root, ["merge-base", baseSha, source]);
	const blob = (commit: string) =>
		gitLine(root, [
			"rev-parse",
			"--verify",
			"--quiet",
			`${commit}:${MANAGED_PATHS.reviewProfile}`,
		]);
	const sourceBlob = blob(source);
	const baseBlob = mergeBase === undefined ? undefined : blob(mergeBase);
	return mergeBase === undefined ||
		sourceBlob === undefined ||
		baseBlob === undefined
		? undefined
		: { mergeBase, source: sourceBlob, base: baseBlob };
}

export type GateIo = {
	readonly root: string;
	readonly env: Env;
	readonly say: (line: string) => void;
};

function bash(io: GateIo, script: string, env: Env): number | string {
	const result = spawnSync("bash", ["-c", script], {
		cwd: io.root,
		env,
		stdio: ["ignore", "inherit", "inherit"],
	});
	if (result.error !== undefined) return result.error.message;
	return result.status ?? result.signal ?? "killed";
}

function gitLines(root: string, args: string[]): readonly string[] {
	const result = runGit(root, args);
	return result.ok
		? result.stdout.toString("utf8").split("\n").filter(Boolean)
		: [];
}

function gateApplies(
	root: string,
	base: string,
	whenChanged: readonly string[],
): boolean {
	if (whenChanged.length === 0) return true;
	const pathspecs = whenChanged.map((glob) =>
		glob.startsWith("!") ? `:(glob,exclude)${glob.slice(1)}` : `:(glob)${glob}`,
	);
	if (!pathspecs.some((spec) => spec.startsWith(":(glob)"))) return false;
	return (
		gitLines(root, [
			"diff",
			"--name-only",
			"--no-renames",
			`${base}...HEAD`,
			"--",
			...pathspecs,
		]).length > 0
	);
}

function toolFolder(
	runFolder: string,
	tool: ToolVersion,
	env: Env,
): string | undefined {
	const folder = join(runFolder, `${tool.tool}-${tool.version}`);
	mkdirSync(folder, { recursive: true });
	if (tool.tool === "bun") {
		const located = spawnSync(
			"bunx",
			[`bun@${tool.version}`, "-e", "console.log(process.execPath)"],
			{ env, encoding: "utf8" },
		);
		const binary = located.status === 0 ? located.stdout.trim() : "";
		if (binary !== "") {
			symlinkSync(binary, join(folder, "bun"));
			symlinkSync(binary, join(folder, "bunx"));
		}
	} else {
		const script = join(folder, "supabase");
		writeFileSync(
			script,
			`#!/bin/sh\nexec bunx supabase@${tool.version} "$@"\n`,
		);
		chmodSync(script, 0o755);
	}
	const version = spawnSync(join(folder, tool.tool), ["--version"], {
		env,
		encoding: "utf8",
	});
	if (version.status === 0 && version.stdout.trim() === tool.version)
		return folder;
	rmSync(folder, { recursive: true, force: true });
	return undefined;
}

function prepared(io: GateIo, gate: ProfileGate, env: Env): string | undefined {
	const missing = gate.sessionEnv.filter((name) => !io.env[name]);
	if (missing.length > 0) return `${missing.join(", ")} is not set`;
	for (const prerequisite of gate.requires) {
		if (bash(io, prerequisite.check, env) === 0) continue;
		if (prerequisite.start === undefined)
			return `the check of ${prerequisite.name} fails`;
		bash(io, prerequisite.start, env);
		if (bash(io, prerequisite.check, env) !== 0)
			return `the check of ${prerequisite.name} fails after its start command`;
	}
	for (const command of gate.setup) {
		const exit = bash(io, command, env);
		if (exit !== 0) return `the setup command ${command} exits ${exit}`;
	}
	return undefined;
}

function restore(io: GateIo, gate: ProfileGate, before: readonly string[]) {
	const changed = new Set(gitLines(io.root, ["diff", "--name-only"]));
	for (const path of gate.rewrites) {
		if (before.includes(path) || !changed.has(path)) continue;
		runGit(io.root, ["checkout", "--", path]);
		io.say(`${gateLabel(gate.name)}_RESTORED=${path}`);
	}
}

function runGate(
	io: GateIo,
	gate: ProfileGate,
	folders: ReadonlyMap<string, string>,
): GateOutcome {
	const label = gateLabel(gate.name);
	const tools = gate.tools.flatMap((tool) => {
		const folder = folders.get(`${tool.tool}@${tool.version}`);
		return folder === undefined ? [] : [folder];
	});
	const env = gateEnv(gate, io.env, tools);
	const before = gitLines(io.root, ["diff", "--name-only"]);
	const unready = prepared(io, gate, env);
	if (unready !== undefined) {
		restore(io, gate, before);
		return { kind: "not-started", reason: unready };
	}
	io.say(`${label}_CMD=${gate.command}`);
	const exit = bash(io, gate.command, env);
	restore(io, gate, before);
	return exit === 0 ? { kind: "passed" } : { kind: "red", exit: String(exit) };
}

export function runGates(
	io: GateIo,
	gates: readonly ProfileGate[],
	base: string,
): readonly GateRun[] {
	const runFolder = mkdtempSync(join(tmpdir(), "astack-gates-"));
	const folders = new Map<string, string>();
	const runs: GateRun[] = [];
	try {
		for (const gate of gates) {
			if (!gateApplies(io.root, base, gate.whenChanged)) {
				runs.push({ name: gate.name, outcome: { kind: "skipped" } });
				continue;
			}
			for (const tool of gate.tools) {
				const key = `${tool.tool}@${tool.version}`;
				if (folders.has(key)) continue;
				const folder = toolFolder(runFolder, tool, io.env);
				io.say(`TOOL ${key}=${folder ?? "LOCAL"}`);
				if (folder !== undefined) folders.set(key, folder);
			}
			const blocker = gate.after.find(
				(name) =>
					runs.find((run) => run.name === name)?.outcome.kind !== "passed",
			);
			runs.push({
				name: gate.name,
				outcome:
					blocker === undefined
						? runGate(io, gate, folders)
						: { kind: "blocked", by: blocker },
			});
		}
	} finally {
		rmSync(runFolder, { recursive: true, force: true });
	}
	return runs;
}

function recordFile(env: Env, head: string): string | undefined {
	const state = stateDir(env);
	const name = sessionFileName(head);
	return state === undefined || name === undefined
		? undefined
		: join(state, "gates", `${name}.json`);
}

export function saveGateRecord(
	env: Env,
	record: GateRecord,
): string | undefined {
	const path = recordFile(env, record.head);
	if (path === undefined) return undefined;
	mkdirSync(join(path, ".."), { recursive: true });
	const temporary = `${path}.${process.pid}.tmp`;
	writeFileSync(temporary, `${JSON.stringify(record, null, "\t")}\n`);
	renameSync(temporary, path);
	return path;
}

function names(value: unknown): readonly string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const listed = value.filter(
		(item): item is string => typeof item === "string",
	);
	return listed.length === value.length ? listed : undefined;
}

export function loadGateRecord(env: Env, head: string): GateRecord | undefined {
	const path = recordFile(env, head);
	if (path === undefined) return undefined;
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return undefined;
	}
	if (typeof parsed !== "object" || parsed === null) return undefined;
	const field = (key: string): unknown => Reflect.get(parsed, key);
	const base = field("base");
	const baseSha = field("baseSha");
	const profile = field("profile");
	const ran = names(field("ran"));
	const skipped = names(field("skipped"));
	return field("head") === head &&
		typeof base === "string" &&
		typeof baseSha === "string" &&
		typeof profile === "string" &&
		ran !== undefined &&
		skipped !== undefined
		? { head, base, baseSha, profile, ran, skipped }
		: undefined;
}
