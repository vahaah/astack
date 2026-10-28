import { describe, expect, test } from "bun:test";
import {
	ALLOW,
	combine,
	combineAll,
	continueWith,
	deny,
	note,
	type Verdict,
} from "../../src/astack/hook/events.ts";

const SAMPLE: readonly Verdict[] = [
	ALLOW,
	note("a"),
	note("b"),
	deny("x"),
	deny("y"),
	continueWith("p"),
	continueWith("q"),
];

describe("combine is a monoid with allow as the identity", () => {
	test("allow is a left and right identity", () => {
		for (const verdict of SAMPLE) {
			expect(combine(ALLOW, verdict)).toEqual(verdict);
			expect(combine(verdict, ALLOW)).toEqual(verdict);
		}
	});

	test("combine is associative on every triple of the sample", () => {
		for (const a of SAMPLE)
			for (const b of SAMPLE)
				for (const c of SAMPLE)
					expect(combine(combine(a, b), c)).toEqual(combine(a, combine(b, c)));
	});

	test("combineAll of nothing is allow", () => {
		expect(combineAll([])).toEqual(ALLOW);
	});
});

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
