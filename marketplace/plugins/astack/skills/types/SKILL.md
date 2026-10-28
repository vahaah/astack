---
name: types
description: Use when you write or review TypeScript or Swift types. The house type and FP conventions as 25 rules, each with an example and the tool that enforces it. It also holds the bounds against over-engineering, Effect notes, Swift notes and the astack type hook.
metadata:
  origin: pstack
---

# Types

Use functional conventions in plain TypeScript.
Model data with algebraic types and match every variant.
Write total functions.
Return failures and absence as values.
Keep domain logic pure and effects at system edges.
Compose small functions with readonly data.

These conventions need no FP library.
Use Effect only where the repo already uses it.
Then follow `references/effect.md`.
Use category theory for property names and laws, never for higher-kinded encodings.
A stricter repo rule takes priority.

Each rule identifies its enforcement.
"hook" means the astack type hook.
"tsc" names a compiler flag, and "Biome" names a lint rule.
"law" means a property test, and "review" means reviewer judgment.
Find property test forms in `references/laws.md` and TypeScript examples in `references/typescript-practices.md`.

## Types tell the truth

1. Use `unknown` for data that you did not parse. Do not write `any`.
   - Do: `const readInvite = (body: unknown): Result<Invite, InviteError> => parseInvite(body)`
   - Do not: `const readInvite = (body: any) => body.email`
   - Enforced by: hook (deny), Biome `noExplicitAny`, tsc `strict`.
2. Do not cast. Parse the value, narrow it, or use `satisfies`. You can use `as const`.
   - Do: `Invite.parse(JSON.parse(text))` and `const seats = { free: 3, team: 50 } satisfies Record<Plan, number>`
   - Do not: `JSON.parse(text) as Invite`, `(await res.json()) as Quote` or `ctx as unknown as Ctx`
   - Enforced by: hook (deny). Keep one honest guard, `isRecord(value): value is Readonly<Record<string, unknown>>`, in the repo kernel.
3. Do not use `!`. Make the type total, or handle `undefined`.
   - Do: `const [first] = rows; if (first === undefined) return { ok: false, error: "empty" };`
   - Do not: `rows[0]!.id` or `let client!: Client`
   - Enforced by: hook (deny), Biome `noNonNullAssertion`, tsc `noUncheckedIndexedAccess`.
4. Do not silence the compiler. Use `@ts-expect-error` only in a `*.test-d.ts` type test.
   - Do: `// @ts-expect-error` above `const bad: Invite = { kind: "accepted" };` in `invite.test-d.ts`
   - Do not: `// @ts-ignore`, `// @ts-nocheck`, or a `biome-ignore` of `noNonNullAssertion`
   - Enforced by: hook and comment hook (deny), Biome `noTsIgnore`.
