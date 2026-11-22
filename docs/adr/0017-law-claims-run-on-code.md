# 0017. Law claims run on code, and Result gets map, andThen and all

Status: Accepted
Date: 2026-11-22
Ticket: none
Supersedes: none

## Context

ADR 0006 D2 asks for law witnesses for Result composition.
`formal/ProofAdmission.tla` checked three Result invariants on a finite model of Result with two values and two errors.
That model never read `src/astack/result.ts`, so a defect in the TypeScript code could not make it fail.
`result.ts` exported only `ok` and `err`. `admission.ts` held 27 early returns over Result values.

The proof contract asked each manifest for eight law rows.
154 of 202 manifest versions filled most of those rows with "not applicable".
The contract had no monoid law, but `combine` of the hook verdicts is a monoid.

## Decisions

### D1. Result gets map, andThen and all, and a property control examines each law on the real function

`src/astack/result.ts` exports `map(result, transform)`, `andThen(result, next)` and `all(results)` beside `ok` and `err`.
The error type stays fixed, as ADR 0006 D2 says.
`all` returns the values in input order, or the first error in input order. `all([])` is `ok([])`.
Each law family has one control in `tests/property/`.
Each control uses fast-check with generated values and arrows, 100 runs, and the seed of a failure.

#### Formal claim

Fix one error type `E`. The carrier is `Result<A, E>`.

```text
ok      : A -> Result<A, E>                                  identity
andThen : (Result<A, E>, A -> Result<B, E>) -> Result<B, E>  bind
f >=> g = (a) => andThen(f(a), g)
map(r, h) = andThen(r, (x) => ok(h(x)))
all     : readonly Result<A, E>[] -> Result<readonly A[], E>  first error
```

The monad laws are the left identity, the right identity and the associativity of `andThen` with `ok`.
The same three laws hold for `>=>`, with `ok` as its identity.
`map` keeps identity and composition. `all` of two joined lists equals the join of the two `all` results.
The four helpers are pure and have no effect.
`combine` keeps its code and its effect-free arrow `(Verdict, Verdict) -> Verdict`, with `ALLOW` as its identity.

A property run examines 100 generated cases. It is evidence, and it is not a proof for each value.
The model `formal/ProofAdmission.tla` and its configuration `formal/ProofAdmission.cfg` keep the admission claims of ADR 0005 and ADR 0014.
The Result operators and invariants leave that model, because they never read the code.

#### Category composition

`parseChangeProof` maps proof text to `Result<ChangeProof, Rejection>`.
`admitChangeProof` with fixed admission facts maps a `ChangeProof` to `Result<Admitted, Rejection>`.
`parseChangeProof >=> admitChangeProof` composes through `andThen` and keeps the first rejection.
`tests/astack/proof-composition.ts` writes that composite as `andThen(parseChangeProof(text), (proof) => admitChangeProof(proof, facts))`.

The abstraction hides the short circuit. A caller knows only the first-failure rule.
Without the helpers, 9 early returns come back, and a plan domain record cannot read `>=>` as a call of `andThen`.
The record of this change claims no monoid law, because it holds no combine arrow.

#### Implementation correspondence

| Law family | Control | Functions |
|---|---|---|
| Monad and Kleisli laws | `result-monad-laws` | `andThen`, `ok` |
| Functor laws | `result-functor-laws` | `map` |
| Order and first error | `result-all-order` | `all` |
| Monoid laws | `verdict-monoid` | `combine`, `ALLOW`, `combineAll` |

`first`, `modelCheck` and `checkReferences` in `admission.ts` chain their checks with `andThen`, `map` and `all`.
`admitChangeProof` keeps early return, because each evidence value has its own type and stage.

#### Verification

`.astack/proof-coverage.json` links the criteria of [the law control requirements](../reference/law-controls.md) to their controls.
A hand mutation of `andThen` that returns its input fails `result-monad-laws`.
A hand mutation of `all` that keeps the last error fails `result-all-order`.
A hand mutation of `RANK.allow` to 1 fails `verdict-monoid` with a counterexample.
`proof-stage-order` holds three manifests with two faults each. It fails when the domain and category stages swap.

### D2. A manifest lists the laws that it claims and the laws that it needs

A manifest lists each law that it claims.
It also lists each law that its composites and its carrier need.
Composites need the three category laws. A `result` or `promise-result` carrier needs the three monad laws.
A missing row of another law parses. A manifest with the eight old rows still parses.

### D3. A monoid claim needs both monoid laws

`LAWS` gets `monoid-id` and `monoid-assoc`.
A monoid claim needs witnesses for both, as a functor claim does.
A record claims a monoid only for a combine arrow that it declares, and review examines that link.

### D4. A model law witness is deprecated

The `model:` law witness stays, so the pinned CLI of a product repo still admits its manifests.
A new manifest cites `control:` witnesses for its laws.
A later change removes the kind after the product repos move their witnesses.

### D5. The Result helper set counts as one generic

Design section 8.2 bound 3 and types bound 8 count `map`, `andThen` and `all` as one generic.
That generic needs 3 call sites that chain results. astack has 148 early returns over Result values.
ADR 0006 rejected generic runtime wrappers that only express notation.
These helpers replace 9 early returns and give the plan domain record its reading of `>=>`. So they are not wrappers for notation.

## Consequences

- Easier: a law claim in a manifest names a test that runs on the code.
- Easier: a manifest lists fewer rows. A missing needed law still stops at stage category.
- Harder: each new law family needs its own property control.
- Follow-up: a product repo that cites `model:` law witnesses moves them to controls before a later change removes the kind.

## Alternatives considered

- Keep the TLA+ Result model as the only law witness. Rejected because it never reads `result.ts`.
- Keep both witnesses. Rejected because two places then hold one claim.
- A Result class with methods. Rejected because types bound 3 forbids a class with one implementation.
- Curried helpers. Rejected because they need a `pipe`, and types bound 6 forbids it.
- A tuple overload of `all`. Rejected because it is a type-level program under types bound 9.
- One `monoid` row. Rejected because it hides a missing identity witness.
- Keep eight rows. Rejected because 154 of 202 manifest versions filled them with "not applicable".
- Remove the model witness kind now. Rejected because it stops the pinned CI of a product repo.
