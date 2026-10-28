import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { sha256 } from "../../scripts/dist/build.ts";
import {
	checkAgentSkills,
	checkCursorHooks,
	checkCursorManifests,
	checkFlatSkills,
	checkFragments,
	checkGrokBot,
	checkHooksPin,
	checkMirror,
	checkOwnText,
	checkPackage,
} from "../../scripts/dist/checks.ts";
import { lintClaudeTerms } from "../../scripts/dist/lint.ts";
import { type Rendered, render } from "../../scripts/dist/render.ts";
import type { Source } from "../../scripts/dist/source.ts";
import { CODEX_POLICY } from "../../scripts/dist/targets/claude-code.ts";
import {
	type FileTree,
	sameBytes,
	textFile,
	textOf,
} from "../../scripts/dist/tree.ts";
import { CODEX_HOOK_HASHES } from "../../src/astack/codex-trust.ts";
import { CURSOR_EVENTS } from "../../src/astack/hook/decode/cursor.ts";

const SCHEMAS = resolve(
	import.meta.dir,
	"../../upstream/cursor-plugin-schemas/schemas",
);
const schemas = {
	plugin: JSON.parse(readFileSync(join(SCHEMAS, "plugin.schema.json"), "utf8")),
	marketplace: JSON.parse(
		readFileSync(join(SCHEMAS, "marketplace.schema.json"), "utf8"),
	),
};

function tree(
	files: Record<string, string>,
	executable: string[] = [],
): FileTree {
	return new Map(
		Object.entries(files)
			.sort(([a], [b]) => (a < b ? -1 : 1))
			.map(([path, text]) => [path, textFile(text, executable.includes(path))]),
	);
}

function skill(
	name: string,
	description: string,
	extra = "",
	body = "",
): string {
	return `---\nname: ${name}\ndescription: ${description}\n${extra}---\n\n# ${name}\n\n${body}\n`;
}

const HOOKS = '{"hooks":{}}\n';

function marketplace(plugins: readonly string[]): string {
	return JSON.stringify({
		name: "astack",
		owner: { name: "Owner" },
		plugins: plugins.map((name) => ({ name, source: `./plugins/${name}` })),
	});
}

const SOURCE: Source = {
	marketplace: marketplace(["astack"]),
	plugins: {
		astack: tree(
			{
				".claude-plugin/plugin.json": JSON.stringify({
					name: "astack",
					version: "1.2.3",
					description: "d",
					author: { name: "Owner" },
				}),
				LICENSE: "MIT astack\n",
				NOTICE: "astack notice\n",
				"hooks/hooks.json": HOOKS,
				"bin/astack": "#!/bin/sh\n",
				"bin/astack.js": "console.log(1)\n",
				"bin/package.json": '{"type":"module"}\n',
				"skills/plan/SKILL.md": skill(
					"plan",
					"Use for /astack:plan.",
					'argument-hint: "<x>"\n',
					`Read \`\${CLAUDE_SKILL_DIR}/../mode/SKILL.md\`, then call the Skill tool with "astack:grilling".`,
				),
				"skills/mode/SKILL.md": skill(
					"mode",
					"Use to route.",
					"disable-model-invocation: true\n",
				),
				"skills/mode/references/card.md": "Run `/astack:plan`.\n",
				"skills/how/SKILL.md": skill(
					"how",
					"Use to explain.",
					"disable-model-invocation: true\nmetadata:\n  origin: pstack\n",
				),
				"skills/setup-models/SKILL.md": skill(
					"setup-models",
					"Use to set up.",
					"metadata:\n  origin: pstack\n",
				),
				"skills/grilling/SKILL.md": skill(
					"grilling",
					"Use to grill.",
					"metadata:\n  origin: mattpocock-skills\n",
				),
				"skills/tdd/SKILL.md": skill(
					"tdd",
					"Use for TDD.",
					"metadata:\n  origin: mattpocock-skills\n",
				),
				"agents/comment-judge.md":
					"---\nname: comment-judge\ndescription: Deletes comments.\nmodel: opus\n---\n\nYou delete.\n",
				"agents/explorer.md":
					"---\nname: explorer\ndescription: Reads for astack:grilling.\nmodel: sonnet\ntools: Read, Grep\n---\n\nYou read.\n",
			},
			["bin/astack"],
		),
	},
	rules: [
		{ name: "astack.md", text: "# Routes\n\nRoute work.\n" },
		{
			name: "coding.md",
			text: "# Coding\n\nLoad `astack:plan` with the Skill tool.\n",
		},
		{
			name: "comments.md",
			text: '---\npaths:\n  - "**/*.ts"\n---\n\n# Comments\n\nWrite none.\n',
		},
		{
			name: "typescript.md",
			text: '---\npaths: ["**/*.ts", "**/*.tsx"]\n---\n\n# TypeScript\n\nParse input.\n',
		},
		{
			name: "postgres.md",
			text: '---\npaths: ["**/*.sql"]\n---\n\n# PostgreSQL\n\nUse in PostgreSQL repos.\n',
		},
	],
	bundle: "console.log(1)\n",
};

