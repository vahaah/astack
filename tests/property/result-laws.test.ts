import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import {
	all,
	andThen,
	err,
	map,
	ok,
	type Result,
} from "../../src/astack/result.ts";

type Item = Result<number, string>;
type Arrow = (value: number) => Item;

const RUNS = { numRuns: 100 };
const value = fc.integer();
const failure = fc.string();
const result: fc.Arbitrary<Item> = fc.oneof(value.map(ok), failure.map(err));
const arrow: fc.Arbitrary<Arrow> = fc.func(result);
const transform = fc.func(value);

const kleisli =
	(first: Arrow, second: Arrow): Arrow =>
	(input) =>
		andThen(first(input), second);

function never(): Item {
	throw new Error("the arrow ran on an error");
}

describe("the Result helpers keep their laws on generated values and arrows", () => {
	test("[control:result-monad-laws] andThen and ok form a monad and a Kleisli category, and an error skips the arrow", () => {
		fc.assert(
			fc.property(value, arrow, (input, next) => {
				expect(andThen(ok(input), next)).toEqual(next(input));
			}),
			RUNS,
		);
		fc.assert(
			fc.property(result, (start) => {
				expect(andThen(start, ok)).toEqual(start);
			}),
			RUNS,
		);
		fc.assert(
			fc.property(result, arrow, arrow, (start, first, second) => {
				expect(andThen(andThen(start, first), second)).toEqual(
					andThen(start, kleisli(first, second)),
				);
			}),
			RUNS,
		);
		fc.assert(
			fc.property(value, arrow, arrow, arrow, (input, f, g, h) => {
				expect(kleisli(ok, f)(input)).toEqual(f(input));
				expect(kleisli(f, ok)(input)).toEqual(f(input));
				expect(kleisli(kleisli(f, g), h)(input)).toEqual(
					kleisli(f, kleisli(g, h))(input),
				);
			}),
			RUNS,
		);
		fc.assert(
			fc.property(failure, (reason) => {
				expect(andThen(err(reason), never)).toEqual(err(reason));
			}),
			RUNS,
		);
	});

	test("[control:result-functor-laws] map keeps identity and composition, and it returns an error unchanged", () => {
		fc.assert(
			fc.property(result, (start) => {
				expect(map(start, (item) => item)).toEqual(start);
			}),
			RUNS,
		);
		fc.assert(
			fc.property(result, transform, transform, (start, f, g) => {
				expect(map(start, (item) => g(f(item)))).toEqual(map(map(start, f), g));
			}),
			RUNS,
		);
		fc.assert(
			fc.property(failure, (reason) => {
				expect(
					map(err(reason), (): number => {
						throw new Error("the transform ran on an error");
					}),
				).toEqual(err(reason));
			}),
			RUNS,
		);
	});

	test("[control:result-all-order] all keeps the input order, stops at the first error and splits over a join", () => {
		expect(all([])).toEqual(ok([]));
		fc.assert(
			fc.property(fc.array(value), (values) => {
				expect(all(values.map(ok))).toEqual(ok(values));
			}),
			RUNS,
		);
		fc.assert(
			fc.property(
				fc.array(result),
				failure,
				fc.array(result),
				(before, reason, after) => {
					const values = before.flatMap((item) =>
						item.ok ? [ok(item.value)] : [],
					);
					expect(all([...values, err(reason), ...after])).toEqual(err(reason));
				},
			),
			RUNS,
		);
		fc.assert(
			fc.property(fc.array(result), fc.array(result), (left, right) => {
				expect(all([...left, ...right])).toEqual(
					andThen(all(left), (head) =>
						map(all(right), (tail) => [...head, ...tail]),
					),
				);
			}),
			RUNS,
		);
	});
});
