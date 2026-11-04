# 0007. Integrated proposals require accepted ratification

Status: Superseded by 0008
Date: 2026-11-04
Ticket: none
Amends: 0005 D5

## Context

Some repositories ratify decisions before implementation and reserve Accepted for completed implementation.
The Accepted-only rule cannot admit those records without a false status change.
The owner approved an explicit history-bound route for those records.
The existing default remains strict. Other proof requirements remain mandatory.

## Decisions

### D1. Ordinary ADR references remain Accepted-only

An ADR reference without ratification evidence retains its current admission rule.
Proposed, superseded, malformed, duplicate, and fenced statuses cannot supply ordinary authority.
No profile flag permits arbitrary proposals.

### D2. Integrated proposals require unchanged historical authority

An explicit `ratification` record names an integrated proposal, its accepted process, an immutable commit, and a separate proof record.
The commit must be an exact full commit identity and an ancestor of the fixed proof base.
The fixed base must remain an ancestor of the candidate head.
Both ADRs must exist as regular UTF-8 files in the integrated commit, base, and candidate.
Their complete bytes must match across those views.
Historical reads ignore replacement refs and graft ancestry. They do not fetch missing objects.
They require Git's `--no-lazy-fetch` option. An unsupported option fails before object access.

The governing record must have one Proposed status and the cited nonempty decision.
The process must have one Accepted status and its cited nonempty decision.
No Proposed process can supply recursive authority.

[criterion:proof-ratification] Reject missing authority, changed records, false history, invalid paths, missing decisions, and incomplete proof evidence.

History establishes integration and byte preservation.
It does not establish human approval or the meaning of the process decision.
Semantic review must make sure the accepted process ratifies the selected integrated proposal.
Merge review must examine the authorised base and integration branch.
New or amended proposals require a separate authorised integration before this route can use them.

#### Formal claim

`formal/ProofAdmission.tla` checks `RatifiedAuthority` under `formal/ProofAdmission.cfg`.
The finite cases include an accepted record, a valid integrated proposal, and selected invalid authority classes.
`ValidationPass` requires `AuthorityAllowed` for the domain stage.
Admission still requires every validation stage, complete model evidence, and current inputs.
The model abstracts Git, parsing, byte comparison, process meaning, and owner approval.

#### Category composition

Fix the `AdmissionFacts` captured at the Git and tool boundary.
Define `admitForFacts(p) = admitChangeProof(p, fixedFacts)`.
`parseChangeProof >=> admitForFacts` preserves a rejected contract and admits only parsed evidence.
`tests/astack/proof-composition.ts` supplies the typed composition witness.
ADR 0006 retains the Result identity and associativity laws.
Historical Git reads remain effects at the CLI edge.

#### Implementation correspondence

`parseChangeProof` validates the optional authority record.
`admitChangeProof` consumes checked historical facts and current file inputs.
The model's authority fields represent the selected historical, ancestry, status, path, decision, preservation, and proof-record predicates.
The implementation tests check those predicates separately with real temporary Git repositories.
Replacement and graft controls must reject substituted history even when an ordinary Git read accepts it.
This relation does not prove general TypeScript or Git refinement.

#### Verification

`.astack/proof-coverage.json` links this criterion to `proof-ratification` controls.
The CLI positive control runs the model, named negative, and restored model on a valid integrated proposal.
The source model's negative removes the domain authority guard and must violate `RatifiedAuthority`.
Existing Accepted admission, bare Proposed rejection, freshness, category, control, and model-output checks remain required.

### D3. A separate proof record preserves the governing text

The new route uses `proofRecord` for all four existing proof sections and their required links and arrow explanations.
The proof record is a current candidate input and receives normal scope, reference, and freshness checks.
It never changes the historical governing ADR or promotes its lifecycle status.

## Consequences

Ratified implementation plans can retain their lifecycle vocabulary.
The route adds historical reads and explicit semantic-review duties.
Metadata edits also change bytes and require a separate authorised integration.
Every ordinary implementation gate and current model run remains mandatory.

## Alternatives considered

- Accept every Proposed record. Rejected because a candidate can approve its own plan.
- Stamp incomplete records Accepted. Rejected because that changes repository decision meaning.
- Add a profile bypass. Rejected because it disables required proof.
- Resolve selected clauses within mutable records. Rejected because immutable whole-file evidence is the smaller supported contract.
