import { describe, expect, test } from "bun:test";
import {
	compareGateRuns,
	type GateRun,
	gateArgv,
	normalizedLines,
} from "../../scripts/lib/gates.ts";

function ran(exitCode: number, output = ""): GateRun {
	return { status: "ran", argv: ["x"], exitCode, timedOut: false, output };
}

const skipped: GateRun = { status: "skipped", reason: "no JSON file to check" };

describe("gateArgv", () => {
	test("appends the written JSON files to a written-json gate", () => {
		expect(
			gateArgv({ name: "biome", run: ["biome", "ci"], files: "written-json" }, [
				".claude/settings.json",
			]),
		).toEqual(["biome", "ci", ".claude/settings.json"]);
	});

	test("skips a written-json gate when nothing JSON was written", () => {
		expect(
			gateArgv({ name: "biome", run: ["biome"], files: "written-json" }, []),
		).toBeUndefined();
	});

	test("runs a plain gate as configured", () => {
		expect(
			gateArgv({ name: "docs", run: ["bun", "run", "docs"] }, ["a.json"]),
		).toEqual(["bun", "run", "docs"]);
	});
});

describe("compareGateRuns", () => {
	test("a gate green before and after passes", () => {
		expect(compareGateRuns("g", ran(0), ran(0)).verdict).toBe("pass");
	});

	test("a gate green before and red after is a new failure with the added lines", () => {
		const verdict = compareGateRuns(
			"g",
			ran(0, "18 pass\n"),
			ran(1, "18 pass\nx.md:3: ADR 0001 has no D9\n"),
		);
		expect(verdict.verdict).toBe("new-failure");
		expect(verdict.newLines).toEqual(["x.md:3: ADR 0001 has no D9"]);
	});

	test("a gate that did not apply at baseline and fails after is a new failure", () => {
		expect(compareGateRuns("g", skipped, ran(1, "bad")).verdict).toBe(
			"new-failure",
		);
	});

	test("a gate red before and after with the same output is not blamed on apply", () => {
		const output = "1 fail\nexpected bun 1.4.2, got 1.4.3 [12.5ms]\n";
		const verdict = compareGateRuns(
			"g",
			ran(1, output),
			ran(1, output.replace("12.5ms", "9ms")),
		);
		expect(verdict.verdict).toBe("still-failing");
	});

	test("a gate red before that gains output lines is a new failure", () => {
		const verdict = compareGateRuns(
			"g",
			ran(1, "old failure\n"),
			ran(1, "old failure\nnew failure\n"),
		);
		expect(verdict.verdict).toBe("new-failure");
		expect(verdict.newLines).toEqual(["new failure"]);
	});

	test("a gate red before and green after is reported as fixed", () => {
		expect(compareGateRuns("g", ran(1), ran(0)).verdict).toBe("fixed");
	});

	test("a candidate gate that did not apply is skipped", () => {
		expect(compareGateRuns("g", skipped, skipped).verdict).toBe("skipped");
	});

	test("a timed-out candidate is a failure", () => {
		const verdict = compareGateRuns("g", ran(0), {
			status: "ran",
			argv: ["x"],
			exitCode: null,
			timedOut: true,
			output: "",
		});
		expect(verdict.verdict).toBe("new-failure");
		expect(verdict.detail).toContain("timed out");
	});
});

describe("normalizedLines", () => {
	test("drops colour codes, blank lines and timings", () => {
		const escapeCode = String.fromCharCode(27);
		expect(
			normalizedLines(
				`${escapeCode}[31mFAIL${escapeCode}[0m docs 1.2s\n\n  Ran 3 tests [8.70ms]  \n`,
			),
		).toEqual(["FAIL docs <t>", "Ran 3 tests [<t>]"]);
	});
});
