import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import {
	ALLOW,
	combine,
	combineAll,
	continueWith,
	deny,
	note,
	type Verdict,
} from "../../src/astack/hook/events.ts";

const RUNS = { numRuns: 100 };
const verdict: fc.Arbitrary<Verdict> = fc.oneof(
	fc.constant(ALLOW),
	fc.string().map(note),
	fc.string().map(deny),
	fc.string().map(continueWith),
);

describe("combine is a monoid with ALLOW as its identity", () => {
	test("[control:verdict-monoid] ALLOW is a left and right identity, combine is associative, and combineAll of nothing is ALLOW", () => {
		expect(combineAll([])).toEqual(ALLOW);
		fc.assert(
			fc.property(verdict, (item) => {
				expect(combine(ALLOW, item)).toEqual(item);
				expect(combine(item, ALLOW)).toEqual(item);
			}),
			RUNS,
		);
		fc.assert(
			fc.property(verdict, verdict, verdict, (a, b, c) => {
				expect(combine(combine(a, b), c)).toEqual(combine(a, combine(b, c)));
			}),
			RUNS,
		);
	});
});
