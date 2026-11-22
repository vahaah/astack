# 0005. Every change carries domain and formal proof

Status: Accepted
Date: 2026-11-03
Ticket: none
Supersedes: none
Amended by: 0008 D3 for integrated proposals, 0012 for an older proof base, and 0015 for rungs

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

> Amended 2026-11-22: D1 said "Code, configuration, docs, hotfixes, review fixes, and migration changes require the same gate before delivery." Each change still runs `astack check proof`. [ADR 0015](0015-change-proof-follows-risk.md) D1 and D4 give each change a proof rung, and only a change at R4 runs TLC. A docs-only change admits at R0 with the reference, scope and control checks.

### D2. Domain ownership defines the proof contract

The contract names the affected contexts, terms, aggregates, invariants, effective ADRs, and implementation controls.
Product names and interfaces follow their domain language.
Technical adapters keep I/O outside pure admission rules.
The ADR reader accepts plain metadata and bold list metadata with an accepted provenance stamp.
It recognises numbered decision headings with a full stop or a long dash.
Fenced examples and duplicate Status fields cannot establish an effective decision.
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

> Amended 2026-11-22: D3 said "The checker verifies a pinned TLC jar and runs current model inputs in owned temporary copies." That duty now applies at R4. [ADR 0015](0015-change-proof-follows-risk.md) D3 and D5 run one triple for each selected model, the manifest model first. Below R4 the checker starts no Java process and needs no jar.

> Amended 2026-11-22: The four proof sections of D3 moved to [the admission proof record](../../formal/ProofAdmission.md). They said that `admitChangeProof` admits only with fresh positive, negative and restored runs and current inputs. An ordinary reference to D3 needs no proof section.

### D4. Adoption preserves review and CI authority

Each repo adopts the CLI pin, proof files, required CI check, companion gate, and applicable branch overlays together.
An active run keeps its frozen configuration.
Migration preserves ledgers, recurrence history, cap use, and fixed growth baselines.
An existing CI-pin stop stays visible until an authorized installation transition resolves it.
Fresh required CI on the candidate head remains necessary.
The CI classifier can admit the committed default proof manifest and declared separate proof records beside CI changes.
It checks the actual base, strict file form, complete proof sections, references, and separate file roles.
All other non-CI changes remain blocked. Classification does not make a failed current proof advisory.
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
