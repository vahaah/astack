import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
	defaultSkillPathEnv,
	parseSkillRef,
	principleSkills,
	resolveSkillPath,
	type SkillPathEnv,
} from "../../src/astack/skill-path.ts";

const ROOT = resolve(import.meta.dir, "../..");
const LAUNCHER = join(ROOT, "marketplace/plugins/astack/bin/astack");
const dirs: string[] = [];

afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function scratch(): string {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), "astack-skill-path-")));
	dirs.push(dir);
	return dir;
}

function plugin(root: string, name: string, skills: string[]): string {
	mkdirSync(join(root, ".claude-plugin"), { recursive: true });
	writeFileSync(
		join(root, ".claude-plugin/plugin.json"),
		JSON.stringify({ name }),
	);
	for (const skill of skills) {
		mkdirSync(join(root, "skills", skill, "references"), { recursive: true });
		writeFileSync(join(root, "skills", skill, "SKILL.md"), `# ${skill}\n`);
		writeFileSync(
			join(root, "skills", skill, "references/notes.md"),
			"notes\n",
		);
	}
	return root;
}

function installed(
	configDir: string,
	records: Record<string, unknown[]>,
): void {
	mkdirSync(join(configDir, "plugins"), { recursive: true });
	writeFileSync(
		join(configDir, "plugins/installed_plugins.json"),
		JSON.stringify({ version: 2, plugins: records }),
	);
}

function find(
	ref: string,
	env: SkillPathEnv,
	file?: string,
): string | undefined {
	const parsed = parseSkillRef(ref);
	if (!parsed) throw new Error(`bad ref ${ref}`);
	return resolveSkillPath(parsed, file, env);
}

