import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	companionPaths,
	exampleCompanion,
} from "../../scripts/lib/companion.ts";
import { readMachinePaths } from "../../scripts/lib/global.ts";
import {
	codexState,
	describeMigration,
	type MigrationState,
	migrationPaths,
	migrationPending,
	migrationRefusal,
	migrationSteps,
	NEW_LINKS,
	OLD_PLUGINS,
	renderMigrationDoc,
	STEP_IDS,
	settingsState,
	stepStatus,
} from "../../scripts/lib/migration.ts";
import { PLUGIN_IDS } from "../../src/astack/marketplace.ts";

const ROOT = resolve(import.meta.dir, "../..");

const machine = await readMachinePaths(
	companionPaths(exampleCompanion(ROOT)).machine,
);
if (!machine.ok) throw new Error(machine.error);
const paths = migrationPaths(machine.value);

const before: MigrationState = {
	oldMarketplace: true,
	oldPlugins: ["craft@agent-stack", "flow@agent-stack", "pstack@agent-stack"],
	astackMarketplace: undefined,
	astackPlugins: [],
	oldRoot: true,
	newRoot: false,
	rootIsOld: true,
	savedCache: false,
	oldCache: true,
	oldLinks: ["agent-stack-coding.md", "agent-stack-comments.md"],
	newLinks: 0,
	tracked: { oldRules: 2, outputStylesOn: 2 },
	live: { oldRules: 2, outputStylesOn: 2 },
	strayConfig: false,
	leakedProjects: 4,
	codex: { oldRules: 0, outputStylesOn: 2 },
	codexAstack: false,
	cursorAstack: false,
};

const after: MigrationState = {
	oldMarketplace: false,
	oldPlugins: [],
	astackMarketplace: "/home/dev/Projects/astack/dist",
	astackPlugins: PLUGIN_IDS,
	oldRoot: false,
	newRoot: true,
	rootIsOld: false,
	savedCache: true,
	oldCache: false,
	oldLinks: [],
	newLinks: NEW_LINKS.length,
	tracked: { oldRules: 0, outputStylesOn: 0 },
	live: { oldRules: 0, outputStylesOn: 0 },
	strayConfig: false,
	leakedProjects: 0,
	codex: { oldRules: 0, outputStylesOn: 0 },
	codexAstack: true,
	cursorAstack: true,
};

const MANUAL = ["check", "close", "overlay", "verify", "probe"];

