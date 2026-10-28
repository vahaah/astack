import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { companionRuleFiles } from "../../scripts/apply.ts";
import {
	companionPaths,
	exampleCompanion,
} from "../../scripts/lib/companion.ts";
import {
	type GlobalInputs,
	type LinkProbe,
	planGlobal,
} from "../../scripts/lib/global.ts";
import { repoRoot } from "../../scripts/lib/projects.ts";

const home = "/home/dev";
const root = "/home/dev/Projects/astack";
const companionRules = "/home/dev/companion/rules";

function inputs(probe: LinkProbe): GlobalInputs {
	return {
		root,
		home,
		configDir: "/home/dev/.claude",
		knownMarketplaces: {},
		installedPlugins: { version: 2, plugins: {} },
		probe,
		ruleNames: [
			"astack.md",
			"coding.md",
			"comments.md",
			"typescript.md",
			"postgres.md",
		],
		repoRulesDirs: [],
		duplicateSkills: [],
		flowBuilt: true,
		companionRules: [join(companionRules, "owner.md")],
	};
}

function links(probe: LinkProbe) {
	return planGlobal(inputs(probe)).flatMap((step) =>
		step.kind === "symlink" ? [[step.source, step.target, step.action]] : [],
	);
}

describe("the rules of the companion", () => {
	test("apply --global links each companion rule beside the rule card, under its own name", () => {
		expect(links(() => ({ kind: "missing" }))).toEqual([
			[`${root}/rules/astack.md`, `${home}/.claude/rules/astack.md`, "create"],
			[
				`${root}/rules/coding.md`,
				`${home}/.claude/rules/astack-coding.md`,
				"create",
			],
			[
				`${root}/rules/comments.md`,
				`${home}/.claude/rules/astack-comments.md`,
				"create",
			],
			[
				`${root}/rules/typescript.md`,
				`${home}/.claude/rules/astack-typescript.md`,
				"create",
			],
			[
				`${root}/rules/postgres.md`,
				`${home}/.claude/rules/astack-postgres.md`,
				"create",
			],
			[
				`${companionRules}/owner.md`,
				`${home}/.claude/rules/companion-owner.md`,
				"create",
			],
		]);
	});

	test("refuses to overwrite a file at the link of a companion rule", () => {
		const probe: LinkProbe = (path) =>
			path.endsWith("companion-owner.md")
				? { kind: "file" }
				: { kind: "missing" };
		expect(links(probe).at(-1)).toEqual([
			`${companionRules}/owner.md`,
			`${home}/.claude/rules/companion-owner.md`,
			"refuse",
		]);
	});

	test("reads only the Markdown files of the rules folder, and no folder gives no rule", () => {
		const dir = mkdtempSync(join(tmpdir(), "companion-rules-"));
		try {
			mkdirSync(join(dir, "nested.md"));
			writeFileSync(join(dir, "zeta.md"), "# Zeta\n");
			writeFileSync(join(dir, "alpha.md"), "# Alpha\n");
			writeFileSync(join(dir, "notes.txt"), "notes\n");
			const example = companionPaths(exampleCompanion(repoRoot)).rules;
			expect([
				companionRuleFiles(dir),
				companionRuleFiles(example),
				companionRuleFiles(join(dir, "missing")),
			]).toEqual([
				[join(dir, "alpha.md"), join(dir, "zeta.md")],
				[join(example, "owner.md")],
				[],
			]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
