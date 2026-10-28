import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { validate } from "../scripts/validate.ts";

function report(bodies: Readonly<Record<string, string>>) {
	const root = mkdtempSync(join(tmpdir(), "astack-skill-shape-"));
	const write = (path: string, text: string) => {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, text);
	};
	try {
		write(
			join(root, ".claude-plugin/marketplace.json"),
			JSON.stringify({
				name: "astack",
				plugins: [{ name: "astack", source: "./plugins/astack" }],
			}),
		);
		write(
			join(root, "plugins/astack/.claude-plugin/plugin.json"),
			JSON.stringify({ name: "astack" }),
		);
		for (const [name, body] of Object.entries(bodies))
			write(
				join(root, `plugins/astack/skills/${name}/SKILL.md`),
				`---\nname: ${name}\ndescription: A documented workflow.\nmodel: inherit\nallowed-tools: Read\ndisable-model-invocation: true\n---\n\n${body}\n`,
			);
		return validate({
			marketplace: root,
			allowFile: join(root, "cursor.allow"),
			flowAllowFile: join(root, "flow.allow"),
			rulesDir: join(root, "rules"),
			claude: false,
		});
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

function shapeBlock(text: string): readonly string[] {
	const lines = text.split("\n");
	const start = lines.findIndex((line) => line.includes("skill body shape"));
	if (start < 0) return [];
	const end = lines.indexOf("", start);
	return lines.slice(start, end < 0 ? undefined : end);
}

test("validate rejects headings, comments, separators, and empty fences as a skill body", () => {
	const result = report({
		sample:
			"# Sample\n\n## Purpose\n\n<!-- hidden prose -->\n\n---\n\n```\n```",
	});
	expect({ errors: result.errors, shape: shapeBlock(result.text) }).toEqual({
		errors: 1,
		shape: [
			"FAIL skill body shape (1 errors, 0 warnings)",
			"  1 skill entry points checked",
			"  astack/skills/sample/SKILL.md",
			"    Body must contain substantive content after the title.",
		],
	});
});

test("validate refuses an empty skill scan", () => {
	const result = report({});
	expect({ errors: result.errors, shape: shapeBlock(result.text) }).toEqual({
		errors: 1,
		shape: [
			"FAIL skill body shape (1 errors, 0 warnings)",
			"  0 skill entry points checked",
			"  No skill entry points were found for body validation.",
		],
	});
});

test.each([
	[
		"a repeated title",
		"# Sample\n\nUse this workflow.\n\n# Another title",
		"Body must contain exactly one nonempty H1 title.",
	],
	[
		"an empty title",
		"#\n\nUse this workflow.",
		"Body must contain exactly one nonempty H1 title.",
	],
	[
		"a title with an empty link label",
		"# [](https://example.com)\n\nUse this workflow.",
		"Body must contain exactly one nonempty H1 title.",
	],
	[
		"a code example before the title",
		"```md\n# Example\n```\n\n# Sample\n\nUse this workflow.",
		"The H1 title must be the first visible block.",
	],
])("validate examines every skill and rejects %s", (_, body, message) => {
	const result = report({
		first: "# First\n\nRead the workflow.",
		sample: body,
	});
	expect({ errors: result.errors, shape: shapeBlock(result.text) }).toEqual({
		errors: 1,
		shape: [
			"FAIL skill body shape (1 errors, 0 warnings)",
			"  2 skill entry points checked",
			"  astack/skills/sample/SKILL.md",
			`    ${message}`,
		],
	});
});

test.each([
	[
		"a Setext title and table content",
		"<!-- # Hidden title -->\n\nAny label\n=========\n\n| Outcome | Value |\n|---|---|\n| Result | ready |",
	],
	[
		"a nonempty code example that reaches EOF",
		"# Sample\n\n```html\n<!-- # This remains code -->",
	],
	["a link-only body", "# Sample\n\n[](https://example.com)"],
])("validate accepts %s", (_, body) => {
	const result = report({ sample: body });
	expect({ errors: result.errors, shape: shapeBlock(result.text) }).toEqual({
		errors: 0,
		shape: ["PASS skill body shape", "  1 skill entry points checked"],
	});
});