function rendered(): Rendered {
	const result = render(SOURCE);
	if (!result.ok) throw new Error(result.error.join("\n"));
	return result.value;
}

function text(out: Rendered, path: string): string {
	const entry = out.tree.get(path);
	if (entry === undefined) throw new Error(`${path} is missing`);
	return textOf(entry);
}

describe("the dist build", () => {
	test("two builds give the same bytes", () => {
		const first = rendered().tree;
		const second = rendered().tree;
		expect([...first.keys()]).toEqual([...second.keys()]);
		for (const [path, entry] of first) {
			const other = second.get(path);
			expect(other !== undefined && sameBytes(entry, other)).toBe(true);
		}
	});

	test("a manifest of one plugin gives one plugin in each plugin list of the build", () => {
		const result = render({
			...SOURCE,
			marketplace: marketplace(["astack"]),
			plugins: { astack: SOURCE.plugins.astack },
		});
		if (!result.ok) throw new Error(result.error.join("\n"));
		const out = result.value;
		const paths = [...out.tree.keys()];
		const lines = (path: string, prefix: string) =>
			text(out, path)
				.split("\n")
				.map((line) => line.trim())
				.filter((line) => line.startsWith(prefix));
		expect(
			JSON.parse(text(out, ".claude-plugin/marketplace.json")).plugins,
		).toEqual([{ name: "astack", source: "./claude-code/astack" }]);
		expect(
			paths.filter((path) => path.endsWith("/.claude-plugin/plugin.json")),
		).toEqual(["claude-code/astack/.claude-plugin/plugin.json"]);
		expect(lines("README.md", "claude plugin install")).toEqual([
			"claude plugin install astack@astack",
		]);
		expect(text(out, "README.md")).toContain("Then install `astack@astack`. |");
		expect(lines("codex/README.md", "codex plugin add")).toEqual([
			"codex plugin add astack@astack",
		]);
		expect(paths.filter((path) => path.includes("/third_party/"))).toEqual([]);
		expect(checkMirror(out.tree, out.build).errors).toEqual([]);
	});

	test("the build fails on each plugin that the manifest lists and the source does not hold", () => {
		const result = render({
			...SOURCE,
			marketplace: marketplace(["astack", "missing"]),
			plugins: { astack: SOURCE.plugins.astack },
		});
		expect(result.ok ? [] : result.error).toEqual([
			"marketplace.json lists missing, but marketplace/plugins/missing is missing",
		]);
	});

	test("refuses a source without the astack manifest", () => {
		const broken = render({
			...SOURCE,
			plugins: { ...SOURCE.plugins, astack: tree({}) },
		});
		expect(broken.ok).toBe(false);
	});

	test("the Claude marketplace mirrors the plugins and adds the Codex policy files", () => {
		const out = rendered();
		expect(
			JSON.parse(text(out, ".claude-plugin/marketplace.json")).plugins,
		).toEqual([{ name: "astack", source: "./claude-code/astack" }]);
		expect(text(out, "claude-code/astack/skills/mode/agents/openai.yaml")).toBe(
			CODEX_POLICY,
		);
		expect(text(out, "claude-code/astack/skills/how/agents/openai.yaml")).toBe(
			CODEX_POLICY,
		);
		expect(
			out.tree.has("claude-code/astack/skills/plan/agents/openai.yaml"),
		).toBe(false);
		expect(checkMirror(out.tree, out.build).errors).toEqual([]);
		expect(checkHooksPin(out.build, sha256(HOOKS)).errors).toEqual([]);
		expect(checkHooksPin(out.build, "0".repeat(64)).errors).toHaveLength(1);
	});

	test("the Claude astack manifest gets a build stamp from the plugin files, so a new bundle is a new version", () => {
		const out = rendered();
		const manifest = JSON.parse(
			text(out, "claude-code/astack/.claude-plugin/plugin.json"),
		);
		expect(manifest.version).toMatch(/^1\.2\.3\+[0-9a-f]{12}$/);
		expect({ ...manifest, version: "1.2.3" }).toEqual(
			JSON.parse(
				textOf(
					SOURCE.plugins.astack.get(".claude-plugin/plugin.json") ??
						textFile("{}"),
				),
			),
		);
		expect(JSON.parse(text(out, "package.json")).version).toBe("1.2.3");
		expect(checkMirror(out.tree, out.build).errors).toEqual([]);
		const rebundled = render({
			...SOURCE,
			plugins: {
				...SOURCE.plugins,
				astack: new Map([
					...SOURCE.plugins.astack,
					["bin/astack.js", textFile("console.log(2)\n")],
				]),
			},
		});
		if (!rebundled.ok) throw new Error(rebundled.error.join("\n"));
		const next = JSON.parse(
			textOf(
				rebundled.value.tree.get(
					"claude-code/astack/.claude-plugin/plugin.json",
				) ?? textFile("{}"),
			),
		).version;
		expect(next).toMatch(/^1\.2\.3\+[0-9a-f]{12}$/);
		expect(next).not.toBe(manifest.version);
		const unstamped = new Map(out.tree);
		unstamped.set(
			"claude-code/astack/.claude-plugin/plugin.json",
			SOURCE.plugins.astack.get(".claude-plugin/plugin.json") ?? textFile(""),
		);
		expect(checkMirror(unstamped, out.build).errors).toEqual([
			"claude-code/astack/.claude-plugin/plugin.json differs from marketplace/plugins/astack/.claude-plugin/plugin.json with its build stamp",
		]);
	});

	test.each([
		["cursor/astack", []],
		["grok-bot", ["astack-rules", "astack-sync"]],
		["agentskills", []],
	])("%s holds every astack skill under its flat name", (root, extra) => {
		const folders = new Set(
			[...rendered().tree.keys()].flatMap((key) => {
				const folder = key.startsWith(`${root}/skills/`)
					? key.slice(`${root}/skills/`.length).split("/")[0]
					: undefined;
				return folder === undefined ? [] : [folder];
			}),
		);
		expect([...folders]).toEqual(
			[
				"astack-grilling",
				"astack-how",
				"astack-mode",
				"astack-plan",
				"astack-setup-models",
				"astack-tdd",
				...extra,
			].sort(),
		);
	});

	test("the Cursor plugin has flat names, the astack licence and valid manifests", () => {
		const out = rendered();
		const keys = [...out.tree.keys()];
		expect(
			keys.filter((key) => key.startsWith("cursor/astack/agents/")),
		).toEqual([
			"cursor/astack/agents/astack-comment-judge.md",
			"cursor/astack/agents/astack-explorer.md",
		]);
		expect(text(out, "cursor/astack/LICENSE")).toBe("MIT astack\n");
		expect(keys.filter((key) => key.includes("third_party/"))).toEqual([]);
		expect(keys).toContain("cursor/astack/rules/astack-coding.mdc");
		expect(text(out, "cursor/astack/rules/astack-comments.mdc")).toStartWith(
			'---\ndescription: "astack rules for comments."\nglobs: "**/*.ts"\nalwaysApply: false\n---\n',
		);
		const plan = text(out, "cursor/astack/skills/astack-plan/SKILL.md");
		expect(plan).toContain('name: "astack-plan"');
		expect(plan).toContain("Use for /astack-plan.");
		expect(plan).not.toContain("argument-hint");
		expect(plan).toContain(
			'Read `../astack-mode/SKILL.md`, then invoke the "astack-grilling" skill.',
		);
		expect(text(out, "cursor/astack/agents/astack-explorer.md")).toBe(
			'---\nname: "astack-explorer"\ndescription: "Reads for astack-grilling."\nmodel: "inherit"\nreadonly: true\n---\n\nYou read.\n',
		);
		expect(
			Object.keys(
				JSON.parse(text(out, "cursor/astack/hooks/hooks.json")).hooks,
			),
		).toEqual([...CURSOR_EVENTS]);
		expect(out.tree.get("cursor/astack/bin/astack")?.executable).toBe(true);
		expect(checkCursorManifests(out.tree, schemas).errors).toEqual([]);
		expect(checkCursorHooks(out.tree).errors).toEqual([]);
		expect(checkFlatSkills(out.tree, "cursor/astack").errors).toEqual([]);
	});

	test("the Agent Skills bundle keeps only the portable keys", () => {
		const out = rendered();
		expect(text(out, "agentskills/skills/astack-mode/SKILL.md")).toStartWith(
			'---\nname: "astack-mode"\ndescription: "Use to route."\nlicense: "MIT"\nmetadata:\n  astack-version: "1.2.3"\n  source: "astack"\n  disable-model-invocation: "true"\n---\n',
		);
		expect(text(out, "agentskills/skills/astack-tdd/LICENSE.txt")).toStartWith(
			"MIT astack\n",
		);
		expect(text(out, "agentskills/skills/astack-tdd/LICENSE.txt")).toContain(
			"- mattpocock/skills, Copyright (c) 2026 Matt Pocock",
		);
		expect(text(out, "agentskills/skills/astack-how/LICENSE.txt")).toContain(
			"- pstack, Copyright (c) 2026 Lauren Tan",
		);
		expect(checkAgentSkills(out.tree).errors).toEqual([]);
	});

	test("Grok Bot gets flat skills, the rules skill and the sync skill, and no hooks", () => {
		const out = rendered();
		expect(text(out, "grok-bot/VERSION")).toBe("1.2.3\n");
		expect(text(out, "grok-bot/skills/astack-rules/SKILL.md")).toContain(
			"This section applies to files that match `**/*.ts`.",
		);
		expect(text(out, "grok-bot/skills/astack-sync/SKILL.md")).toContain(
			'astack-version: "1.2.3"',
		);
		expect(checkGrokBot(out.tree).errors).toEqual([]);
		expect(checkFlatSkills(out.tree, "grok-bot").errors).toEqual([]);
	});

	test("the AGENTS fragments carry the rule card and coding rules in each dialect", () => {
		const out = rendered();
		expect(text(out, "codex/AGENTS.fragment.md")).toBe(
			"<!-- astack 1.2.3 -->\n## The astack CLI\n\nThe skills run the `astack` CLI. When `astack` is not on PATH, run `node <plugin root>/bin/astack.js` in its place. The plugin root is the folder above the `skills` folder of the skill.\n\n# Routes\n\nRoute work.\n\n# Coding\n\nLoad `astack:plan`.\n\nThis section applies to files that match `**/*.ts`, `**/*.tsx`.\n\n# TypeScript\n\nParse input.\n\nThis section applies to files that match `**/*.sql`.\n\n# PostgreSQL\n\nUse in PostgreSQL repos.\n\n<!-- /astack 1.2.3 -->\n",
		);
		expect(text(out, "agentskills/AGENTS.fragment.md")).toContain(
			"Load `astack-plan`.",
		);
		expect(JSON.parse(text(out, "codex/hooks.trust.json"))).toEqual({
			"astack@astack:hooks/hooks.json:session_start:0:0":
				CODEX_HOOK_HASHES.session_start,
			"astack@astack:hooks/hooks.json:user_prompt_submit:0:0":
				CODEX_HOOK_HASHES.user_prompt_submit,
			"astack@astack:hooks/hooks.json:pre_tool_use:0:0":
				CODEX_HOOK_HASHES.pre_tool_use,
			"astack@astack:hooks/hooks.json:stop:0:0": CODEX_HOOK_HASHES.stop,
		});
		expect(text(out, "codex/hooks.json.sha256")).toBe(
			`${sha256(HOOKS)}  claude-code/astack/hooks/hooks.json\n`,
		);
		expect(checkFragments(out.tree).errors).toEqual([]);
	});

	test("the package names the CLI as its bin", () => {
		const out = rendered();
		expect(JSON.parse(text(out, "package.json")).bin).toEqual({
			astack: "cli/astack.js",
		});
		expect(text(out, "cli/astack.js")).toBe(
			"#!/usr/bin/env node\nconsole.log(1)\n",
		);
		expect(checkPackage(out.tree, out.build).errors).toEqual([]);
	});

	test("the flat targets hold no Claude terms after the codemods", () => {
		const result = lintClaudeTerms(rendered().tree, "");
		expect(
			result.unallowed.map(
				(residual) => `${residual.relpath}: ${residual.text}`,
			),
		).toEqual([]);
	});

	test("the Claude terms lint finds a term that no codemod removes", () => {
		const out = rendered();
		const dirty = new Map(out.tree);
		dirty.set(
			"cursor/astack/skills/x/SKILL.md",
			textFile("Use the Agent tool with subagent_type general-purpose.\n"),
		);
		expect(
			lintClaudeTerms(dirty, "").unallowed.map((r) => r.patternId),
		).toEqual(["agent-tool"]);
		expect(
			lintClaudeTerms(dirty, "**/skills/x/**:Agent tool:a test reason")
				.unallowed,
		).toEqual([]);
	});

	test("the astack text in dist passes the STE deny rules, and a bad sentence fails", () => {
		const out = rendered();
		expect(checkOwnText(out.tree).errors).toEqual([]);
		const bad = new Map(out.tree);
		bad.set("README.md", textFile("# astack\n\nIt's fast; it works.\n"));
		expect(checkOwnText(bad).errors.length).toBeGreaterThan(0);
	});
});
