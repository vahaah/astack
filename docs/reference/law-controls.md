# Law control requirements

[ADR 0017](../adr/0017-law-claims-run-on-code.md) governs law claims and their controls.
Each control runs on the real function with generated inputs.

## Acceptance criteria

- [criterion:RL-MONAD] `andThen` and `ok` keep the left identity, the right identity and the associativity on generated values and arrows. The Kleisli forms of these laws hold, and `andThen` never calls its arrow on an error.
- [criterion:RL-FUNCTOR] `map` keeps identity and composition on generated values and transforms. It returns an error unchanged.
- [criterion:RL-ALL] `all([])` is `ok([])`. `all` keeps the input order of the values and returns the first error in input order. `all` of two joined lists equals the join of the two `all` results.
- [criterion:VM-MONOID] `combine` is associative, and `ALLOW` is its identity, on generated notes, denies and continues with generated text. `combineAll([])` is `ALLOW`.
- [criterion:LAW-CLAIMED] A manifest lists the laws that it claims and the laws that its composites and its carrier need. A missing row of another law parses, and a missing needed row stops at stage category. A manifest with eight rows parses, and a `model:` law witness still admits.
- [criterion:LAW-MONOID] A monoid claim needs witnesses for both `monoid-id` and `monoid-assoc`. A claim with one of them stops at stage category.
- [criterion:ADMIT-ORDER] Admission examines the domain, then the category, then the controls, then the model. A manifest with two faults stops at the first stage of the two.

## Claim boundary

Each property runs 100 generated cases. A pass is evidence, and it is not a proof for each value.
fast-check makes each arrow with `fc.func`, so each arrow is a pure total function.
Review makes sure that a monoid claim names a combine arrow of its record.
