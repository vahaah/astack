import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import {
	basename,
	dirname,
	isAbsolute,
	join,
	relative,
	resolve,
} from "node:path";

export interface SkillPathEnv {
	pluginRoot: string | undefined;
	configDirs: string[];
	cwd: string;
	cursorHome?: string;
}

export interface SkillRef {
	plugin: string;
	skill: string;
}

const NAME = /^[a-z0-9][a-z0-9-]*$/;

export function parseSkillRef(ref: string): SkillRef | undefined {
	const [plugin = "", skill = "", ...rest] = ref.split(":");
	if (rest.length > 0 || !NAME.test(plugin) || !NAME.test(skill))
		return undefined;
	return { plugin, skill };
}

function readJson(path: string): unknown {
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return undefined;
	}
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function manifestName(root: string): string {
	const manifest = readJson(join(root, ".claude-plugin", "plugin.json"));
	const name = isRecord(manifest) ? manifest.name : undefined;
	return typeof name === "string" ? name : basename(root);
}

function isInside(child: string, parent: string): boolean {
	const rel = relative(parent, child);
	return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

interface InstallRecord {
	marketplace: string;
	installPath: string;
	scope: string;
	projectPath: string | undefined;
}

function installRecords(configDir: string, plugin: string): InstallRecord[] {
	const parsed = readJson(join(configDir, "plugins", "installed_plugins.json"));
	const plugins = isRecord(parsed) ? parsed.plugins : undefined;
	if (!isRecord(plugins)) return [];
	const records: InstallRecord[] = [];
	for (const [key, value] of Object.entries(plugins)) {
		const [name = "", marketplace = ""] = key.split("@");
		if (name !== plugin || !Array.isArray(value)) continue;
		for (const entry of value) {
			if (!isRecord(entry)) continue;
			const record = entry;
			if (typeof record.installPath !== "string") continue;
			records.push({
				marketplace,
				installPath: record.installPath,
				scope: typeof record.scope === "string" ? record.scope : "user",
				projectPath:
					typeof record.projectPath === "string"
						? record.projectPath
						: undefined,
			});
		}
	}
	return records;
}

function cacheMarketplace(root: string | undefined): string | undefined {
	if (!root) return undefined;
	const parts = resolve(root).split("/");
	const at = parts.lastIndexOf("cache");
	return at >= 0 ? parts[at + 1] : undefined;
}

function newestFirst(dirs: string[]): string[] {
	const stamped = dirs.flatMap((dir) => {
		try {
			return [{ dir, mtime: statSync(dir).mtimeMs }];
		} catch {
			return [];
		}
	});
	return stamped.sort((a, b) => b.mtime - a.mtime).map((entry) => entry.dir);
}

export function pluginCandidates(plugin: string, env: SkillPathEnv): string[] {
	const candidates: string[] = [];
	const root = env.pluginRoot ? resolve(env.pluginRoot) : undefined;
	if (root && manifestName(root) === plugin) candidates.push(root);
	if (root) {
		const sibling = join(dirname(root), plugin);
		if (existsSync(sibling) && manifestName(sibling) === plugin)
			candidates.push(sibling);
	}
	const marketplace = cacheMarketplace(root);
	const cwd = resolve(env.cwd);
	const records = env.configDirs.flatMap((dir) => installRecords(dir, plugin));
	const scopeRank = (record: InstallRecord): number => {
		if (!record.projectPath) return 1;
		return isInside(cwd, resolve(record.projectPath)) ? 0 : 2;
	};
	const rank = (record: InstallRecord): number =>
		scopeRank(record) * 2 + (record.marketplace === marketplace ? 0 : 1);
	for (const record of [...records].sort((a, b) => rank(a) - rank(b)))
		candidates.push(record.installPath);
	if (root && marketplace) {
		const versions = join(dirname(dirname(root)), plugin);
		try {
			candidates.push(
				...newestFirst(
					readdirSync(versions).map((name) => join(versions, name)),
				),
			);
		} catch {}
	}
	return [...new Set(candidates)];
}

function listDir(dir: string): string[] {
	try {
		return readdirSync(dir);
	} catch {
		return [];
	}
}

export function isCursorPlugin(root: string | undefined): root is string {
	return (
		root !== undefined &&
		existsSync(join(resolve(root), ".cursor-plugin", "plugin.json"))
	);
}

function cursorPluginRoots(cursorHome: string, plugin: string): string[] {
	const plugins = join(cursorHome, "plugins");
	return [
		join(plugins, "local", plugin),
		...listDir(join(plugins, "cache")).flatMap((marketplace) => {
			const versions = join(plugins, "cache", marketplace, plugin);
			return newestFirst(listDir(versions).map((name) => join(versions, name)));
		}),
	];
}

function flatSkillDirs(
	ref: SkillRef,
	pluginRoot: string,
	cursorHome: string | undefined,
): string[] {
	const astack = [
		resolve(pluginRoot),
		...(cursorHome ? cursorPluginRoots(cursorHome, "astack") : []),
	];
	const native =
		cursorHome && ref.plugin !== "astack"
			? cursorPluginRoots(cursorHome, ref.plugin)
			: [];
	return [
		...new Set([
			...astack.map((root) => join(root, "skills", `astack-${ref.skill}`)),
			...native.map((root) => join(root, "skills", ref.skill)),
		]),
	];
}

function skillFileIn(
	skillDir: string,
	file: string | undefined,
): string | undefined {
	const skillFile = join(skillDir, "SKILL.md");
	if (!existsSync(skillFile)) return undefined;
	if (!file) return skillFile;
	const target = resolve(skillDir, file);
	return isInside(target, skillDir) && existsSync(target) ? target : undefined;
}

export function resolveSkillPath(
	ref: SkillRef,
	file: string | undefined,
	env: SkillPathEnv,
): string | undefined {
	if (isCursorPlugin(env.pluginRoot)) {
		for (const dir of flatSkillDirs(ref, env.pluginRoot, env.cursorHome)) {
			const found = skillFileIn(dir, file);
			if (found) return found;
		}
		return undefined;
	}
	for (const root of pluginCandidates(ref.plugin, env)) {
		const found = skillFileIn(join(root, "skills", ref.skill), file);
		if (found) return found;
	}
	return undefined;
}

export function principleSkills(env: SkillPathEnv): Set<string> | undefined {
	const skill = resolveSkillPath(
		{ plugin: "astack", skill: "principles" },
		undefined,
		env,
	);
	if (!skill) return undefined;
	const names = listDir(join(dirname(skill), "references"))
		.filter((name) => name.endsWith(".md"))
		.map((name) => name.slice(0, -".md".length));
	return names.length > 0 ? new Set(names) : undefined;
}

export function defaultSkillPathEnv(
	env: Record<string, string | undefined>,
	scriptPath: string | undefined,
	cwd: string,
): SkillPathEnv {
	const configDirs = [
		env.CLAUDE_CONFIG_DIR,
		join(env.HOME ?? homedir(), ".claude"),
	].filter((dir): dir is string => Boolean(dir));
	return {
		pluginRoot:
			env.CLAUDE_PLUGIN_ROOT ||
			(scriptPath ? resolve(dirname(scriptPath), "..") : undefined),
		configDirs: [...new Set(configDirs.map((dir) => resolve(dir)))],
		cwd,
		cursorHome: join(env.HOME ?? homedir(), ".cursor"),
	};
}
