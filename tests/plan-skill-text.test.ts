import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const PLAN = "marketplace/plugins/astack/skills/plan";
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

function recordStageProblems(skillText: string, stagesText: string): string[] {
	const problems: string[] = [];
	const stageSection = (heading: string): string => {
		const idx = stagesText.indexOf(heading);
		if (idx < 0) return "";
		const rest = stagesText.slice(idx + heading.length);
		const next = rest.search(/\n## /);
		return next < 0 ? rest : rest.slice(0, next);
	};
	const checks: readonly (readonly [string, string, RegExp])[] = [
		["SKILL.md --template=domain", skillText, /--template=domain/],
		["SKILL.md S3 context", skillText, /S3[^\n]*CONTEXT\.md/],
		["SKILL.md S4 domain block", skillText, /S4[^\n]*domain`? block/],
		["SKILL.md S5 Files link", skillText, /S5[^\n]*Files/],
		["SKILL.md S6 law", skillText, /S6[^\n]*law/],
		["stages S3 card context", stageSection("## S3."), /CONTEXT\.md/],
		[
			"stages S4 domain block",
			stageSection("## S4."),
			/--template=domain[\s\S]*domain|domain[\s\S]*--template=domain/,
		],
		[
			"stages S5 Files cell",
			stageSection("## S5."),
			/Files`?\s+cell\s+`<module>#<name>`/,
		],
		[
			"stages S6 inv/cap law",
			stageSection("## S6."),
			/inv[\s\S]*cap[\s\S]*law/,
		],
	];
	for (const [label, text, pattern] of checks)
		if (!pattern.test(text)) problems.push(`missing ${label}`);
	return problems;
}

const CUT_TERM = /\bplan export\b|\bplan drift\b|\bkind:programme\b/;

function cutTextHits(
	files: readonly (readonly [string, string])[],
): readonly string[] {
	const hits: string[] = [];
	for (const [path, text] of files) if (CUT_TERM.test(text)) hits.push(path);
	return hits;
}

describe("plan skill record stages and removed export/drift text", () => {
	test("[control:plan-record-stages] SKILL.md and stages.md name the domain record work of S3 to S6", () => {
		const skillText = read(`${PLAN}/SKILL.md`);
		const stagesText = read(`${PLAN}/references/stages.md`);
		expect(recordStageProblems(skillText, stagesText)).toEqual([]);
		expect(
			recordStageProblems(
				skillText.replaceAll("--template=domain", ""),
				stagesText,
			),
		).toContain("missing SKILL.md --template=domain");
	});

	test("[control:plan-cut-text] no tracked Markdown outside plans, adr, CHANGELOG, upstream and dist names plan export, plan drift or kind:programme, and export/drift modules are gone", () => {
		expect(existsSync(join(ROOT, "src/astack/plan/export.ts"))).toBe(false);
		expect(existsSync(join(ROOT, "src/astack/plan/drift.ts"))).toBe(false);
		const listed = spawnSync("git", ["ls-files", "-z", "*.md"], {
			cwd: ROOT,
			encoding: "utf8",
		});
		expect(listed.status).toBe(0);
		const files = listed.stdout
			.split("\0")
			.filter(
				(path) =>
					path !== "" &&
					!path.startsWith("docs/plans/") &&
					!path.startsWith("docs/adr/") &&
					!path.startsWith("upstream/") &&
					!path.startsWith("dist/") &&
					path !== "CHANGELOG.md" &&
					existsSync(join(ROOT, path)),
			)
			.map((path) => [path, read(path)] as const);
		expect(cutTextHits(files)).toEqual([]);
		expect(cutTextHits([["sample.md", "Run astack plan export."]])).toEqual([
			"sample.md",
		]);
		expect(cutTextHits([["sample.md", "label `kind:programme`"]])).toEqual([
			"sample.md",
		]);
	});
});
