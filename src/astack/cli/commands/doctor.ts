import { spawnSync } from "node:child_process";
import {
	accessSync,
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
import { basename, dirname, join } from "node:path";
import {
	type ClaudeProfile,
	type CodexState,
	type CursorState,
	diagnose,
	failed,
	type Install,
	type ProfileState,
	render,
	type SkillFolder,
	type Snapshot,
} from "../../doctor.ts";
import { repoRoot } from "../../git.ts";
import { PROFILE_PATH } from "../../profile.ts";
import type { Command } from "../command.ts";
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

export const NODE_FLOOR = 22;

function nodeMajor(path: string): number | undefined {
	if (basename(path).startsWith("bun")) return undefined;
	const result = spawnSync(path, ["--version"], {
		encoding: "utf8",
		timeout: 5000,
	});
	const major = /^v?(\d+)\./.exec(result.stdout ?? "")?.[1];
	return major === undefined ? undefined : Number(major);
}

function usable(path: string | undefined): path is string {
	if (!executable(path)) return false;
	const major = nodeMajor(path);
	return major === undefined
		? basename(path).startsWith("bun")
		: major >= NODE_FLOOR;
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
	const candidates = [
		env.ASTACK_RUNTIME,
		saved,
		"/usr/bin/node",
		"/bin/node",
		"/opt/homebrew/bin/node",
		"/opt/homebrew/bin/bun",
		"/usr/local/bin/node",
		"/usr/local/bin/bun",
		join(home, ".bun", "bin", "bun"),
		join(home, ".volta", "bin", "node"),
		...nvmNodes(home),
	];
	const found = candidates.find(usable);
	const old =
		found === undefined
			? candidates.find(
					(path): path is string =>
						executable(path) && (nodeMajor(path) ?? NODE_FLOOR) < NODE_FLOOR,
				)
			: undefined;
	return { found, old };
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
	return [...new Set(dirs)].filter((dir) =>
		existsSync(join(dir, "plugins", "installed_plugins.json")),
	);
}

function claudeProfiles(env: Io["env"], home: string): ClaudeProfile[] {
	return claudeDirs(env, home).map((dir) => ({
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
	};
}

function codex(env: Io["env"], home: string): CodexState | undefined {
	const codexHome = env.CODEX_HOME || join(home, ".codex");
	const config = readText(join(codexHome, "config.toml"));
	return config === undefined
		? undefined
		: codexState(codexHome, config, readText(join(codexHome, "AGENTS.md")));
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

export function gather(io: Io): Snapshot {
	const home = io.env.HOME || homedir();
	const claude = claudeProfiles(io.env, home);
	return {
		runtime: { current: currentRuntime(), ...guiRuntime(io.env, home) },
		claude,
		codex: codex(io.env, home),
		cursor: cursor(home),
		agentsSkills: list(join(home, ".agents", "skills")),
		claudeSkills: claudeSkillFolders(claude, home),
		profile: profileState(io.cwd),
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

function run(args: readonly string[], io: Io): number {
	const unknown = args.filter(
		(arg) => arg !== "--save-runtime" && arg !== "--json",
	);
	if (unknown.length > 0)
		return usageError(
			io,
			`astack doctor: unknown argument ${unknown.join(" ")}`,
		);
	if (args.includes("--save-runtime")) return saveRuntime(io);
	const findings = diagnose(gather(io));
	io.out(
		args.includes("--json")
			? `${JSON.stringify(findings, null, 2)}\n`
			: `${render(findings)}\n`,
	);
	return failed(findings) ? 1 : 0;
}

export const command: Command = {
	name: "doctor",
	summary:
		"Reports the runtime, the astack copies of each tool, duplicate skills, untrusted Codex hooks, output-style plugins and the repo profile. Reads only, and exits 1 on a failure. --save-runtime writes the runtime path for the launcher.",
	usage: "doctor [--json]\ndoctor --save-runtime",
	run,
};
