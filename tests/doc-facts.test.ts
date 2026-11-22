import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CHECKS } from "../src/astack/cli/commands/check/index.ts";
import { HANDLERS } from "../src/astack/hook/handlers/index.ts";

const root = join(import.meta.dir, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const plugin = "marketplace/plugins/astack";
const mode = `${plugin}/skills/mode`;
const readmes = ["README.md", `${plugin}/README.md`];

const entries = (dir: string, isEntry: (name: string) => boolean): number =>
	readdirSync(join(root, dir), { withFileTypes: true }).filter((entry) =>
		isEntry(entry.isDirectory() ? `${entry.name}/` : entry.name),
	).length;
const isFolder = (name: string) => name.endsWith("/");
const isMarkdown = (name: string) => name.endsWith(".md");

type Claim = {
	readonly label: string;
	readonly pattern: RegExp;
	readonly actual: number;
};

const readmeClaims: readonly Claim[] = [
	{
		label: "skills",
		pattern: /^- (\d+) skills:/,
		actual: entries(`${plugin}/skills`, isFolder),
	},
	{
		label: "subagents",
		pattern: /^- (\d+) subagents:/,
		actual: entries(`${plugin}/agents`, isMarkdown),
	},
	{
		label: "rules files",
		pattern: /^- (\d+) rules files:/,
		actual: entries("rules", isMarkdown),
	},
	{
		label: "handlers",
		pattern: /\bTheir (\d+) handlers\b/,
		actual: HANDLERS.length,
	},
	{ label: "checks", pattern: /\b(\d+) checks\. /, actual: CHECKS.length },
	{
		label: "Grok Bot skills",
		pattern: /\bso it holds (\d+) skills\b/,
		actual: entries("dist/grok-bot/skills", isFolder),
	},
];

function countGaps(
	path: string,
	text: string,
	claims: readonly Claim[],
): string[] {
	const lines = text.split("\n");
	return claims.flatMap(({ label, pattern, actual }) => {
		const index = lines.findIndex((line) => pattern.test(line));
		if (index === -1) return [`${path} states no count of ${label}`];
		const stated = Number(pattern.exec(lines[index] ?? "")?.[1]);
		return stated === actual
			? []
			: [
					`${path}:${index + 1} says ${stated} ${label}, and the tree holds ${actual}`,
				];
	});
}

const resolves = (name: string): boolean =>
	existsSync(join(root, plugin, "skills", name)) ||
	existsSync(join(root, plugin, "agents", `${name}.md`));

const unknownNames = (path: string, text: string): string[] =>
	[...new Set(text.match(/\bastack:[a-z][a-z0-9-]*/g) ?? [])]
		.filter((name) => !resolves(name.slice("astack:".length)))
		.map((name) => `${path} names ${name}, which is no skill or agent`);

const playbookEntries = (text: string): number => {
	const from = text.indexOf("\n## Choose a playbook\n");
	const to = text.indexOf("\n## ", from + 1);
	return text
		.slice(from, to === -1 ? undefined : to)
		.split("\n")
		.filter((line) => line.startsWith("- ")).length;
};

const PLAYBOOK_COUNT =
	/\bthe (\d+) playbooks that `references\/playbooks\.md` lists\b/;

describe("the docs state the counts and names of the tree", () => {
	test("[control:wb-facts-counts] each count of the README equals the tree, and a stale count names its line", () => {
		expect(countGaps("README.md", read("README.md"), readmeClaims)).toEqual([]);
		const checks = readmeClaims.filter(({ label }) => label === "checks");
		expect(
			countGaps(
				"README.md",
				"one\n- The CLI and 13 checks. One is the proof.",
				checks,
			),
		).toEqual([
			`README.md:2 says 13 checks, and the tree holds ${CHECKS.length}`,
		]);
	});

	test("[control:wb-facts-names] each astack name of the two READMEs is a skill folder or an agent file", () => {
		expect(readmes.flatMap((path) => unknownNames(path, read(path)))).toEqual(
			[],
		);
		expect(
			unknownNames("README.md", "Run `astack:gone` and `astack:plan`."),
		).toEqual(["README.md names astack:gone, which is no skill or agent"]);
	});

	test("[control:wb-facts-playbooks] mode/SKILL.md and routes.md state the entry count of playbooks.md", () => {
		const count = playbookEntries(read(`${mode}/references/playbooks.md`));
		expect(
			[`${mode}/SKILL.md`, `${mode}/references/routes.md`].filter(
				(path) => Number(PLAYBOOK_COUNT.exec(read(path))?.[1]) !== count,
			),
		).toEqual([]);
	});
});
