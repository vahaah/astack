# Laws as property tests

Category theory names properties that the code already needs.
Write those laws as property tests.
Keep their names in test titles rather than production identifiers.
Without Effect, use `fast-check` as a dev dependency of the package running the tests.
With Effect, use `FastCheck` and `Arbitrary` from `effect`.

| Word | Meaning in code | Law to test |
|---|---|---|
| product | Fields that are always present together in a record | The type enforces this |
| sum | Alternatives in a discriminated union with a literal `kind` | An exhaustive `switch` compiles |
| total function | Every typed input produces a result | Generated input never causes a throw |
| monoid | A combine function and its empty value | Identity and associativity |
| round trip | Parsing paired with serialization | `parse(serialize(x))` equals `x` |
| idempotent | Repetition has the same effect as one application | `f(f(x))` equals `f(x)` |
| total order | A comparator ranks every pair | Antisymmetry and transitivity |
| functor | A `map` preserves shape | Identity and composition |
| Kleisli chain | Steps return `Result` values with early return | The first failure stops the chain |

## Monoid

```ts
import fc from "fast-check";

const usage = fc.record({
	calls: fc.nat(),
	costMinor: fc.nat(),
});

test("addUsage has emptyUsage as its identity", () => {
	fc.assert(
		fc.property(usage, (a) => {
			expect(addUsage(emptyUsage, a)).toEqual(a);
			expect(addUsage(a, emptyUsage)).toEqual(a);
		}),
	);
});

test("addUsage is associative", () => {
	fc.assert(
		fc.property(usage, usage, usage, (a, b, c) => {
			expect(addUsage(a, addUsage(b, c))).toEqual(addUsage(addUsage(a, b), c));
		}),
	);
});
```

## Round trip

```ts
test("an invite survives serialize then parse", () => {
	fc.assert(
		fc.property(inviteArbitrary, (invite) => {
			expect(parseInvite(serializeInvite(invite))).toEqual({
				ok: true,
				value: invite,
			});
		}),
	);
});
```

## Idempotent normalizer and total order

```ts
test("normalizeEmail is idempotent", () => {
	fc.assert(
		fc.property(fc.emailAddress(), (email) => {
			expect(normalizeEmail(normalizeEmail(email))).toBe(normalizeEmail(email));
		}),
	);
});

test("compareJobs is antisymmetric", () => {
	fc.assert(
		fc.property(jobArbitrary, jobArbitrary, (a, b) => {
			expect(Math.sign(compareJobs(a, b))).toBe(-Math.sign(compareJobs(b, a)));
		}),
	);
});
```

## Functor laws for a hand-written map

```ts
test("mapResult keeps identity and composition", () => {
	const double = (n: number) => n * 2;
	const label = (n: number) => `n${n}`;
	fc.assert(
		fc.property(resultArbitrary(fc.integer()), (result) => {
			expect(mapResult(result, (n) => n)).toEqual(result);
			expect(mapResult(result, (n) => label(double(n)))).toEqual(
				mapResult(mapResult(result, double), label),
			);
		}),
	);
});
```

Add a law test only when the function has that property by design.
When a law fails, decide whether the function or law is wrong before changing either.
