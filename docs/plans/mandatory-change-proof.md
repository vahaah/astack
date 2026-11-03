---
plan: mandatory-change-proof
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

# Every change carries checked domain proof

One ChangeProof links domain meaning, category claims, decisions, models, and implementation controls.
The gate runs TLC on current inputs and a named negative control.
Internal briefs and handoffs use the same contract.
PR 13 carries the whole change.

## Goal

Goal. Every astack change workflow requires current domain and formal proof before delivery.
Decision. Which composition makes the requested proof duties enforceable without false claims about reasoning or code correctness?
Done when. The proof CLI passes its real positive control and rejects missing, invalid, stale, or wrong evidence.

## Scope

- In. Research, domain vocabulary, ADRs, proof admission, pinned TLC execution, internal notation, required workflow gates, and migration guidance.
- Out. Private model reasoning, remote branch-rule changes, product repo writes, merges, and automatic acceptance of stored receipts.

## Decisions

| # | Kind | Decision | Rejected | Door | Settled | Record |
|---|---|---|---|---|---|---|
| D1 | goal | Every change, including docs and configuration, requires TLA+ evidence. | Optional formal models | two-way | user R1 | ADR 0005 D1 |
| D2 | rule | Internal briefs and handoffs require category notation and abstraction design. | Private reasoning guarantees | two-way | user R2 | ADR 0006 D1 |
| D3 | rule | DDD terms, aggregate ownership, invariants, and effective ADRs define the contract. | Generic layers without domain ownership | two-way | user R3 | ADR 0005 D2 |
| D4 | decision | A standalone required checker owns proof admission. | A hook or optional profile flag as the only gate | two-way | evidence | reports/Formal domain proof composition.md |
| D5 | rule | Fresh TLC execution, a named negative control, and current input binding are required. | Saved pass receipts and unrelated examples | two-way | evidence | ADR 0005 D3 |
| D6 | rule | Migration retains CI-pin stops, frozen profiles, ledgers, review caps, and growth baselines. | A silent bypass or reset | two-way | evidence | ADR 0005 D4 |
| D7 | decision | Extend PR 13 and preserve the existing review controls. | A separate PR or more review rounds on unchanged work | two-way | user R4 | plan |

## Sessions

### S1 ChangeProof gates every delivery path

State. now
Depends on. None.
Branch. feat/spec-review-proof-public
Exit.
- Given a valid contract, when the proof command runs, then fresh positive and negative TLC controls pass.
- Given absent, invalid, stale, or unrelated evidence, when the command runs, then it exits with failure.
- Given internal briefs and handoffs, when a change workflow runs, then its domain and composition contracts are explicit.
- Given an existing repo, when it adopts the policy, then required gates and review history retain their authority.
Proof. `bun run check`
Baseline. 0 of 1 proof commands exist on the starting head.

| # | Step | Wave | Lane | Files | Covers | Exit | Proof | Checkpoint |
|---|---|---|---|---|---|---|---|---|
| 1 | Build and verify mandatory change proof | W1 | integrator | src/astack/, tests/, scripts/, marketplace/plugins/astack/, templates/, rules/, docs/, reports/, research_notes/, .astack/, formal/, CONTEXT.md, README.md, package.json, .github/workflows/, dist/ | D1, D2, D3, D4, D5, D6, D7 | Real controls and all repository gates pass | `bun run check` | report |

## How each step runs

The code owner writes the proof domain, runner, CLI, and behavior tests.
The integrator owns the self-model, ADRs, glossary, workflow text, and generated files.
The CLI seam uses real files, Git state, Java, and the pinned TLC jar.
Parser-only fixtures never replace a fresh model run.

## Proof

- `bun run check:drift` passes before the first rebuild.
- A positive model passes, its named mutation fails, and the unchanged model passes again.
- Missing contracts, incompatible composition, invalid decisions, bad tools, stale inputs, and wrong violations fail.
- `bun run check` passes with the required proof gate.

## Unresolved questions

None.