5. Put the strict flags in the shared base tsconfig. Do not turn one off in a package.
   - Do: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch` and `verbatimModuleSyntax`
   - Do not: `"noImplicitAny": false`
   - Enforced by: tsc, and review of the base file.
6. Give a brand to each ID or unit that must not mix. Make the brand only in the parser.
   - Do: `const MemberId = z.uuid().brand<"MemberId">()`
   - Do not: `type MemberId = string` with `id as MemberId` in each caller
   - Enforced by: review. The hook catches the cast. A brand file without a schema library goes in `types.allow`.
7. Get each type from the schema that owns the shape. Do not write a second copy.
   - Do: `type Job = typeof jobs.$inferSelect` and `type Invite = z.infer<typeof Invite>`
   - Do not: a hand-written `interface Job { id: string; status: string }` next to the table
   - Enforced by: review, and repo drift tests.

## Products and sums

8. Use a record for values that are always present together. Use a discriminated union for alternatives.
   - Do: `type Invite = { readonly kind: "pending"; readonly sentAt: Date } | { readonly kind: "accepted"; readonly memberId: MemberId }`
   - Do not: `{ accepted: boolean; acceptedAt?: Date; memberId?: string }`, which allows "accepted" with no member
   - Enforced by: review, tsc `exactOptionalPropertyTypes`.
9. Match every union fully. Do not put `default` on a closed union.
   - Do: give a value switch a declared return type and no `default`. End a statement switch with `default: { const unhandled: never = invite; return unhandled; }`.
   - Do not: `default: return "Unknown";`
   - Enforced by: tsc, Biome `useExhaustiveSwitchCases`, review. Never apply the Biome fix, because it adds a `throw` with a TODO.
10. Use a union of string literals, not `enum`.
    - Do: `const ROLES = ["admin", "member"] as const; type Role = (typeof ROLES)[number];`
    - Do not: `enum Role { Admin, Member }`
    - Enforced by: hook (advice), Biome `noEnum`.
11. Make data `readonly`. Return a new value. Change only a local variable that stays in the function.
    - Do: `return { ...cart, lines: [...cart.lines, line] };`
    - Do not: `cart.lines.push(line)` on a parameter
    - Enforced by: review, Biome `useConst` and `noParameterAssign`.

## Totality and errors as values

12. Write total functions. Each input of the type must give a result.
    - Do: make the input stronger with `NonEmpty<T>`, or the output weaker with `T | undefined` or a `Result`.
    - Do not: `const head = <T>(xs: T[]): T => xs[0]!;`, or a throw for a case that "cannot happen"
    - Enforced by: tsc `noUncheckedIndexedAccess`, hook for `!`, law.
13. Return an expected failure as a value. Throw only for a defect, such as a bug or a broken invariant.
    - Do: `parseIban(raw: string): Result<Iban, "bad_format" | "bad_checksum">`
    - Do not: `parseIban(raw: string): Iban` that throws on user input
    - Enforced by: review, Biome `useThrowOnlyError`.
14. Use one `Result` type per repo, in its shared kernel. Use `T | undefined` for absence.
    - Do: `type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };` with `if (!result.ok) return result;`
    - Do not: an `Option<T>` class, a new FP library, or `map` and `flatMap` helpers before three call sites chain results
    - Enforced by: review.
15. Do not use class inheritance. Model variants and error kinds as unions.
    - Do: `type ImportError = { kind: "bad_header"; column: string } | { kind: "too_large"; rows: number }`
    - Do not: `class CsvImporter extends BaseImporter`
    - Enforced by: hook (advice). The hook allows `Error` subclasses, React components and the Effect class helpers. A repo adds a base with `types.extendsAllow`.

## Pure core, effects at the edges

16. Parse data once, where it enters the system. Inside, trust the type.
    - Do: `const input = Invite.safeParse(body); if (!input.success) return badRequest(input.error); return invite(input.data);`
    - Do not: a second `typeof email === "string"` check inside `invite()`
    - Enforced by: review, repo architecture tests.
17. Keep domain logic pure. Give it the clock, random values and I/O as arguments.
    - Do: `const dueAt = (job: Job, now: Instant): Instant => addDays(now, job.days)`
    - Do not: `new Date()`, `fetch`, `process.env` or a database client in a domain package
    - Enforced by: repo architecture tests, review.
18. Export functions and types. Use a class only for a resource with a lifetime, or where a framework needs one.
    - Do: `export const priceQuote = (lines: readonly Line[]): Money => sumMoney(lines.map(linePrice))`
    - Do not: `export class QuoteService { constructor(private db: Db) {} }` with one implementation
    - Enforced by: review, with the deletion test from `astack:coding-rules`.

## Composition and laws

19. Build behavior from small functions that compose. Give each step a name. A step with nothing to do returns its input.
    - Do: `const rows = applyFilters(filters, loadRows(input));`, where `applyFilters([], rows)` equals `rows`
    - Do not: a custom `pipe`, `compose` or `curry` helper in a repo without Effect
    - Enforced by: law for the identity case, review.
20. When you write a combine function, give it an empty value. Test associativity and identity.
    - Do: `addUsage(emptyUsage, a)` equals `a`, and `addUsage(a, addUsage(b, c))` equals `addUsage(addUsage(a, b), c)`
    - Do not: combine floats for money. Keep money in integer minor units.
    - Enforced by: law. Associativity makes chunked and parallel folds safe.
21. When you write a parse and serialize pair, test the round trip.
    - Do: a property that `parseInvite(serializeInvite(x))` equals `{ ok: true, value: x }` for each generated `x`
    - Do not: a test of one fixture only
    - Enforced by: law.
22. Make a normalizer idempotent. Make a comparator a total order. Test both.
    - Do: `normalize(normalize(x))` equals `normalize(x)`, and `compare(a, b)` equals `-compare(b, a)`
    - Do not: a sort comparator that returns `a > b` as a boolean
    - Enforced by: law.
23. Write your own `map` only when no library form fits. Then test the functor laws.
    - Do: `mapResult(r, (x) => x)` equals `r`, and `mapResult(r, (x) => g(f(x)))` equals `mapResult(mapResult(r, f), g)`
    - Do not: a `Functor` interface or a type-class dictionary
    - Enforced by: law, review.

## Effect and type tests

24. In Effect code, use the Effect forms. Run a program only at an edge.
    - Do: `Data.TaggedError` errors, `Schema` at the edges, `Layer` for dependencies and `Effect.gen` for steps
    - Do not: a plain `Result` inside an Effect pipeline, or `Effect.runPromise` in a domain package
    - Enforced by: repo architecture tests, review. `references/effect.md` has the details.
25. Test type-level code. Prove that the illegal state does not compile.
    - Do: an `invite.test-d.ts` file with `// @ts-expect-error` above `const bad: Invite = { kind: "accepted" };`
    - Do not: a mapped or conditional type of more than approximately 10 lines with no type test
    - Enforced by: tsc in the typecheck gate, review.

