# 0008. Ratified landing metadata requires an explicit opt-in

Status: Accepted
Date: 2026-11-04
Ticket: #18
Supersedes: 0007

## Context

Some Accepted processes require each implementation to update factual landing metadata while its governing proposal remains Proposed.
Complete-file comparison rejects that required record update.
The existing integrated-proposal route must retain its strict guarantee.
This decision adds one explicit governing-only option. It changes no ordinary or default admission rule.

## Decisions

### D1. One declared landing value can differ under unchanged authority

An integrated-proposal reference can select `governingMetadata: "landed-header-value"`.
The absent option retains complete-byte equality and its existing refusals.
The selected option requires one pre-existing, unambiguous top-level Landed header in integration, fixed base, and candidate.
It permits differences only within that header's nonblank single-line scalar value.
The parser preserves the exact prefix and suffix around that value.
Delimiter spelling, whitespace, line endings, other metadata, decisions, and body text remain equal across all three views.

The governing record remains Proposed. The process remains Accepted and completely byte-identical.
The process must authorize the selected lifecycle duty.
Semantic review must establish that authorization and the factual truth of the landing statement.
No model or historical comparison authenticates those human judgments.
The option admits neither a new proposal nor an amendment to decision authority.

[criterion:proof-landing] Admit only an explicitly selected valid landing value while preserving governing and process authority across both historical comparisons.

The supported grammar has one initial unindented H1 title, flat single-line metadata, and a blank separator before the first body heading.
Plain `Landed: value` and zero-indent `- **Landed:** value` forms are supported.
Each selected document must contain exactly one raw header-shaped Landed label.
Fenced, nested, repeated, missing, differently spelled, or multiline headers cannot supply that field.
The selected scalar cannot open HTML, a fence, or an explicit Markdown line continuation.
Control characters, Unicode line separators, and lone carriage returns are rejected.
An unchanged malformed selected document still fails.
The ordinary strict route does not use this new grammar.

Historical ancestry, regular UTF-8 files, cited nonempty decisions, separate proof sections, and current evidence remain mandatory.
Freshness hashes complete raw inputs, including the selected metadata value.
A value change during model execution remains stale even when the authority projection would compare equal.

#### Formal claim

`formal/ProofAdmission.tla` checks `StrictDefault`, `LandingAuthoritySafe`, `ProcessAuthoritySafe`, and `HistoryBound` under `formal/ProofAdmission.cfg`.
The selected cases distinguish complete equality, valid scalar changes, malformed headers, protected-text drift, and process drift.
Admission still requires every validation stage, complete model evidence, and current inputs.
The finite model assumes truthful parser, byte, and historical observations.
It does not prove arbitrary Markdown interpretation or factual landing truth.

#### Category composition

Fix the `AdmissionFacts` captured at the Git and tool boundary.
`parseChangeProof` and `admitChangeProof` retain their Result composition through `proofForSnapshot`.
`tests/astack/proof-composition.ts` supplies the typed witness.
`compareLandedAuthority` is a pure three-view comparison within admission.
Git, filesystem, subprocess, and receipt effects remain at their existing edges.
No custom composition operator, functor, or monad is added.

#### Implementation correspondence

`parseChangeProof` checks the optional closed literal.
`compareLandedAuthority` checks each selected header and compares exact protected slices with both historical views.
`admitChangeProof` keeps process comparison, status, decision, proof-record, model, and freshness duties.
The model's header validity and preserved-text facts abstract those concrete predicates.
The actual CLI and parser controls establish selected correspondence separately.
The model does not establish general TypeScript refinement.

#### Verification

`.astack/proof-coverage.json` links the criterion to actual implementation controls.
The CLI control compares the explicit option with the strict default on the same landing-only change.
Other controls retain protected text, process bytes, historical views, and schema closure.
The named mutation removes the selected landing guard from ValidationPass and must violate LandingAuthoritySafe.
The restored model must return the same positive counts.

### D2. Ordinary authority remains Accepted-only

An ADR reference without ratification evidence must cite an Accepted record and its nonempty decision.
Bare Proposed, superseded, malformed, duplicate, and fenced statuses cannot supply ordinary authority.
The separate opt-in never promotes a lifecycle status or permits recursive Proposed process authority.

### D3. Integration, process authority, and current proof remain mandatory

An integrated proposal still requires an exact immutable commit and the existing fixed-base ancestry relationships.
Both historical views must contain readable regular UTF-8 governing and process files.
Historical reads retain replacement-ref, graft, and lazy-fetch protections.
The process must remain Accepted and completely byte-identical in integration, base, and candidate.
Both cited decisions must remain nonempty.
The separate current proof record supplies all four proof sections and their required links and arrow explanations.
Current scope, controls, models, raw-input freshness, and every ordinary delivery gate remain mandatory.
Semantic review still establishes process meaning and the actual authority grant.
The default integrated-proposal route retains complete governing-byte equality.

[criterion:proof-ratification] Reject invalid authority, status, decisions, paths, history, and proof records. Preserve strict defaults outside the explicit landing option.

## Consequences

The explicit option has a deliberately narrow metadata grammar.
It can reject legacy formatting that the strict route accepts unchanged.
Authors still need independent semantic review and every ordinary delivery gate.
This decision grants no installation, review, CI, or merge clearance for a candidate.

## Alternatives considered

- Strip metadata globally. Rejected because it changes existing guarantees and can hide status or process edits.
- Accept arbitrary selectors. Rejected because the caller could exclude decision authority.
- Duplicate an immutable authority record. Rejected because it adds migration and synchronization duties.
- Require a patch certificate. Rejected because duplicate old and new text does not authenticate factual truth.
