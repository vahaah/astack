import {
	accessSync,
	appendFileSync,
	constants,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	realpathSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { unattendedReason } from "../../attended.ts";
import { readCodexHooks } from "../../codex-hooks.ts";
import {
	type ClaudeProfile,
	type CodexState,
	type CursorState,
	diagnose,
	failed,
	type Install,
	type ProfileState,
	readBases,
	render,
	type SkillFolder,
	type Snapshot,
	sumSteEvents,
} from "../../doctor.ts";
import { originSlug, repoRoot } from "../../git.ts";
import { MANAGED_PATHS } from "../../managed.ts";
import { ghJson } from "../../pr/github.ts";
import { parseMergeProfile } from "../../pr/profile.ts";
import { reviewProfileState } from "../../pr-review-profile.ts";
import { runProcess } from "../../process.ts";
import { loadProfile, PROFILE_PATH, readProfileJson } from "../../profile.ts";
import { stateDir } from "../../state.ts";
import { EVENTS_FILE } from "../../ste/state.ts";
import type { Command } from "../command.ts";
import { NODE_FLOOR } from "../floor.ts";
import { type Io, usageError } from "../io.ts";

type Json = Readonly<Record<string, unknown>>;

function isJson(value: unknown): value is Json {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readText(path: string): string | undefined {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return undefined;
	}
}

function readJson(path: string): unknown {
	const text = readText(path);
	if (text === undefined) return undefined;
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

function list(dir: string): string[] {
	try {
		return readdirSync(dir).sort();
	} catch {
		return [];
	}
}

function executable(path: string | undefined): path is string {
	if (!path) return false;
	try {
		accessSync(path, constants.X_OK);
		return statSync(path).isFile();
	} catch {
		return false;
	}
}

export function savedRuntimePath(home: string): string {
	return join(home, ".local", "state", "astack", "runtime");
}

export function skipFilePath(home: string): string {
	return join(dirname(savedRuntimePath(home)), "skip-profiles");
}

function skippedProfiles(home: string): string[] {
	return (readText(skipFilePath(home)) ?? "")
		.split("\n")
		.filter((line) => line !== "");
}

function nodeMajor(path: string): number | undefined {
	if (basename(path).startsWith("bun")) return undefined;
	const run = runProcess(path, ["--version"], { timeoutMs: 5000 });
	const stdout = run.ok ? run.value.stdout.toString("utf8") : "";
	const major = /^v?(\d+)\./.exec(stdout)?.[1];
	return major === undefined ? undefined : Number(major);
}

function nvmNodes(home: string): string[] {
	const root = join(home, ".nvm", "versions", "node");
	return list(root)
		.map((version) => join(root, version, "bin", "node"))
		.filter((path) => executable(path))
		.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
}

function guiRuntime(
	env: Io["env"],
	home: string,
): { readonly found: string | undefined; readonly old: string | undefined } {
	const saved = readText(savedRuntimePath(home))?.split("\n")[0];
	const pick = [
		env.ASTACK_RUNTIME,
		saved,
		"/usr/bin/bun",
		"/bin/bun",
		"/usr/bin/node",
		"/bin/node",
		"/opt/homebrew/bin/bun",
		"/opt/homebrew/bin/node",
		"/usr/local/bin/bun",
		"/usr/local/bin/node",
		join(home, ".bun", "bin", "bun"),
		join(home, ".volta", "bin", "node"),
		...nvmNodes(home),
	].find(executable);
	return pick !== undefined && (nodeMajor(pick) ?? NODE_FLOOR) < NODE_FLOOR
		? { found: undefined, old: pick }
		: { found: pick, old: undefined };
}

function currentRuntime(): string {
	const bun = process.versions.bun;
	return bun === undefined
		? `node ${process.version} at ${process.execPath}`
		: `bun ${bun} at ${process.execPath}`;
}

function hasStopHook(installPath: string): boolean {
	const hooks = readJson(join(installPath, "hooks", "hooks.json"));
	return isJson(hooks) && isJson(hooks.hooks) && "Stop" in hooks.hooks;
}

function installsOf(dir: string): Install[] {
	const parsed = readJson(join(dir, "plugins", "installed_plugins.json"));
	const plugins = isJson(parsed) ? parsed.plugins : undefined;
	if (!isJson(plugins)) return [];
	return Object.entries(plugins).flatMap(([id, entries]) => {
		const [plugin = id, marketplace = ""] = id.split("@");
		return (Array.isArray(entries) ? entries : []).flatMap(
			(entry): Install[] => {
				if (!isJson(entry) || typeof entry.installPath !== "string") return [];
				const path = entry.installPath;
				return [
					{
						plugin,
						marketplace,
						path,
						skills: list(join(path, "skills")).filter((name) =>
							existsSync(join(path, "skills", name, "SKILL.md")),
						),
						stopHook: hasStopHook(path),
					},
				];
			},
		);
	});
}

function enabledPlugins(dir: string): string[] {
	const settings = readJson(join(dir, "settings.json"));
	const enabled = isJson(settings) ? settings.enabledPlugins : undefined;
	return isJson(enabled)
		? Object.entries(enabled)
				.filter(([, on]) => on === true)
				.map(([id]) => id)
		: [];
}

function ruleCardBytes(dir: string): number | undefined {
	try {
		return statSync(join(dir, "rules", "astack.md")).size;
	} catch {
		return undefined;
	}
}

function claudeDirs(env: Io["env"], home: string): string[] {
	const dirs = [
		env.CLAUDE_CONFIG_DIR,
		join(home, ".claude"),
		...list(home)
			.filter((name) => name.startsWith(".claude-"))
			.map((name) => join(home, name)),
	].filter((dir): dir is string => Boolean(dir));
	return [...new Set(dirs.map((dir) => resolve(dir)))].filter((dir) =>
		existsSync(join(dir, "plugins", "installed_plugins.json")),
	);
}

function claudeProfiles(dirs: readonly string[]): ClaudeProfile[] {
	return dirs.map((dir) => ({
		dir,
		installs: installsOf(dir),
		enabled: enabledPlugins(dir),
		ruleCard: ruleCardBytes(dir),
		ruleNames: list(join(dir, "rules")),
		readableRules: list(join(dir, "rules")).filter(
			(name) => readText(join(dir, "rules", name)) !== undefined,
		),
	}));
}

export type TomlTables = ReadonlyMap<string, Readonly<Record<string, string>>>;

export function tomlTables(text: string): TomlTables {
	const tables = new Map<string, Record<string, string>>();
	let current: Record<string, string> | undefined;
	for (const raw of text.split("\n")) {
		const line = raw.trim();
		const header = /^\[([^[\]]+)\]$/.exec(line);
		if (header?.[1]) {
			current = {};
			tables.set(header[1].trim(), current);
			continue;
		}
		const pair = /^([\w-]+)\s*=\s*(.+)$/.exec(line);
		if (current && pair?.[1] && pair[2]) current[pair[1]] = pair[2].trim();
	}
	return tables;
}

function quotedKey(header: string, prefix: string): string | undefined {
	const match = new RegExp(`^${prefix.replaceAll(".", "\\.")}\\."(.+)"$`).exec(
		header,
	);
	return match?.[1];
}

export function codexState(
	home: string,
	config: string,
	agents: string | undefined,
): CodexState {
	const tables = [...tomlTables(config)];
	return {
		home,
		enabled: tables.flatMap(([header, values]) => {
			const id = quotedKey(header, "plugins");
			return id !== undefined && values.enabled === "true" ? [id] : [];
		}),
		trusted: Object.fromEntries(
			tables.flatMap(([header, values]) => {
				const key = quotedKey(header, "hooks.state");
				const hash = values.trusted_hash?.replace(/^"(.*)"$/, "$1");
				return key !== undefined && hash !== undefined ? [[key, hash]] : [];
			}),
		),
		fragment:
			agents === undefined
				? undefined
				: /<!-- astack (\S+) -->/.exec(agents)?.[1],
		hooks: undefined,
	};
}

export const CODEX_HOOKS_TIMEOUT_MS = 10_000;

async function codex(io: Io, home: string): Promise<CodexState | undefined> {
	const codexHome = io.env.CODEX_HOME || join(home, ".codex");
	const config = readText(join(codexHome, "config.toml"));
	if (config === undefined) return undefined;
	const state = codexState(
		codexHome,
		config,
		readText(join(codexHome, "AGENTS.md")),
	);
	return state.enabled.some((id) => id.startsWith("astack@"))
		? {
				...state,
				hooks: await readCodexHooks({
					cwd: io.cwd,
					env: io.env,
					timeoutMs: CODEX_HOOKS_TIMEOUT_MS,
				}),
			}
		: state;
}

function cursor(home: string): CursorState | undefined {
	const root = join(home, ".cursor", "plugins");
	if (!existsSync(root)) return undefined;
	const manifest = readJson(
		join(root, "local", "astack", ".cursor-plugin", "plugin.json"),
	);
	const installed = readJson(join(root, "installed.json"));
	const user = isJson(installed) ? installed.user : undefined;
	return {
		local:
			isJson(manifest) && typeof manifest.version === "string"
				? manifest.version
				: undefined,
		imported: Array.isArray(user)
			? user.filter((id): id is string => typeof id === "string")
			: [],
	};
}

function profileState(cwd: string): ProfileState {
	const repo = repoRoot(cwd) ?? cwd;
	const path = join(repo, PROFILE_PATH);
	if (!existsSync(path)) return { kind: "absent", repo };
	const parsed = readJson(path);
	return isJson(parsed)
		? { kind: "present", repo, keys: Object.keys(parsed).sort() }
		: { kind: "invalid", repo };
}

function real(path: string): string | undefined {
	try {
		return realpathSync(path);
	} catch {
		return undefined;
	}
}

function claudeSkillFolders(
	profiles: readonly ClaudeProfile[],
	home: string,
): SkillFolder[] {
	const agents = real(join(home, ".agents", "skills"));
	const seen = new Set<string>();
	return profiles.flatMap((profile) => {
		const path = join(profile.dir, "skills");
		const resolved = real(path);
		if (resolved === undefined || resolved === agents || seen.has(resolved))
			return [];
		seen.add(resolved);
		const names = list(path).filter((name) => {
			const target = real(join(path, name));
			return (
				target !== undefined &&
				(agents === undefined || !target.startsWith(`${agents}/`))
			);
		});
		return [{ path, names }];
	});
}

function bases(cwd: string): Snapshot["bases"] {
	const root = repoRoot(cwd);
	const repo = root === undefined ? undefined : originSlug(root);
	if (root === undefined || repo === undefined) return undefined;
	return readBases(
		(args) => ghJson(root, args),
		repo,
		parseMergeProfile(readProfileJson(root)).standingBases,
	);
}

function steEventLogs(env: Io["env"]): readonly string[] {
	const root = stateDir(env);
	if (root === undefined) return [];
	const parent = join(root, "ste");
	return list(parent).flatMap((name) => {
		const text = readText(join(parent, name, EVENTS_FILE));
		return text === undefined ? [] : [text];
	});
}

export async function gather(io: Io): Promise<Snapshot> {
	const home = io.env.HOME || homedir();
	const repo = repoRoot(io.cwd) ?? io.cwd;
	const listed = claudeDirs(io.env, home);
	const skipList = skippedProfiles(home);
	const claude = claudeProfiles(
		listed.filter((dir) => !skipList.includes(dir)),
	);
	return {
		skipped: {
			file: skipFilePath(home),
			dirs: listed.filter((dir) => skipList.includes(dir)),
		},
		runtime: { current: currentRuntime(), ...guiRuntime(io.env, home) },
		claude,
		codex: await codex(io, home),
		cursor: cursor(home),
		agentsSkills: list(join(home, ".agents", "skills")),
		claudeSkills: claudeSkillFolders(claude, home),
		profile: profileState(io.cwd),
		bases: bases(io.cwd),
		reviewProfile: reviewProfileState(
			MANAGED_PATHS.reviewProfile,
			readText(join(repo, MANAGED_PATHS.reviewProfile)),
			loadProfile(repo).commentKeep,
		),
		unattendedReason: unattendedReason(io.env),
		steEvents: sumSteEvents(steEventLogs(io.env), io.now),
	};
}

function saveRuntime(io: Io): number {
	const home = io.env.HOME || homedir();
	const runtime = process.execPath;
	if (!/^(?:node|bun)$/.test(basename(runtime))) {
		io.err(
			`astack doctor: ${runtime} is not node or bun, so nothing was saved\n`,
		);
		return 1;
	}
	const path = savedRuntimePath(home);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${runtime}\n`);
	io.out(`saved ${runtime} to ${path}\n`);
	return 0;
}

function skipProfile(io: Io, value: string): number {
	const home = io.env.HOME || homedir();
	const dir = resolve(io.cwd, value);
	const listed = claudeDirs(io.env, home);
	if (!listed.includes(dir)) {
		io.err(
			`astack doctor: ${dir} is not a Claude config folder that doctor checks: ${listed.join(", ")}\n`,
		);
		return 1;
	}
	const file = skipFilePath(home);
	if (skippedProfiles(home).includes(dir)) {
		io.out(`${file} already lists ${dir}\n`);
		return 0;
	}
	try {
		mkdirSync(dirname(file), { recursive: true });
		appendFileSync(file, `${dir}\n`);
	} catch (error) {
		io.err(
			`astack doctor: cannot write ${file}: ${error instanceof Error ? error.message : String(error)}\n`,
		);
		return 1;
	}
	io.out(`doctor skips ${dir}, because ${file} lists it\n`);
	return 0;
}

async function run(args: readonly string[], io: Io): Promise<number> {
	if (args[0] === "--skip-profile") {
		const [, value, ...rest] = args;
		if (value === undefined || rest.length > 0)
			return usageError(io, "astack doctor: give --skip-profile <dir>");
		return skipProfile(io, value);
	}
	const unknown = args.filter(
		(arg) => arg !== "--save-runtime" && arg !== "--json",
	);
	if (unknown.length > 0)
		return usageError(
			io,
			`astack doctor: unknown argument ${unknown.join(" ")}`,
		);
	if (args.includes("--save-runtime")) return saveRuntime(io);
	const findings = diagnose(await gather(io));
	io.out(
		args.includes("--json")
			? `${JSON.stringify(findings, null, 2)}\n`
			: `${render(findings)}\n`,
	);
	return failed(findings) ? 1 : 0;
}

export const command: Command<Promise<number>> = {
	name: "doctor",
	summary:
		"Reports the runtime, the astack copies of each tool, duplicate skills, the hook trust that Codex reports, output-style plugins, the repo profile, the review profile with the rules of astack check hardening-profile, the protection of the default branch and the standing bases, and 7 days of hook findings. It reads at most 3 bases with gh. Exits 1 on a failure. It asks codex app-server for the hook trust, and codex keeps state in CODEX_HOME. --save-runtime writes the runtime path for the launcher. --skip-profile adds a Claude config folder to the skip file beside it, and doctor then prints one note for that folder.",
	usage: "doctor [--json]\ndoctor --save-runtime\ndoctor --skip-profile <dir>",
	run,
};
