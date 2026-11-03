---
plan: spec-review-proof
tier: standard
status: active
home: repo
tracker: none
delegate: off
checkpoints: report
owner-gates: [production merge, hosted migration, money, legal, accounts, secrets, client messages, destructive resets]
execute: [S1]
reviewed: 2026-11-03
---

# Maintainers can check spec links and bound review work

Spec review produces testable properties before implementation.
Code reviews require concrete evidence.
CLI checks report review growth and broken spec links.
Formal models remain optional.

## Goal

Goal. Maintainers use executable checks and explicit spec links to assess changes with bounded review work.
Decision. Which review work becomes an executable check or a testable spec property?
Done when. Both new CLI commands pass positive controls and reject their broken controls.

## Scope

- In. Spec review, optional code interrogation, review growth, spec traceability, useful upstream review rules, and an optional formal-model path.
- Out. Production writes, merges, automatic upstream sync, changes to frozen snapshots, and claims of measured token savings.

## Decisions

| # | Kind | Decision | Rejected | Door | Settled | Record |
|---|---|---|---|---|---|---|
| D1 | goal | S6 produces failure scenarios, observable properties, and verification commands. | Abstract code findings as the plan output | two-way | user R1 | plan |
| D2 | rule | Code interrogate runs only when the user or a profile requests it. | Routine extra review | two-way | user R1 | plan |
| D3 | rule | Keep iteration bounds and report growth from a fixed first-review head. Growth warnings remain advisory. | More reviews on growth alone | two-way | user R1 | plan |
| D4 | decision | Add spec-drift for explicit criterion and control links. Permit shared and regression controls with reasons. | Semantic coverage claims from links | two-way | user R1 | plan |
| D5 | decision | Adopt useful upstream review changes by hand. Add an optional formal-model path for state and concurrency risks. | Automatic upstream sync | two-way | user R2 | plan |
| D6 | tech | Read criterion and control markers independently of JSON links. Keep runner evidence separate. | An inventory that can hide a source criterion | two-way | evidence | agent:spec_contract_sketch |

## Sessions

### S1 Review work produces checks and testable properties

State. now
Depends on. None.
Branch. feat/spec-review-proof-public
Exit.
- Given a valid spec matrix, when spec-drift runs, then all declared criteria and controls have valid links.
- Given missing or stale links, when spec-drift runs, then it exits with a failure.
- Given fixed review commits, when review-growth runs, then it reports growth without changing the repository.
- Given the planning and review skills, when a maintainer follows them, then optional reviews and formal checks have explicit limits.
Proof. `bun run check`
Baseline. 0 of 2 new CLI commands exist on trunk.

| # | Step | Wave | Lane | Files | Covers | Exit | Proof | Checkpoint |
|---|---|---|---|---|---|---|---|---|
| 1 | Add and verify the review proof workflow | W1 | integrator | src/astack/, tests/, marketplace/plugins/astack/, templates/, docs/, examples/, README.md, dist/, rules/ | D1, D2, D3, D4, D5, D6 | CLI controls, skill contracts, and all install gates pass | `bun run check` | report |

## How each step runs

The CLI tests use temporary repositories and real files.
The integrator owns shared registries, docs, and generated files.
Each code delegate owns disjoint command and test files.
The PR records failing checks before passing checks.

## Proof

- `bun run check:drift` passes before the first rebuild.
- `bun run check` passes with the new CLI and install builds.
- A formal-model example passes its check and rejects a planted invariant failure.
- [criterion:SD-1] A removed matrix row leaves its source criterion uncovered.
- [criterion:SD-2] Renamed and duplicate control markers fail the trace check.
- [criterion:SD-3] An orphan control needs an explicit shared or regression reason.
- [criterion:SD-4] Traversal paths and escaping symlinks cannot read files outside the repo.
- [criterion:SD-5] A skipped test marker never establishes execution or assertion coverage.
- [criterion:RG-1] Growth at the threshold passes without a warning, and one line above it warns with exit 0.
- [criterion:RG-2] Binary files and unusual paths retain explicit and correct counts.
- [criterion:RG-3] An invalid or unrelated baseline cannot produce a zero-growth pass.
- [criterion:WF-1] Resumes and new runs preserve the fixed first-review record.
- [criterion:CL-1] Passing and failing checks preserve repository files, refs, and the index.
- [criterion:FM-1] A bounded model pass and its failing control remain separate from implementation proof.

## Unresolved questions

None.
