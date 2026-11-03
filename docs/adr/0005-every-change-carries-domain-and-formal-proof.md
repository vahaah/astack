# 0005. Every change carries domain and formal proof

Status: Accepted
Date: 2026-11-03
Ticket: none
Supersedes: none

## Context

The owner requires TLA+ for every change workflow, including docs and configuration.
The owner also requires DDD contracts, internal composition records, and durable ADR history.
The current optional model path cannot enforce that policy.
The [research report](<../../reports/Formal domain proof composition.md>) separates model claims from implementation evidence.

ADR 0004 D3 keeps CLI and CI checks independent of hook profiles.
The new proof gate retains that rule.

## Decisions

### D1. Every change requires a checked ChangeProof

Code, configuration, docs, hotfixes, review fixes, and migration changes require the same gate before delivery.
Read-only questions have no delivery change to prove.
Missing tools or evidence block delivery.
No profile flag or minimal hook preset disables this requirement.

### D2. Domain ownership defines the proof contract

The contract names the affected contexts, terms, aggregates, invariants, effective ADRs, and implementation controls.
Product names and interfaces follow their domain language.
Technical adapters keep I/O outside pure admission rules.
The ChangeProof aggregate owns proof admission.
ReviewRun retains its separate ledger and review authority.

### D3. Admission requires fresh model execution and current inputs

The checker verifies a pinned TLC jar and runs current model inputs in owned temporary copies.
It requires a complete positive run, the named violation from one exact mutation, and an unchanged positive run.
A parse error, timeout, incomplete run, unrelated violation, or stale input fails the gate.
The model must state bounds, assumptions, fairness, and its relation to the changed contract.
An unrelated example and a stored receipt do not satisfy this duty.

Model checking does not establish implementation correspondence.
Existing tests, static checks, and removal controls remain required.
Editorial docs need an explicit preservation relation for their selected contract data.

#### Formal claim

`admitChangeProof` owns admission for a parsed ChangeProof and fixed AdmissionFacts.
Let `P`, `N`, and `R` denote judged positive, named negative, and restored-positive evidence.
Let `I0` and `I1` denote the candidate snapshots before and after execution.

```text
Admitted => DomainValid and CategoryValid and ControlsValid
         and P = Complete and N = ExpectedViolation and R = Complete
         and States(P) = States(R)
         and Head(I0) = Head(I1) and Digest(I0) = Digest(I1)
```

The [admission model](../../formal/ProofAdmission.tla) checks `AdmitSafe` and `FailureIsTerminal`.
Its [configuration](../../formal/ProofAdmission.cfg) also checks progress under weak fairness of `Next`.
The finite model has four validation stages and bounded evidence outcome classes.
It abstracts validator internals and treats judged tool evidence as inputs.

#### Category composition

The pure arrows use a fixed error type `Rejection`.

```text
parseChangeProof : Text -> Result<ChangeProof, Rejection>
admitForFacts    : ChangeProof -> Result<Admitted, Rejection>
admitForFacts(p) = admitChangeProof(p, fixedFacts)
candidate       = parseChangeProof >=> admitForFacts
```

`>=>` preserves a failed parse and calls admission only for a parsed value.
The [composition ADR](0006-internal-composition-records-follow-domain-effects.md) gives its laws and proof sketch.
Tool execution stays in the I/O edge and keeps its declared order.
The notation does not add a runtime monad wrapper.

#### Implementation correspondence

| Model concept | Concrete contract |
|---|---|
| Validation stages | `parseChangeProof` and `checkReferences` reject missing domain, category, and control evidence |
| `RunPositive` | `judgePositive` requires complete checked-state evidence |
| `RunNegative` | `judgeNegative` requires the named violation and a counterexample |
| `RunRestored` | `admitChangeProof` requires the restored run and matching state counts |
| `current` | `admitChangeProof` compares candidate heads and input digests |
| `Admit` | A successful admission produces the typed receipt |

These links describe the abstraction relation.
They do not establish refinement of all TypeScript behavior.
`snapshot` binds the bytes of each file, the staged index, and the Git mode of each regular file.

Initialized submodules apply the same rules to their HEAD, index, and files, including nested submodules.
An empty uninitialized submodule binds its gitlink and empty state.
A populated submodule without a readable checkout blocks admission.
The model's `InputChange` represents a change to any of those inputs.

Let `D(R)` denote the digest of the index and recorded worktree entries of repository `R`.
For a child checkout `C`, its parent entry records `(Head(C), D(C))`.
Each initialized child uses the same rule.
Under the no-collision assumption, equal snapshots preserve the recorded data at every finite depth.
The finite model abstracts this structure as `current`.
The [admission implementation](../../src/astack/change-proof/admission.ts) remains subject to its executable controls.

#### Verification

[The proof matrix](../../.astack/proof-coverage.json) links the contract to implementation controls.
The negative model control removes the freshness guard from `Admit` and must violate `AdmitSafe`.
A parse error or another violation does not satisfy that obligation.
The unchanged positive model must pass again.
Current results belong to CI and proof receipts, so this ADR does not copy a transient pass result.

### D4. Adoption preserves review and CI authority

Each repo adopts the CLI pin, proof files, required CI check, companion gate, and applicable branch overlays together.
An active run keeps its frozen configuration.
Migration preserves ledgers, recurrence history, cap use, and fixed growth baselines.
An existing CI-pin stop stays visible until an authorized installation transition resolves it.
Fresh required CI on the candidate head remains necessary.
Remote required-check settings remain an owner action.

### D5. ADR history stays explicit

Every ChangeProof cites current accepted decisions.
A changed architectural decision gets a new ADR with the reasons and rejected alternatives.
A replacement links the old and new ADRs without deleting the old decision body.
Keep the existing whole-ADR supersession format.
Do not add a clause resolver without a concrete need.

## Consequences

Every change pays a modeling and execution cost.
The checker can reject absent or invalid evidence without an abstract review round.
People still judge domain meaning, model relevance, and implementation correspondence.
Repository artifacts cannot establish a model's private reasoning.

## Alternatives considered

- Keep formal models optional. Rejected because the owner requires them for every change.
- Use a hook as the only gate. Rejected because current client event and failure paths can allow a change.
- Add a disable flag to the profile. Rejected because it defeats the mandate.
- Reuse a stock retry model for every change. Rejected because it does not establish the changed contract.
- Replace all existing gates with model checking. Rejected because model and code correspondence needs separate evidence.
