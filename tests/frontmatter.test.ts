import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
	FrontmatterError,
	parseDocument,
	validateAgentFrontmatter,
	validateSkillFrontmatter,
	validateTree,
} from "../scripts/lib/frontmatter.ts";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

function pluginTree(files: Record<string, string>): string {
	const root = mkdtempSync(join(tmpdir(), "frontmatter-"));
	roots.push(root);
	for (const [relpath, text] of Object.entries(files)) {
		mkdirSync(dirname(join(root, relpath)), { recursive: true });
		writeFileSync(join(root, relpath), text);
	}
	return root;
}

describe("parseDocument", () => {
	test("rejects files without closed frontmatter", () => {
		expect(() => parseDocument("# no frontmatter\n", "x")).toThrow(
			FrontmatterError,
		);
		expect(() => parseDocument("---\nname: x\n", "x")).toThrow(
			FrontmatterError,
		);
	});
});

describe("schema", () => {
	test("accepts a clean skill and agent", () => {
		expect(
			validateSkillFrontmatter(
				{
					name: "how",
					description: "d",
					"disable-model-invocation": true,
					paths: ["*.ts"],
				},
				"how",
			),
		).toEqual([]);
		expect(
			validateAgentFrontmatter(
				{
					name: "a",
					description: "d",
					model: "sonnet",
					effort: "high",
					tools: "Read, Bash",
					background: true,
				},
				"a",
			),
		).toEqual([]);
	});

	test("reports unknown keys, bad names and bad values", () => {
		const skillErrors = validateSkillFrontmatter(
			{
				name: "Poteto Mode",
				description: "",
				icon: "crown",
				"disable-model-invocation": "yes",
			},
			"poteto-mode",
		);
		expect(skillErrors.join("\n")).toMatch(/unknown skill key 'icon'/);
		expect(skillErrors.join("\n")).toMatch(/must equal the directory name/);
		expect(skillErrors.join("\n")).toMatch(
			/description must be a non-empty string/,
		);
		expect(skillErrors.join("\n")).toMatch(
			/disable-model-invocation must be a boolean/,
		);

		const agentErrors = validateAgentFrontmatter(
			{
				name: "a",
				description: "d",
				is_background: true,
				model: "gpt-5",
				effort: "ultra",
				color: "teal",
			},
			"a",
		);
		expect(agentErrors.join("\n")).toMatch(/unknown agent key 'is_background'/);
		expect(agentErrors.join("\n")).toMatch(/model "gpt-5"/);
		expect(agentErrors.join("\n")).toMatch(/effort "ultra"/);
		expect(agentErrors.join("\n")).toMatch(/color must be one of/);
	});

	test("checks the type of maxTurns, memory and color on an agent", () => {
		expect(
			validateAgentFrontmatter(
				{
					name: "a",
					description: "d",
					maxTurns: 2.5,
					memory: 1,
					color: true,
				},
				"a",
			),
		).toEqual([
			"agents/a.md: maxTurns must be a positive integer",
			"agents/a.md: memory must be one of user, project, local",
			"agents/a.md: color must be one of red, blue, green, yellow, purple, orange, pink, cyan",
		]);
	});
});

describe("validateTree", () => {
	test("reports each broken skill and agent of a plugin by its path", () => {
		const root = pluginTree({
			"skills/how/SKILL.md": "---\nname: how\ndescription: d\n---\n\n# How\n",
			"skills/bare/SKILL.md": "# no frontmatter\n",
			"skills/notes/README.md": "not a skill\n",
			"agents/judge.md":
				"---\nname: judge\ndescription: d\nis_background: true\n---\n",
			"agents/notes.txt": "not an agent\n",
		});
		expect(validateTree(root)).toEqual([
			`${join(root, "skills/bare/SKILL.md")}: no frontmatter`,
			"agents/judge.md: unknown agent key 'is_background'",
		]);
	});

	test("reads a plugin with no skills or agents folder as empty", () => {
		expect(validateTree(pluginTree({ "README.md": "# Plugin\n" }))).toEqual([]);
	});
});
