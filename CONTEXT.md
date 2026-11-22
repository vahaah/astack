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

### Manifest base

The fixed commit that a ChangeProof names in its `base` field.
Ratification history stays bound to it. It must be an ancestor of the diff base.
_Avoid_: Current main tip
_Code_: `ProofBase.manifest`

### Diff base

The commit that the scope check and the input snapshots read from.
With a `--base` ref, it is the merge base of that ref and HEAD. Without a ref, it is the manifest base.
_Avoid_: Pinned base
_Code_: `ProofBase.diff`

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
Its governing authority remains bound to that integrated record.
Its status does not claim completed implementation.
_Avoid_: New self-approved proposal
_Code_: `AdrRatification`

### Landing metadata

A factual lifecycle value whose permitted change leaves decision authority unchanged.
Its selected Accepted process defines that duty.
_Avoid_: Mutable decision authority
_Code_: `AdrRatification.governingMetadata`

### Ratification process

An accepted decision that defines when an integrated proposal has authority for implementation.
Review must examine its meaning and the actual owner grant.
Git history alone cannot establish that grant.
_Avoid_: Automatic approval from ancestry

### CI proof record

A separate current proof explanation used beside a CI change.
It supplies no authority, implementation, model, or control input.
_Avoid_: Arbitrary formal document
_Code_: `ciProofRecords`

### Session guard

A hook handler that judges one tool call or prompt of an agent session and returns one verdict.
A deny of one guard stays a deny when the dispatcher joins the verdicts of all guards.
_Avoid_: Linter, advisory check
_Code_: `Handler`

### Merge grant

The PRs that an agent can merge with no new question to the owner.
It comes from the repo profile, or from merge words or an un-negated "full send" clause in a person's prompt of the current turn.
_Avoid_: Approval, green light
_Code_: `MergeGrant`

### Unattended session

A session that the host starts with `CLAUDE_CODE_SESSION_ATTENDED=0` or with an `sdk` entrypoint.
A prompt with no source field in such a session is not a person's prompt.
_Avoid_: Background mode, headless override
_Code_: `unattendedReason`

### Scratch file

A file outside the project with no `.git` or `.astack/profile.json` at or above it, or a file in the OS temp folder outside the project.
The write-time quality hooks skip it. A commit of it keeps every check.
_Avoid_: Ignored file, temp file
_Code_: `isScratchPath`

### Work-loss command

A git command that discards uncommitted work that `git status` shows in the whole tree or in a folder.
It is an owner gate.
_Avoid_: Destructive command, cleanup
_Code_: `workLossReasons`
