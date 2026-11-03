# 0006. Internal composition records follow domain effects

Status: Accepted
Date: 2026-11-03
Ticket: none
Supersedes: none

## Context

The owner requires category-theory notation and abstraction design in internal model briefs and handoffs.
DDD language and mathematical composition answer different questions.
The [research report](<../../reports/Formal domain proof composition.md>) records the primary sources and their limits.

## Decisions

### D1. Every internal change brief and handoff cites a composition record

The record names objects, typed arrows, identity, composition, effects, equality, assumptions, laws, and witnesses.
It also names the hidden rule, caller facts, abstraction relation, alternatives, and deletion test.
Messages cite the shared record and report evidence status.
They do not contain a private reasoning transcript.

### D2. Law claims match the actual carrier

Pure total work uses ordinary composition and its identity and associativity laws.
Result composition fixes the error type and preserves the first failure.
A monad claim needs left identity, right identity, and associativity witnesses.
A changed map needs functor identity and composition witnesses.
Async effects need an explicit observation model and rejection policy.
Reassociation never grants permission to reorder effects.

A record can state why a law does not apply.
That reason cannot replace a required applicable witness.
Labels alone do not establish a law.

#### Formal claim

Fix one error type `E` and define the carrier `R_E(A) = Ok(A) | Err(E)`.
The value-level definitions are these:

```text
unit(a)            = Ok(a)
bind(Ok(a), f)     = f(a)
bind(Err(e), f)    = Err(e)
(f >=> g)(a)       = bind(f(a), g)
```

Left identity follows from the first bind equation.
Right identity follows by cases on `Ok` and `Err`.
For associativity, an error remains the same error on both sides.
For `Ok(a)`, both sides reduce to `bind(f(a), g)`.
This proof assumes total arrows with the stated carrier and equality.
It does not permit a change in effect order or hide a thrown exception.

The [model](../../formal/ProofAdmission.tla) checks `ResultLeftIdentity`, `ResultRightIdentity`, and `ResultAssociativity` over its finite carrier.
The [configuration](../../formal/ProofAdmission.cfg) names each checked law explicitly.
The case argument states the general algebraic claim.
The model run checks its finite encoding.

#### Category composition

For this gate, `parseChangeProof` maps text into `R_E(ChangeProof)`.
`admitChangeProof` with fixed AdmissionFacts maps ChangeProof into `R_E(Admitted)`.
Their Kleisli composition keeps the first rejection.
Objects denote valid values, while domain terms explain what those values mean.
A bounded context is not a category merely because both have a name.

The mathematical map derived from this carrier is `map(h, r) = bind(r, unit o h)`.
This policy introduces no runtime map or bind helper.
An implementation that changes a map must supply its own compatible witnesses.

#### Implementation correspondence

The shared [Result constructors](../../src/astack/result.ts) define success and rejection values.
[The parser](../../src/astack/change-proof/contract.ts) and [admission function](../../src/astack/change-proof/admission.ts) use early return for failure.
[The typed witness](../../tests/astack/proof-composition.ts) connects their actual signatures under the repo type check.
Runtime controls check rejection order and admission outcomes.
They do not establish a law for an arbitrary uninspected function.

#### Verification

[The matrix](../../.astack/proof-coverage.json) names the applicable model laws and implementation controls.
Pure or artifact composition must reject an unsupported monad claim.
Result composition must reject a missing applicable law witness.
Async composition must state both its observation and rejection policies.
The admission control still requires its named negative model and a restored-positive run.

### D3. Domain names stay in production interfaces

Category notation belongs in the internal contract, tests, models, and review evidence.
Production names follow the affected bounded context.
This policy does not require a new FP library, higher-kinded encoding, generic monad wrapper, or transformer stack.
Keep the existing abstraction and reader-load limits.

## Consequences

Internal messages expose their contract and unfinished obligations without a long reasoning narrative.
The checker can verify references and declared composition structure.
Semantic review and executable controls still establish whether the declared mapping fits the code.

## Alternatives considered

- Put monad labels on every function. Rejected because a function alone is not a monad instance.
- Omit category records for docs. Rejected because the owner requires an explicit abstraction contract for every change.
- Add generic runtime wrappers to express notation. Rejected because internal notation does not justify another production layer.