## Bounds against over-engineering

Keep functional conventions within these limits.

1. Add no FP library to a repo that has none. Use Effect only where the repo uses it.
2. Write no higher-kinded encodings, such as `Kind<F, A>` or an `HKT` interface. Write no `Functor` or `Monad` interface and no type-class dictionary. A monoid is two named functions, such as `addUsage` and `emptyUsage`.
3. Write no interface or class with one implementation. A test fake counts as the second one.
4. Add no new generic before 3 real call sites use different types. Each type parameter must appear twice in the signature.
5. Build no monad transformer stacks. Plain code returns `Promise<Result<T, E>>` and uses early return. In Effect, `Effect<A, E, R>` is already the stack.
6. Write no custom `pipe`, `flow`, `compose` or `curry` outside Effect. Name the values between the steps.
7. Use no `Option` type outside Effect. Under `strictNullChecks`, `T | undefined` is the option type.
8. Add no Result helpers, such as `map`, `chain` or `traverse`, before 3 call sites chain results. Use early return first.
9. Give a type-level program of more than approximately 10 lines a type test. Prefer a runtime parse to a clever type.
10. Keep category theory names in tests and reviews, such as "monoid law" and "round trip". Names in production code follow the domain.
11. Prefer a `switch` over a union to visitor, strategy or registry objects. Change only when 3 call sites dispatch on the same union.
12. Local mutation inside one function is allowed. Purity is a property of the interface of a function, not of each line.

## Swift

Swift expresses most of these rules directly.
An enum with associated values is a sum.
A struct is a product, and `switch` is exhaustive.
Use `@unknown default` only for a system enum.
Prefer `let` and structs.

Represent expected failure with `Result<Success, Failure>` or typed `throws(E)`.
Reserve `fatalError` and `precondition` for defects.
Do not use `!`, `as!` or `try!`.
Use inheritance only when UIKit or another framework requires it.
Write laws as Swift Testing parameterized tests with `@Test(arguments:)`.
Follow the repo's Swift style guide, or an available `write-swift` skill.

## The type hook

The astack hook reads `Edit`, `Write` and `MultiEdit` changes to `.ts`, `.tsx`, `.mts` and `.cts` files.
It compares each whole-file pattern count before and after the change.
When a deny count grows, it rejects the change and identifies the new lines.
It checks these patterns:

- `any` in a type position.
- an unsafe cast, which is `as T` other than `as const` and a bare `as unknown`, and also `as unknown as T` and `<T>value` in a `.ts` file.
- a non-null assertion, which is `value!` and `let value!: T`.
- `@ts-ignore`, `@ts-nocheck`, and `@ts-expect-error` outside a `*.test-d.ts` file.

Growth in `enum` declarations, `Function`, `Object` or `{}` types, or unlisted class bases produces a note rather than a deny.
The tokenizer excludes strings, templates, regular expressions, comments and JSX.
A file that cannot tokenize passes.

Existing code does not need cleanup merely to pass this count rule.
Moving, renaming or formatting a line preserves its count.
A new cast raises the count even when old casts remain in the file.
Remove an old cast or `any` only in work about that code.

The hook skips `*.d.ts`, `*.gen.ts`, `*.generated.*`, `generated/` paths and Supabase type output.
It also skips a file with `@generated` or "DO NOT EDIT" in its first 5 lines.
Set further repo exceptions in `.astack/profile.json`:

```json
{
  "types": {
    "skip": ["legacy/**"],
    "allow": [
      { "paths": ["packages/kernel/src/brand.ts"], "kinds": ["cast"], "reason": "brand constructors" }
    ],
    "extendsAllow": ["^Base[A-Z]\\w*Error$"]
  }
}
```

`skip` contains globs for files that the hook leaves unread.
An `allow` entry requires paths, kinds and a reason.
The hook ignores an incomplete entry.
Kinds are `any`, `cast`, `non-null`, `ts-ignore`, `ts-nocheck`, `ts-expect-error`, `banned-type`, `enum` and `extends`.
Keep one kernel file per repo in `allow` for brand constructors, one `fake<T>()` test helper and DOM type guards.
`extendsAllow` contains regular expressions for additional class bases.

For a tool without hooks, run the same check through a git hook or CI:

```sh
astack check-types                 # the working tree, the staged and the untracked files against HEAD
astack check-types --staged        # the staged diff only
astack check-types --base main     # HEAD against its merge base with main
astack check-types --json          # the findings as JSON
```

The command exits 1 when a deny count rises in any file.
