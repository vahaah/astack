---
plan: review-roadmap
tier: programme
status: draft
home: repo
tracker: none
delegate: off
checkpoints: report
owner-gates: [production merge, hosted migration, money, legal, accounts, secrets, client messages, destructive resets]
execute: none
reviewed: 2026-11-21
---

# astack takes merge authority only from the owner, and each PR costs less proof, review and text

The upstream and history review found 66 confirmed or partial defects and cost drivers in astack.
They fall into 17 blocks across guards, change proof, writing hooks, review, the CLI and skill text.
Each block is one PR, so that each fix stays small enough to review.
Later blocks depend on the guard and proof fixes of the first milestone. So the programme has six milestones.

## Context

- The review checked 69 candidates against main after PR #23. Its verifiers confirmed 66 in full or in part, refuted 1 and could not test 2.
- The handles in the block lines, such as C1a or A1, are the candidate ids of that review. Each brief restates its candidates.
- Upstream pstack has 48 new commits since the pin. These blocks take 1 and adapt 12. The review deferred 10 and skipped 25.
- The mode skill holds 29,310 words. The pr-review-hardening skill holds 134,641 bytes. `astack orch` holds 2,333 source lines.
- The proof of each PR goes stale when main moves. `astack check proof` needs the manifest base to equal the base ref.
- Each PR rewrites the one shared `.astack/proof.json`, so two open PRs conflict until B07 lands.

## Goal

Goal. An agent cannot merge without the owner's word or the base branch profile, and an astack PR passes its proof after main moves.
Decision. In which order does the owner merge the 17 blocks, so that the safety fixes land first and each later PR costs less?
Done when. Each of the 10 defects of the review has a regression test on main. The text of the mode skill has fewer than 29,310 words. Today 0 of 10 defects have a test.

The 10 defects are review `C1a`, `C3`, `C2`, `E2` with `E3`, `J2`, `A1`, `A5`, `B2` with `B3`, `K8` and `A7`.

## Scope

- In. The 66 confirmed or partial candidates, the 13 upstream take and adapt commits, and the 4 mattpocock adapt commits, as the block lines list them.
- In. ADR 0011 for merge authority and ADR 0012 for the proof base, the proof tier, the model registry and the per-change manifest.
- Out. The 10 deferred upstream commits, such as the statechart compiler and the Opus-first model routing.
- Out. The edit of the public issues that name a client. The owner does that outside git.
- Out. A hostile agent that calls the merge API with its own tool. B01 question 3 decides that threat model.
- Out. The companion profiles, Linux hosts and the Cursor, grok-bot and agentskills targets, because the review did not cover them.
- Out. The refuted candidate F4, an allowance for a second now session.

## Lanes

- a. Guards. Files. src/astack/hook/, src/astack/pr/, src/astack/ste/session.ts, src/astack/shell.ts, src/astack/git-command.ts.
- b. Proof. Files. src/astack/change-proof/, src/astack/cli/commands/check/proof.ts, src/astack/cli/commands/check/ci-pins.ts, formal/.
- c. Writing hooks. Files. src/astack/ste/, src/astack/headings.ts, src/astack/gh.ts, scripts/lib/ste-own.ts.
- d. CLI. Files. src/astack/doctor.ts, src/astack/cli/commands/doctor.ts, src/astack/codex-trust.ts, scripts/dist/, src/astack/watch-pr/.
- e. Skill text. Files. marketplace/plugins/astack/skills/, rules/, docs/, README.md, AGENTS.md.
- f. Plan tools. Files. src/astack/plan/, src/astack/orch/.

## Decisions

