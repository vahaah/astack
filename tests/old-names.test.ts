import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { validate } from "../scripts/validate.ts";

function report(body: string) {
	const root = mkdtempSync(join(tmpdir(), "astack-old-names-"));
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
		write(
			join(root, "plugins/astack/skills/mode/SKILL.md"),
			`---\nname: mode\ndescription: Use to route.\nmetadata:\n  origin: pstack mattpocock-skills\n---\n\n# Mode\n\n${body}\n`,
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

test.each([
	["a literal call", "Run `/pstack:how`.", "pstack", 10],
	[
		"a name assembled from string fragments",
		'```js\ninvoke("fl" + "ow" + ":" + name);\n```',
		"flow",
		11,
	],
	[
		"a template with a constant namespace",
		`\`\`\`js\nconst prefix = "pstack";\ninvoke(\`\${prefix}:how\`);\n\`\`\``,
		"pstack",
		12,
	],
	[
		"a concatenation with a constant namespace",
		'```js\nconst prefix = "flow";\ninvoke(prefix + ":" + name);\n```',
		"flow",
		12,
	],
])(
	"validate rejects %s from a retired skill namespace",
	(_, body, namespace, line) => {
		const result = report(body);
		expect(
			result.text
				.split("\n")
				.filter((line) => line.includes("skill namespace is retired"))
				.map((line) => line.trim()),
		).toEqual([
			`${line}: ${namespace} skill namespace is retired. Use astack:<name>.`,
		]);
	},
);

test("validate keeps upstream credits, ordinary flow prose, and current skill calls", () => {
	const result = report(
		[
			'The source is "pstack" and "mattpocock-skills".',
			"The flow of work stays clear.",
			"Run `astack:mode`.",
			`\`\`\`js\nconst prefix = "astack";\ninvoke(\`\${prefix}:mode\`);\n\`\`\``,
		].join("\n"),
	);
	expect(result.errors).toBe(0);
	expect(result.text).not.toContain("skill namespace is retired");
});