describe("astack skill-path", () => {
	test("finds a sibling plugin in an in-place marketplace", () => {
		const dir = scratch();
		const sibling = "pstack";
		const astack = plugin(join(dir, "plugins/astack"), "astack", ["plan"]);
		plugin(join(dir, "plugins", sibling), sibling, ["architect"]);
		const env = { pluginRoot: astack, configDirs: [], cwd: dir };
		expect(find(`${sibling}:architect`, env)).toBe(
			join(dir, "plugins", sibling, "skills/architect/SKILL.md"),
		);
		expect(find("astack:plan", env)).toBe(join(astack, "skills/plan/SKILL.md"));
		expect(find(`${sibling}:architect`, env, "references/notes.md")).toBe(
			join(dir, "plugins", sibling, "skills/architect/references/notes.md"),
		);
	});

	test("finds a cached install through installed_plugins.json, project scope first", () => {
		const dir = scratch();
		const sibling = "pstack";
		const cache = join(dir, "config/plugins/cache/team");
		const astack = plugin(join(cache, "astack/1.0.0"), "astack", ["plan"]);
		const userCopy = plugin(join(cache, `${sibling}/0.1.0`), sibling, ["how"]);
		const projectCopy = plugin(join(cache, `${sibling}/0.2.0`), sibling, [
			"how",
		]);
		const project = join(dir, "work/repo");
		mkdirSync(project, { recursive: true });
		installed(join(dir, "config"), {
			[`${sibling}@team`]: [
				{ scope: "user", installPath: userCopy },
				{ scope: "project", projectPath: project, installPath: projectCopy },
			],
		});
		const env = {
			pluginRoot: astack,
			configDirs: [join(dir, "config")],
			cwd: join(project, "src"),
		};
		expect(find(`${sibling}:how`, env)).toBe(
			join(projectCopy, "skills/how/SKILL.md"),
		);
		expect(find(`${sibling}:how`, { ...env, cwd: dir })).toBe(
			join(userCopy, "skills/how/SKILL.md"),
		);
	});

	test("falls back to the newest cached version beside astack", () => {
		const dir = scratch();
		const sibling = "flow";
		const cache = join(dir, "plugins/cache/team");
		const astack = plugin(join(cache, "astack/1.0.0"), "astack", ["plan"]);
		const old = plugin(join(cache, `${sibling}/1.0.0`), sibling, ["grilling"]);
		const fresh = plugin(join(cache, `${sibling}/1.1.0`), sibling, [
			"grilling",
		]);
		utimesSync(old, new Date("2026-01-01"), new Date("2026-01-01"));
		utimesSync(fresh, new Date("2026-10-01"), new Date("2026-10-01"));
		expect(
			find(`${sibling}:grilling`, {
				pluginRoot: astack,
				configDirs: [],
				cwd: dir,
			}),
		).toBe(join(fresh, "skills/grilling/SKILL.md"));
	});

	test("reports a missing plugin, skill or file as not installed", () => {
		const dir = scratch();
		const sibling = "pstack";
		const other = "flow";
		const astack = plugin(join(dir, "plugins/astack"), "astack", ["plan"]);
		plugin(join(dir, "plugins", sibling), sibling, ["architect"]);
		const env = { pluginRoot: astack, configDirs: [], cwd: dir };
		expect(find(`${other}:grilling`, env)).toBeUndefined();
		expect(find(`${sibling}:why`, env)).toBeUndefined();
		expect(
			find(`${sibling}:architect`, env, "references/missing.md"),
		).toBeUndefined();
		expect(
			find(`${sibling}:architect`, env, "../../../astack/skills/plan/SKILL.md"),
		).toBeUndefined();
	});

	test("ignores a sibling directory whose manifest names another plugin", () => {
		const dir = scratch();
		const sibling = "pstack";
		const astack = plugin(join(dir, "plugins/astack"), "astack", ["plan"]);
		plugin(join(dir, "plugins", sibling), `not-${sibling}`, ["architect"]);
		expect(
			find(`${sibling}:architect`, {
				pluginRoot: astack,
				configDirs: [],
				cwd: dir,
			}),
		).toBeUndefined();
	});

	test("inside a Cursor plugin it finds each flat skill as astack-<name>, else the skill of the native plugin", () => {
		const dir = scratch();
		const cursor = join(dir, "local", "astack");
		plugin(cursor, "astack", ["astack-plan", "astack-grilling", "astack-how"]);
		mkdirSync(join(cursor, ".cursor-plugin"));
		writeFileSync(join(cursor, ".cursor-plugin/plugin.json"), "{}");
		const cursorHome = join(dir, ".cursor");
		const native = "pstack";
		const other = "flow";
		const pstack = plugin(
			join(cursorHome, `plugins/cache/cursor-public/${native}/abc`),
			native,
			["how", "poteto-mode"],
		);
		const env = { pluginRoot: cursor, configDirs: [], cwd: dir, cursorHome };
		expect(find("astack:plan", env)).toBe(
			join(cursor, "skills/astack-plan/SKILL.md"),
		);
		expect(find(`${other}:grilling`, env, "references/notes.md")).toBe(
			join(cursor, "skills/astack-grilling/references/notes.md"),
		);
		expect(find(`${native}:how`, env)).toBe(
			join(cursor, "skills/astack-how/SKILL.md"),
		);
		expect(find(`${native}:poteto-mode`, env, "references/notes.md")).toBe(
			join(pstack, "skills/poteto-mode/references/notes.md"),
		);
		const claude = plugin(join(dir, "plugins/astack"), "astack", ["plan"]);
		expect(
			find(`${native}:how`, {
				pluginRoot: claude,
				configDirs: [],
				cwd: dir,
				cursorHome,
			}),
		).toBeUndefined();
	});

	test.each([
		"astack",
		"astack:",
		":how",
		"Astack:how",
		"a:b:c",
		"astack:../how",
	])("refuses the reference %p", (ref) => {
		expect(parseSkillRef(ref)).toBeUndefined();
	});

	test("takes the plugin root from CLAUDE_PLUGIN_ROOT, else from the script path", () => {
		expect(
			defaultSkillPathEnv(
				{ CLAUDE_PLUGIN_ROOT: "/p/astack", HOME: "/h" },
				"/x/bin/astack.js",
				"/w",
			),
		).toEqual({
			pluginRoot: "/p/astack",
			configDirs: ["/h/.claude"],
			cwd: "/w",
			cursorHome: "/h/.cursor",
		});
		expect(
			defaultSkillPathEnv(
				{ CLAUDE_CONFIG_DIR: "/c", HOME: "/h" },
				"/x/bin/astack.js",
				"/w",
			),
		).toEqual({
			pluginRoot: "/x",
			configDirs: ["/c", "/h/.claude"],
			cwd: "/w",
			cursorHome: "/h/.cursor",
		});
	});

	test("principleSkills returns the 24 references of astack:principles and each reference contains no CLAUDE_SKILL_DIR", () => {
		const env = {
			pluginRoot: join(ROOT, "marketplace/plugins/astack"),
			configDirs: [],
			cwd: ROOT,
		};
		const names = principleSkills(env);
		expect(names?.size).toBe(24);
		for (const name of names ?? []) {
			const path = find("astack:principles", env, `references/${name}.md`);
			expect(path).toBe(
				join(
					ROOT,
					`marketplace/plugins/astack/skills/principles/references/${name}.md`,
				),
			);
			expect(readFileSync(path ?? "", "utf8")).not.toContain(
				["$", "{CLAUDE_SKILL_DIR}"].join(""),
			);
		}
	});

	test("the bundled launcher resolves this marketplace's plugin and exits 1 when missing", () => {
		const ok = spawnSync(
			LAUNCHER,
			["skill-path", "astack:architect", "references/design-red-flags.md"],
			{
				encoding: "utf8",
				env: {
					...process.env,
					CLAUDE_PLUGIN_ROOT: "",
					HOME: scratch(),
					CLAUDE_CONFIG_DIR: "",
				},
			},
		);
		expect(ok.status).toBe(0);
		expect(ok.stdout).toBe(
			`${join(ROOT, "marketplace/plugins/astack/skills/architect/references/design-red-flags.md")}\n`,
		);
		const missing = spawnSync(
			LAUNCHER,
			["skill-path", "astack:no-such-skill"],
			{ encoding: "utf8" },
		);
		expect(missing.status).toBe(1);
		expect(missing.stderr).toBe(
			"astack skill-path: astack:no-such-skill not installed\n",
		);
	});
});
