# Astack delivery assurance

This context governs evidence and admission for engineering changes.
Product contexts keep their own terms, code, and decisions.

## Language

### ChangeProof

A contract that links one candidate change to its domain, composition, decisions, formal model, and implementation controls.
_Avoid_: Reasoning transcript, proof receipt
_Code_: `src/astack/change-proof/`

### Proof admission

The decision that the required artifacts and current model controls satisfy the delivery contract.
It does not establish every property of the implementation.
_Avoid_: Code correctness certificate

### Candidate inputs

The current source, configuration, model closure, and contract that a proof run binds together.
_Avoid_: Last successful commit

### Model control

A fresh positive model run or a named mutation that must produce its expected violation.
_Avoid_: Any failed command

### Composition record

The declared objects, typed arrows, effects, equality, laws, and witnesses for a candidate change.
_Avoid_: Private reasoning

### Abstraction relation

The mapping between a concrete contract or implementation action and its selected model representation.
_Avoid_: Same name means same behavior

### Implementation control

A test or probe that checks an observable implementation contract.
_Avoid_: Model result

### ReviewRun

A bounded review whose ledger owns findings, recurrence, and iteration use.
Its fixed growth record survives resumes and later runs.
_Avoid_: Proof admission

### Effective decision

A current accepted ADR decision or a ratified proposal with checked authority and history.
Its history remains available after a later ADR replaces it.
_Avoid_: Deleted decision

### Ratified proposal

A Proposed ADR integrated under a ratification process before the fixed implementation base.
Its complete bytes remain unchanged through the candidate.
Its status does not claim completed implementation.
_Avoid_: New self-approved proposal
_Code_: `AdrRatification`

### Ratification process

An accepted decision that defines when an integrated proposal has authority for implementation.
Review must examine its meaning and the actual owner grant.
Git history alone cannot establish that grant.
_Avoid_: Automatic approval from ancestry
