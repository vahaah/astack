import { describe, expect, test } from "bun:test";
import {
	ALLOW,
	combine,
	combineAll,
	continueWith,
	deny,
	note,
} from "../../src/astack/hook/events.ts";
import { outcomeIn } from "../../src/astack/ste/events.ts";
import type {
	Finding,
	FindingRule,
	Severity,
} from "../../src/astack/ste/types.ts";
import { outcomeOf } from "../../src/astack/ste/verdict.ts";

describe("combine ranks the verdicts", () => {
	test("deny absorbs a note and joins the reasons of two denies", () => {
		expect(combine(note("a"), deny("x"))).toEqual(deny("x"));
		expect(combine(deny("x"), note("a"))).toEqual(deny("x"));
		expect(combine(deny("x"), deny("y"))).toEqual(deny("x\n\ny"));
	});

	test("two notes join in order", () => {
		expect(combineAll([note("a"), ALLOW, note("b")])).toEqual(note("a\n\nb"));
	});

	test("continue wins over a note and loses to a deny", () => {
		expect(combine(note("a"), continueWith("p"))).toEqual(continueWith("p"));
		expect(combine(continueWith("p"), deny("x"))).toEqual(deny("x"));
	});
});

describe("the event outcome of each STE finding", () => {
	const finding = (
		rule: FindingRule,
		severity: Severity,
		fingerprint: string,
	): Finding => ({
		rule,
		severity,
		line: 1,
		sentence: "s",
		excerpt: "s",
		fix: "f",
		fingerprint,
	});

	test("[control:tel-outcome-map] under a deny, a demoted and an advised finding write masked, and a quiet rule stays quiet", () => {
		const findings = [
			finding("contraction", "deny", "c"),
			finding("sentence-length", "deny", "s"),
			finding("word-broad", "advise", "w"),
			finding("noun-cluster", "advise", "n"),
		];
		const outcomeOfRun = (list: readonly Finding[]) => {
			const run = outcomeOf("x", "doc", list, new Set(["s"]));
			return run.observed.map((observation) =>
				outcomeIn(observation, run.verdict.kind === "deny"),
			);
		};
		expect({
			denied: outcomeOfRun(findings),
			allowed: outcomeOfRun(findings.slice(1)),
		}).toEqual({
			denied: ["deny", "masked", "masked", "quiet"],
			allowed: ["demoted", "advise", "quiet"],
		});
	});
});
