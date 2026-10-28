import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
	evaluate,
	gateFailures,
	PROMOTION_FIRES,
	PROMOTION_PRECISION,
	parseCorpus,
} from "../../scripts/lib/ste-precision.ts";
import { EXACT_RULES, RULE_TIER } from "../../src/astack/ste/rules.ts";
import { RULE_IDS } from "../../src/astack/ste/types.ts";

const CORPUS = join(
	resolve(import.meta.dir, "../.."),
	"tests/fixtures/ste/labelled.txt",
);
const { cases, errors } = parseCorpus(readFileSync(CORPUS, "utf8"));
const stats = evaluate(cases);

describe("the labelled STE corpus", () => {
	test("parses with no errors and labels every rule both ways", () => {
		expect(errors).toEqual([]);
		for (const rule of RULE_IDS) {
			const mine = cases.filter((entry) => entry.rule === rule);
			expect(mine.some((entry) => entry.fires)).toBe(true);
			expect(mine.some((entry) => !entry.fires)).toBe(true);
		}
	});

	test("each deny rule has 30 or more labelled fires at 95% precision or more", () => {
		expect(gateFailures(stats)).toEqual([]);
		for (const stat of stats.filter((entry) => entry.tier === "deny")) {
			expect(stat.truePositives + stat.falsePositives).toBeGreaterThanOrEqual(
				PROMOTION_FIRES,
			);
			expect(stat.precision ?? 0).toBeGreaterThanOrEqual(PROMOTION_PRECISION);
		}
	});

	test("an exact rule misses no labelled case", () => {
		for (const stat of stats.filter((entry) => EXACT_RULES.has(entry.rule)))
			expect(stat.misses).toEqual([]);
	});

	test("judgment rules stay at advise", () => {
		for (const rule of [
			"word-broad",
			"perfect",
			"progressive",
			"modal",
			"passive",
			"paragraph-length",
			"one-instruction",
			"ing-form",
			"noun-cluster",
		] as const)
			expect(RULE_TIER[rule]).toBe("advise");
	});

	test("a rule that falls under the bar fails the gate", () => {
		const weak = stats.map((stat) =>
			stat.rule === "dash" ? { ...stat, falsePositives: 5 } : stat,
		);
		const recomputed = weak.map((stat) => {
			const fires = stat.truePositives + stat.falsePositives;
			return {
				...stat,
				precision: fires === 0 ? undefined : stat.truePositives / fires,
			};
		});
		expect(
			gateFailures(recomputed).some((failure) =>
				failure.startsWith("dash: precision"),
			),
		).toBe(true);
	});
});