| # | Kind | Decision | Rejected | Door | Settled | Record |
|---|---|---|---|---|---|---|
| D1 | goal | The programme fixes the confirmed defects first, then cuts the cost of proof, hooks, review and text, with one PR for each block | One large PR. No change | two-way | user R1 | plan |
| D2 | decision | Change proof accepts a manifest base that is an ancestor of the merge base, and adds a contract-only tier with no TLC, a standing model registry and one manifest for each change. One ADR amends ADR 0005 | One shared manifest. Only the base fix. Only `astack proof rebase` | two-way | user R1 | plan |
| D3 | decision | Each PR has one review record. A head with a clean or approved review gets a delta review. An opt-in converge stop files recurring findings that are not Critical. ci-pins gets a `ci_mixed` mode | Converge stop on by default. Delta runs only. No change | two-way | user R1 | plan |
| D4 | decision | The writing hooks keep the 20 and 25 word limits, count a number and its unit as one word, fix astack's own templates, advise on old findings in a touched legacy sentence and skip `**/prompts/**` | An advice band for 1 to 3 words over the limit. No change | two-way | user R1 | plan |
| D5 | decision | Attended detection stays as ADR 0010 D4 says. The host marks owner prompts with `source` set to `user`. The ready report names each deploy job. A broad discard passes only in a repo that this session made | A host or profile attended override. No change | two-way | user R1 | ADR 0010 D4 |
| D6 | decision | A hook checks issue and PR text for the public repo against a hashed deny list, and a second PR from one session needs a split instruction | The hash hook only. A manual audit only | two-way | user R1 | plan |
| D7 | decision | `astack orch` and its store go away. The Orchestrate playbook keeps supervision rules over the plan, `astack board` and the tracker. A catch-up route lists each item that waits on the owner | Keep orch and fix its PR lookup. No change | two-way | user R1 | plan |
| D8 | decision | The multi-phase-plan playbook goes away, opening-a-pr folds into create-pr, the long AGENTS.md bullet moves to a runbook, and size caps only go down. Model routing and sharpen stay | Caps only. Cut to the upstream size. No change | two-way | user R1 | plan |
| D9 | decision | The bundled CLI gets `astack update`, dry run by default, with backups. It prints the Codex re-trust step and never writes trust | Extend `bun run apply --global`. Keep the README steps | two-way | user R1 | plan |
| D10 | decision | M1 holds the authority fix, the proof base, doctor trust and the shell normaliser, and B02 merges first, because each PR pays a stale proof stop until B02 lands | The review order, with the proof base as the fifth PR | two-way | default | plan |
| D11 | decision | B11 starts after one week of B09 telemetry, because the ledger records no exact-rule denies today | Soften the hooks now from the ledger counts | two-way | default | plan |

## Milestones

### M1 Only the owner grants a merge, and a PR proof survives a move of main

State. now
Demo. A harness brief, a working-tree profile edit and a host MCP merge tool each fail to merge a test PR. An older proof of a PR passes after main moves.
Proof. `bun test tests/astack/merge-guard.test.ts tests/astack/ste.test.ts tests/astack/dispatch.test.ts tests/astack/change-proof-cli.test.ts tests/astack/ci-proof-records.test.ts tests/astack/change-proof-ratification.test.ts tests/astack/doctor.test.ts tests/astack/guards.test.ts && bun run check:proof`
Depends on. None.
Blocks.
- B01 The merge guard takes authority only from a person's prompt and the base branch profile (review `C1a`, `C3`, `C2`). Lane. a. Brief. B01.md.
- B02 A PR proof stays valid when main moves (review `A1`). Lane. b. Brief. B02.md.
- B03 Doctor finds untrusted Codex hooks, drifted review profiles and an unprotected standing base (review `J2`, `J4`, `J5`, `J3`, `D5`, `H1`). Lane. d. Brief. stub.
- B04 One shell normaliser closes the guard bypasses and the `gh api` merge form. A broad discard passes only in a repo of this session (review `E2`, `E3`, `E1`, `C1`). Lane. a. Depends on. B01. Brief. stub.

### M2 A docs-only proof runs no TLC, and TLC errors are readable

State. next
Demo. A docs-only PR passes its proof with no TLC run. Two open PRs each carry their own manifest. A TLC parse error prints its line and column.
Proof. `bun test tests/astack/change-proof.test.ts tests/astack/change-proof-cli.test.ts tests/astack/ci-proof-records.test.ts`
Depends on. M1.
Blocks.
- B05 TLC errors name the line, the invariant and the trace, and the proof text gives a parsed example (review `A5`, `A4`, `A6`, `A8`). Lane. b. Depends on. B02. Brief. stub.
- B06 A contract-only tier and a standing model registry (review `A3`, `A7`). Lane. b. Depends on. B05. Brief. stub.
- B07 Each change carries its own proof manifest (review `A2`). Lane. b. Depends on. B06. Brief. stub.

### M3 Writing hooks deny less and explain each deny