describe("the migration steps", () => {
	const steps = migrationSteps(paths);
	const commands = steps.flatMap((step) => [
		...step.run.flatMap((block) => (block.kind === "code" ? block.lines : [])),
		...step.check,
	]);

	test("run in the fixed order, one step for each id", () => {
		expect(steps.map((step) => step.id)).toEqual([...STEP_IDS]);
	});

	test("uninstall the old plugins before the rename, and install after it", () => {
		const index = (id: string) => steps.findIndex((step) => step.id === id);
		expect(index("save")).toBeLessThan(index("uninstall"));
		expect(index("uninstall")).toBeLessThan(index("rename"));
		expect(index("rename")).toBeLessThan(index("install"));
		expect(index("overlay")).toBeLessThan(index("settings"));
		expect(index("verify")).toBeLessThan(index("cleanup"));
	});

	test("never set CLAUDE_CONFIG_DIR to the default profile", () => {
		expect(
			commands.some((line) => line.includes("CLAUDE_CONFIG_DIR=~/.claude ")),
		).toBe(false);
		expect(
			commands.filter((line) =>
				line.startsWith("env -u CLAUDE_CONFIG_DIR claude plugin"),
			),
		).toHaveLength(OLD_PLUGINS.length + PLUGIN_IDS.length + 3);
	});

	test("install commands and enabled settings follow the marketplace", () => {
		expect(
			commands.filter((line) =>
				line.startsWith("env -u CLAUDE_CONFIG_DIR claude plugin install "),
			),
		).toEqual(
			PLUGIN_IDS.map(
				(id) =>
					`env -u CLAUDE_CONFIG_DIR claude plugin install ${id} --scope user`,
			),
		);
		expect(
			commands.filter((line) => line.startsWith("codex plugin add ")),
		).toEqual(PLUGIN_IDS.map((id) => `codex plugin add ${id}`));
		expect(
			[
				...commands
					.join("\n")
					.matchAll(/\.enabledPlugins\["([^"]+)"\] = true/g),
			].map((match) => match[1]),
		).toEqual([...PLUGIN_IDS]);
	});

	test("name each old and new object of the switch", () => {
		const all = commands.join("\n");
		for (const id of [
			"craft@agent-stack",
			"flow@agent-stack",
			"pstack@agent-stack",
		])
			expect(all).toContain(`plugin uninstall ${id}`);
		for (const id of PLUGIN_IDS) expect(all).toContain(`plugin install ${id}`);
		expect(all).toContain("plugin marketplace remove agent-stack");
		expect(all).toContain("plugin marketplace add ~/Projects/astack/dist");
		expect(all).toContain("mv ~/Projects/agent-stack ~/Projects/astack");
		expect(all).toContain("Read(~/Projects/astack/dist/**)");
		expect(all).toContain('"Bash(astack:*)"');
		expect(all).toContain(
			'.enabledPlugins["explanatory-output-style@claude-plugins-official"] = false',
		);
		expect(all).toContain(
			'.enabledPlugins["learning-output-style@claude-plugins-official"] = false',
		);
		expect(
			commands.filter((line) => line.endsWith(" claude plugin list")),
		).toEqual([
			"env -u CLAUDE_CONFIG_DIR claude plugin list",
			"CLAUDE_CONFIG_DIR=~/.claude-a claude plugin list",
			"CLAUDE_CONFIG_DIR=~/.claude-b claude plugin list",
		]);
	});

	test("docs/migration.md is the steps of the example machine, and names no other profile or dotfiles dir", () => {
		const doc = readFileSync(resolve(ROOT, "docs/migration.md"), "utf8");
		expect(doc).toBe(renderMigrationDoc(paths));
		expect([...new Set(doc.match(/~\/\.claude-[\w-]+/g))]).toEqual([
			"~/.claude-a",
			"~/.claude-b",
		]);
		expect(doc.match(/~\/[\w-]*dotfiles[\w/-]*/g)).toEqual(null);
		expect(doc).toContain("\ncd ~/config/claude\n");
	});

	test("the dry run keeps a multi-line command together", () => {
		const lines = describeMigration(paths, before);
		const start = lines.findIndex((line) => line.includes("$ jq --indent 2 '"));
		expect(lines[start + 1]).toStartWith("        .permissions.allow");
		expect(
			lines.filter((line) => line.startsWith("    $ ")).length,
		).toBeGreaterThan(30);
	});
});

describe("the migration state", () => {
	test("before the switch, every step that can be read is todo", () => {
		for (const id of STEP_IDS)
			expect(stepStatus(id, before)).toBe(
				MANUAL.includes(id) ? "manual" : "todo",
			);
		expect(migrationPending(before)).toBe(true);
	});

	test("after the switch, every step that can be read is done", () => {
		for (const id of STEP_IDS)
			expect(stepStatus(id, after)).toBe(
				MANUAL.includes(id) ? "manual" : "done",
			);
		expect(migrationPending(after)).toBe(false);
	});

	test("a real global apply refuses while the old install is active", () => {
		expect(migrationRefusal(before)).toContain("docs/migration.md");
		expect(migrationRefusal(after)).toBeUndefined();
	});

	test("an old plugin or the old root keeps the migration pending", () => {
		expect(
			migrationPending({ ...after, oldPlugins: ["craft@agent-stack"] }),
		).toBe(true);
		expect(migrationPending({ ...after, rootIsOld: true })).toBe(true);
		expect(
			migrationPending({ ...after, oldLinks: ["agent-stack-coding.md"] }),
		).toBe(false);
	});

	test("settingsState counts the old allow rules and the output styles that are on", () => {
		expect(
			settingsState({
				permissions: {
					allow: [
						"Read(~/Projects/agent-stack/marketplace/**)",
						"Bash(craft:*)",
						"Bash(ls:*)",
					],
				},
				enabledPlugins: {
					"explanatory-output-style@claude-plugins-official": true,
					"learning-output-style@claude-plugins-official": false,
				},
			}),
		).toEqual({ oldRules: 2, outputStylesOn: 1 });
		expect(settingsState(undefined)).toBeUndefined();
	});

	test("codexState reads the enabled lines of config.toml", () => {
		const config = [
			'[plugins."astack@astack"]',
			"enabled = true",
			"",
			'[plugins."explanatory-output-style@claude-plugins-official"]',
			"enabled = false",
			"",
			'[plugins."learning-output-style@claude-plugins-official"]',
			"enabled = true",
		].join("\n");
		expect(codexState(config)).toEqual({
			settings: { oldRules: 0, outputStylesOn: 1 },
			astack: true,
		});
	});
});
