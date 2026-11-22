import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
	type Budget,
	budgetReport,
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

describe("the skill word budget", () => {
	test("counts the whitespace words of each *.md file in each skill tree", () => {
		expect([...counts()]).toEqual([
			["alpha", 8],
			["beta", 2],
		]);
	});

	test("[control:wb-skill-over] passes at each cap and fails one word over a cap with the skill name", () => {
		expect(
			budgetReport(counts(), { total: 10, skills: { alpha: 8, beta: 2 } }),
		).toEqual({ problems: [], notes: [] });
		expect(
			budgetReport(counts(), { total: 10, skills: { alpha: 7, beta: 2 } })
				.problems,
		).toEqual(["alpha: 8 words, over its cap of 7"]);
	});

	test("[control:wb-total-over] fails a total one word over its cap while each skill is under", () => {
		expect(
			budgetReport(counts(), { total: 9, skills: { alpha: 8, beta: 2 } })
				.problems,
		).toEqual(["total: 10 words, over its cap of 9"]);
	});

	test("[control:wb-no-cap] fails a skill with no cap", () => {
		expect(
			budgetReport(counts(), { total: 10, skills: { alpha: 8 } }).problems,
		).toEqual(["beta: 2 words, and scripts/lib/budget.json gives it no cap"]);
	});

	test("[control:wb-slack-note] passes with a note on a cap above its count and a cap with no skill", () => {
		expect(
			budgetReport(counts(), {
				total: 11,
				skills: { alpha: 9, beta: 2, gamma: 4 },
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
		};
		expect(lowerBudget(counts(), budget)).toEqual({
			total: 10,
			skills: { alpha: 8, beta: 1 },
		});
	});

	test("parses only a whole-number total and whole-number skill caps", () => {
		expect(parseBudget({ total: 3, skills: { alpha: 3 } })).toEqual({
			ok: true,
			value: { total: 3, skills: { alpha: 3 } },
		});
		expect(parseBudget({ total: 3, skills: { alpha: 2.5 } })).toEqual({
			ok: false,
			error: "scripts/lib/budget.json: skills.alpha must be a whole number",
		});
	});
});