State. later
Demo. A denied chained command says that nothing ran. The shipped templates give 0 STE deny findings. A public issue with a deny-list term gets a deny.
Depends on. M1.
Blocks.
- B08 Hooks read the body that the same command writes, and a deny says which steps did not run (review `B3`, `B2`, `K8`, `K6`, `K3`, `K2`, `K7`). Lane. c. Brief. stub.
- B09 astack's own templates pass STE, and each finding goes to a telemetry log (review `B7`, `B8`, `B1`). Lane. c. Brief. stub.
- B10 Public issue and PR text passes a hashed deny list, and a second PR needs a split instruction (review `K5`, `K4`). Lane. a. Depends on. B04. Brief. stub.
- B11 The STE hooks soften where the telemetry shows false denies (review `B5`, `B6`, `B4`, `K1`). Lane. c. Depends on. B09. Brief. stub.
Fog. The B09 telemetry decides which rules B11 softens.

### M4 One review budget for each PR

State. later
Demo. A PR with a recorded clean head gets a review of only the later commits. A PR that changes CI and product files gets `ci_mixed`, not a stop.
Depends on. M1.
Blocks.
- B12 One review record, a delta review, an opt-in converge stop and `ci_mixed` (review `D3`, `D1`, `D2`, `D6`, `D4`). Lane. e. Depends on. B03, B07. Brief. stub.

### M5 Less text and less ceremony

State. later
Demo. The text of the mode skill has fewer than 29,310 words. `astack orch` is gone. A session boundary opens no plan PR.
Depends on. M1.
Blocks.
- B13 Session boundary edits ride in the next session PR, and the plan tools accept common forms (review `F3`, `F1`, `F2`, `H2`). Lane. f. Brief. stub.
- B14 `astack orch` goes away, and a catch-up route lists each waiting item (review `G1`, `G4`, `H7`, `G3`). Lane. f. Depends on. B13. Brief. stub.
- B15 Rule text fixes from the review and upstream (review `D7`, `D8`, `H3`, `H8`, `H5`, `C4`). Lane. e. Brief. stub.
- B16 Duplicate playbooks go away, and skill size gets caps that only go down (review `H10`, `H4`, `H6`, `H9`). Lane. e. Depends on. B14, B15. Brief. stub.

### M6 One command updates astack

State. later
Demo. A dry run of `astack update` prints each step and the Codex re-trust step, and a real run ends with a clean `astack doctor`.
Depends on. M1.
Blocks.
- B17 The bundled CLI gets `astack update` (review `J1`). Lane. d. Depends on. B03. Brief. stub.

## Not yet specified

- The B09 telemetry decides which STE rules B11 softens. B11 needs a minimum sample and labelled denies for each rule, and B09 must record enough to label.
- The shape of the model registry in B06, and how it reuses a model run. Its brief needs a design run first.
- How B07 finds the manifest of a change when the command has no `--base`.
- Whether Codex fails an explicit `$astack:<name>` mention (review `J6`). A paid Codex run must show it first.
- Where the upstream pstack PRs 986 and 637 fit. B15 and B16 decide it when their briefs exist.

## Premises

- The host sends no `source` field for a workflow brief, so a frame rule closes C1a. Falsifier. A captured prompt payload of a workflow brief with `source` set to `user`.
- On a PR run, the merge base of the checkout and `origin/<base>` is the base tip. Falsifier. A PR run where `git merge-base HEAD origin/main` differs from `origin/main`. Push runs need a base, and B02 adds it.
- Codex binds hook trust to a content hash that changes with each release. Falsifier. Two releases with the same `hooks.json` and the same Codex trust hash.

## Risks

- Open M1 PRs conflict in `.astack/proof.json` until B07 lands. Merge B02 first. Then merge main into each other open PR. Then run its proof again.
- B12 adds keys to the review profile, and apply refuses a profile that lacks a key of `FALLBACK_KEYS`. So B03 ships the profile drift check first, and B12 gives each new key a default or an update path.

## Unresolved questions

1. Ship M1 as the authority fix, the proof base, doctor trust and the shell normaliser, before the TLC diagnostics? Recommended. Yes, because each PR pays a stale proof stop until B02 lands, and the guard bypasses leak the owner gates (principle sequence-verifiable-units). Rejected. The review order, which puts the proof base fifth and costs four more re-proofs. Settles. D10.
2. Will you file the host request that sends `source` set to `user` on each prompt that a person types? Recommended. Yes, you file it, because astack cannot set the host payload and D5 rests on it (principle fix-root-causes). Rejected. An astack attended override, which D5 rejects. Binds. B04. Decide by. M1.
3. Start B11 only after one week of B09 telemetry? Recommended. Yes, because the ledger records no exact-rule denies today, so its counts are too low (principle explain-the-number). Rejected. Soften now from the ledger counts. Settles. D11. Binds. B11. Decide by. M3.
