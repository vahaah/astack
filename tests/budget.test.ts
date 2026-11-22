import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
	type Budget,
	budgetReport,
	type LineCounts,
	lineCounts,
	lowerBudget,
	parseBudget,
	skillWords,
} from "../scripts/budget.ts";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

function skillsTree(files: Record<string, string>): string {
	const root = mkdtempSync(join(tmpdir(), "budget-"));
	roots.push(root);
	for (const [path, text] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), text);
	}
	return root;
}

const counts = () =>
	skillWords(
		skillsTree({
			"alpha/SKILL.md": "---\nname: alpha\n---\n\nOne\ttwo.\n",
			"alpha/references/deep/more.md": "four  five\n",
			"alpha/template.sh": "echo not counted here\n",
			"beta/SKILL.md": "six seven",
		}),
	);

const noLines: LineCounts = new Map();
const agentsLine: LineCounts = new Map([["AGENTS.md", 880]]);

describe("the skill word budget", () => {
	test("counts the whitespace words of each *.md file in each skill tree", () => {
		expect([...counts()]).toEqual([
			["alpha", 8],
			["beta", 2],
		]);
	});

	test("[control:wb-skill-over] passes at each cap and fails one word over a cap with the skill name", () => {
		expect(
			budgetReport(counts(), noLines, {
				total: 10,
				skills: { alpha: 8, beta: 2 },
				lines: {},
			}),
		).toEqual({ problems: [], notes: [] });
		expect(
			budgetReport(counts(), noLines, {
				total: 10,
				skills: { alpha: 7, beta: 2 },
				lines: {},
			}).problems,
		).toEqual(["alpha: 8 words, over its cap of 7"]);
	});

	test("[control:wb-total-over] fails a total one word over its cap while each skill is under", () => {
		expect(
			budgetReport(counts(), noLines, {
				total: 9,
				skills: { alpha: 8, beta: 2 },
				lines: {},
			}).problems,
		).toEqual(["total: 10 words, over its cap of 9"]);
	});

	test("[control:wb-no-cap] fails a skill with no cap", () => {
		expect(
			budgetReport(counts(), noLines, {
				total: 10,
				skills: { alpha: 8 },
				lines: {},
			}).problems,
		).toEqual(["beta: 2 words, and scripts/lib/budget.json gives it no cap"]);
	});

	test("[control:wb-slack-note] passes with a note on a cap above its count and a cap with no skill", () => {
		expect(
			budgetReport(counts(), noLines, {
				total: 11,
				skills: { alpha: 9, beta: 2, gamma: 4 },
				lines: {},
			}),
		).toEqual({
			problems: [],
			notes: [
				"alpha: 8 words, under its cap of 9. Run bun scripts/budget.ts --lower",
				"gamma: the skill is gone. Run bun scripts/budget.ts --lower",
				"total: 10 words, under its cap of 11. Run bun scripts/budget.ts --lower",
			],
		});
	});

	test("[control:wb-lower] lowers each cap to its count, drops a gone skill and never raises a cap", () => {
		const budget: Budget = {
			total: 12,
			skills: { alpha: 9, beta: 1, gamma: 4 },
			lines: {},
		};
		expect(lowerBudget(counts(), noLines, budget)).toEqual({
			total: 10,
			skills: { alpha: 8, beta: 1 },
			lines: {},
		});
	});

	test("parses only a whole-number total, whole-number skill caps and whole-number line caps", () => {
		expect(
			parseBudget({
				total: 3,
				skills: { alpha: 3 },
				lines: { "AGENTS.md": 900 },
			}),
		).toEqual({
			ok: true,
			value: { total: 3, skills: { alpha: 3 }, lines: { "AGENTS.md": 900 } },
		});
		expect(
			parseBudget({ total: 3, skills: { alpha: 2.5 }, lines: {} }),
		).toEqual({
			ok: false,
			error: "scripts/lib/budget.json: skills.alpha must be a whole number",
		});
		expect(parseBudget({ total: 3, skills: { alpha: 3 } })).toEqual({
			ok: false,
			error: "scripts/lib/budget.json: expected { total, skills, lines }",
		});
	});

	test("lineCounts reads the longest line of each path that the budget names", () => {
		const root = skillsTree({ "AGENTS.md": "ab\nabcd\nabc\n" });
		expect([
			...lineCounts(root, { total: 0, skills: {}, lines: { "AGENTS.md": 9 } }),
		]).toEqual([["AGENTS.md", 4]]);
	});

	test("[control:wb-line-over] passes at the line cap and fails one character over it with the path", () => {
		const budget = (cap: number): Budget => ({
			total: 10,
			skills: { alpha: 8, beta: 2 },
			lines: { "AGENTS.md": cap },
		});
		expect(budgetReport(counts(), agentsLine, budget(880))).toEqual({
			problems: [],
			notes: [],
		});
		expect(budgetReport(counts(), agentsLine, budget(879)).problems).toEqual([
			"AGENTS.md: 880 characters in its longest line, over its cap of 879",
		]);
	});

	test("[control:wb-line-lower] lowers a line cap to its count and never raises it", () => {
		const lowered = (cap: number) =>
			lowerBudget(counts(), agentsLine, {
				total: 10,
				skills: { alpha: 8, beta: 2 },
				lines: { "AGENTS.md": cap },
			}).lines;
		expect(lowered(9099)).toEqual({ "AGENTS.md": 880 });
		expect(lowered(700)).toEqual({ "AGENTS.md": 700 });
	});
});
