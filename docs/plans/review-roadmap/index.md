---
plan: review-roadmap
tier: programme
status: draft
home: repo
tracker: none
delegate: on
checkpoints: report
owner-gates: [production merge, hosted migration, money, legal, accounts, secrets, client messages, destructive resets]
execute: none
reviewed: 2026-11-22
---

# astack takes the pstack shape, and each code change carries one checked domain and effects record

astack keeps only the parts that people use, and it fixes the defects of the upstream review.
Each code change names its bounded context, its side effects and its laws in one record, and checks compare that record with the code.
The programme has 36 blocks in 8 milestones, and each block is one PR.

## Context

- The upstream review found 66 confirmed or partial defects. Blocks B01 to B17 hold them, and handles such as C1a are its candidate ids.
- The refocus research read astack, pstack, the local history and the external theory with 10 lenses and 18 verifiers. Blocks B18 to B36 hold its result.
- astack ships 61 skills with 150,701 words. 18 skills, `astack orch` and the migration module show zero use in 30 days.
- `bun run check` takes 200.7 s, and it runs `check:proof` twice.
- No check compares the effects and laws of the proof contract with the code. TLC reads only the model files, so a code mutation cannot fail TLC.
- CONTEXT.md holds glossary terms, but it names no bounded context.
- ADRs 0011 to 0019 belong to index blocks. B01 takes ADR 0011, B05 takes 0014, B13 takes 0020, B03 takes 0021, B09 takes 0022 and B20 takes 0023.

## Goal

Goal. astack keeps only the parts with measured use. Each code change names its side effects as typed arrows, and a check compares them with the code.
Decision. Which parts of astack stay, and in which order do the 36 blocks merge, so that each later PR costs less?
Done when. The budget gate reports at most 98,100 skill words. A plan with a domain block passes check-plan, the tsc witness and `astack check effects`. Today astack has 150,701 skill words and none of these checks.

## Scope

- In. The candidates of the review and the verified cut list of the refocus research, as the block lines name them.
- In. ADRs 0011 to 0019, the word budget gate, the proof ladder, the domain and effects record and the law checks.
- Out. The 10 deferred upstream commits, and an Effect-TS runtime in astack itself.
- Out. The product repo updates after B07, B22, B24 and B28. Each is one PR in that repo, with the merge grant of that repo.
- Out. The edit of the public issues that name a client, Linux hosts, and the Cursor, grok-bot and agentskills targets.

## Lanes

- a. Guards. Files. src/astack/hook/, src/astack/pr/, src/astack/ste/session.ts, src/astack/shell.ts.
- b. Proof. Files. src/astack/change-proof/, src/astack/cli/commands/check/, formal/.
- c. Writing hooks. Files. src/astack/ste/, src/astack/comments/, scripts/lib/ste-own.ts.
- d. CLI. Files. src/astack/doctor.ts, src/astack/cli/commands/, scripts/dist/, src/astack/watch-pr/.
- e. Skill text. Files. marketplace/plugins/astack/, rules/, docs/, README.md, AGENTS.md.
- f. Plan tools. Files. src/astack/plan/, src/astack/orch/.
- g. Domain record. Files. src/astack/domain/, src/astack/result.ts, CONTEXT.md, tests/property/.
- h. Gates. Files. package.json, scripts/, .github/workflows/, tests/.

## Decisions

| # | Kind | Decision | Rejected | Door | Settled | Record |
|---|---|---|---|---|---|---|
| D1 | | Superseded by D14 | | | | |
| D2 | decision | Change proof accepts an ancestor base, and adds a contract-only tier, a model registry and one manifest for each change | Only the base fix | two-way | user R1 | plan |
| D3 | decision | Each PR has one review record, a delta review after a clean head, an opt-in converge stop and `ci_mixed` | No change | two-way | user R1 | plan |
| D4 | | Superseded by D11 | | | | |
| D5 | | Superseded by D12 | | | | |
| D6 | decision | A hook checks public issue and PR text against a hashed deny list | A manual audit | two-way | user R1 | plan |
| D7 | decision | `astack orch` goes, and the Orchestrate playbook keeps supervision rules and a catch-up route | Keep orch | two-way | user R1 | plan |
| D8 | decision | Duplicate playbooks go, the long AGENTS.md bullet moves to a runbook, and size caps only go down | Caps only | two-way | user R1 | plan |
| D9 | decision | The CLI gets `astack update`, dry run by default, and it never writes Codex trust | Keep the README steps | two-way | user R1 | plan |
| D10 | | Superseded by D15 | | | | |
| D11 | decision | The writing hooks keep the 20 and 25 word limits, count a number and its unit as one word and fix astack's own templates. B11 softens a rule only after one week of B09 telemetry | Soften the hooks now | two-way | user R2 | plan |
| D12 | decision | Attended detection stays as ADR 0010 D4 says. The owner files the host request for `source` set to `user`, and B04 owns the astack side. The ready report names each deploy job. A broad discard passes only in a repo that this session made | Infer the source from text. An attended override | two-way | user R2 | ADR 0010 D4 |
| D13 | decision | Branch protection controls a pushed profile edit, and B03 adds a doctor note for an unprotected base | A push guard | two-way | user R2 | plan |
| D14 | goal | A part stays only with measured use, a live dependent, an accepted ADR or a failed text rule. Each code change carries one domain and effects record whose laws run on code | Add the theory on top of the catalogue | two-way | user R2 | ADR 0013 |
| D15 | decision | B02 merges first, then B18. B01, B03 and B04 start right after B02 merges, because subtraction first shrinks each later diff | B01 to B04 in M1 | two-way | delegated | plan |
| D16 | decision | TLC runs only for model globs and fail-closed globs, because it cannot see a code mutation. Paths and laws give the rung R0 to R5, and a profile can only raise it. ADR 0012 holds the base rule, and ADRs 0015 and 0016 hold the rest | An author-picked rung. Grow ADR 0012 in place | two-way | delegated | ADR 0015 |
| D17 | decision | These go with pointers, because each has 0 use in 30 days: to-spec, to-questionnaire, implement, implement-spec, triage, research, `plan export`, `plan drift` and the watch-pr stack runners. A skill cap rises only while the total falls by more | Keep them as opt-in parts | two-way | delegated | ADR 0013 |
| D18 | decision | The hardening stub holds one install line. The map label stays `wayfinder:map`. An env-form hook skip passes only after `astack gates run` passed at that HEAD. The tstack entry points fold only on zero use | Keep the stub copy. A deny with no path | two-way | delegated | plan |
| D19 | tech | A plan that touches a code path holds one fenced `domain` block with its context, capabilities, Kleisli steps, flows and laws. astack code uses plain TypeScript `Result` with `map`, `andThen` and `all`, and capabilities as parameters | Prose effect lists. An Effect-TS runtime | two-way | delegated | ADR 0018 |

## Milestones

### M1 Subtract: the stale proof stop and the zero-use parts go

State. exited
Demo. An older proof of a PR passes after main moves. The B18 paths are gone, and the budget gate reports at most 141,500 skill words.

### M2 Only the owner grants a merge, and the gate answers in seconds

State. now
Demo. A harness brief, a working-tree profile edit and an MCP merge tool each fail to merge. `bun run check` takes less than 60 s.
Proof. `bun test tests/astack/merge-guard.test.ts tests/astack/dispatch.test.ts tests/astack/doctor.test.ts && bun run check`
Depends on. M1.
Blocks.
- B19 Fast gates run one proof, parallel tests, one CI run for each PR commit and `check:fast`. Lane. h. Brief. B19.md.
- B01 The merge guard takes authority only from a person's prompt and the base branch profile (review `C1a`, `C3`, `C2`). Lane. a. Brief. B01.md.
- B03 Doctor finds untrusted hooks, drifted profiles and an unprotected base (review `J2`, `J4`, `J5`, `J3`, `D5`, `H1`). Lane. d. Brief. B03.md.
- B04 One shell normaliser closes the guard bypasses, and fast-check proves the wrapper law (review `E2`, `E3`, `E1`, `C1`). Lane. a. Depends on. B01. Brief. B04.md.
- B09 Own templates pass STE, and each hook finding goes to a telemetry log (review `B7`, `B8`, `B1`). Lane. c. Brief. B09.md.
- B13 Session boundary edits ride in the next session PR, with one ADR heading reader (review `F3`, `F1`, `F2`, `H2`). Lane. f. Brief. B13.md.
- B20 Heavy test files reuse one git fixture repo. Lane. h. Depends on. B19. Brief. B20.md.
- B05 TLC errors name the line, the invariant and the trace (review `A5`, `A4`, `A6`, `A8`). Lane. b. Brief. B05.md.

### M3 Text takes the pstack shape

State. next
Demo. The budget gate reports at most 120,000 skill words.
Proof. `bun run budget && bun run validate && bun test tests/hardening-consistency.test.ts`
Depends on. M1.
Blocks.
- B14 Orchestrate keeps supervision rules and a catch-up route (review `G4`, `H7`, `G3`). Lane. e. Depends on. B13. Brief. stub.
- B15 Rule text fixes (review `D7`, `D8`, `H8`, `H5`, `C4`, `J6`). Lane. e. Brief. stub.
- B16 Duplicate playbooks go, and the docs match the tree (review `H10`, `H4`, `H6`, `H9`). Lane. e. Depends on. B14, B15. Brief. stub.
- B21 Wrapper skills fold into their homes. Lane. e. Brief. stub.
- B22 Programme charting moves into the plan skill. Lane. e. Depends on. B21. Brief. stub.
- B23 Thinking skills take the pstack size (review `H3`). Lane. e. Brief. stub.
- B24 The repo hardening stub needs the plugin. Lane. e. Depends on. B03. Brief. stub.
- B25 One lexer reads TypeScript and JavaScript comments. Lane. c. Brief. stub.

### M4 Proof follows risk, and models meet the code

State. later
Demo. A docs-only diff starts no java process. A code mutation that drops the authority check fails the conformance test.
Depends on. M1.
Blocks.
- B26 `Result` gets `map`, `andThen` and `all`, with property tests for its laws. Lane. g. Depends on. B04. Brief. stub.
- B06 The risk ladder and a model registry select models by path (review `A3`, `A7`). Lane. b. Depends on. B05. Brief. stub.
- B07 Each change carries its own proof manifest (review `A2`). Lane. b. Depends on. B06. Brief. stub.
- B27 A conformance test drives the real guards from the SessionGuards model. Lane. a. Depends on. B04, B06. Brief. stub.

### M5 One domain and effects record, checked against code

State. later
Demo. check-plan refuses a law with no check. The tsc witness fails on a wrong step type. `astack check effects` reports a pure module that writes files.
Depends on. M4.
Blocks.
- B28 The plan `domain` block, the CONTEXT.md contexts card, the parser and the tsc witness. Lane. g. Depends on. B07, B26. Brief. stub.
- B29 `astack check effects` compares capabilities with imports, as advice. Lane. g. Depends on. B28. Brief. stub.
- B35 Hook handlers reach files, git and the profile through ports. Lane. a. Depends on. B08, B10, B29. Brief. stub.
- B36 `astack check effects` fails after its advice window. Lane. g. Depends on. B29, B35. Brief. stub.
- B30 One ADR template with a domain part and an effects part, and `astack check adr`. Lane. e. Depends on. B07, B13. Brief. stub.

### M6 Hooks deny less, and each PR has one review budget

State. later
Demo. A denied chained command says that nothing ran. A PR with a clean head gets a delta review.
Depends on. M2.
Blocks.
- B08 Hooks read the body that the same command writes (review `B3`, `B2`, `K8`, `K6`, `K3`, `K2`, `K7`). Lane. c. Depends on. B04. Brief. stub.
- B10 Public issue and PR text passes a hashed deny list (review `K5`, `K4`). Lane. a. Depends on. B04. Brief. stub.
- B11 The STE hooks soften where telemetry shows false denies (review `B5`, `B6`, `B4`, `K1`). Lane. c. Depends on. B09. Brief. stub.
- B12 One review record and a delta review (review `D3`, `D1`, `D2`, `D6`, `D4`). Lane. e. Depends on. B03, B07, B24. Brief. stub.

### M7 A pstack-shaped router and short hot-path text

State. later
Demo. The delegate read set has at most 2,000 words, and the budget gate reports at most 98,100 skill words.
Depends on. M3, M5.
Blocks.
- B31 The mode skill becomes a router, and each delegate reads a worker card of at most 300 words. Lane. e. Depends on. B14, B15, B16. Brief. stub.
- B32 The coding rules get short, and the types skill holds the law rules. Lane. e. Depends on. B28. Brief. stub.
- B33 The plan skill centers on the domain record. Lane. e. Depends on. B13, B22, B28. Brief. stub.
- B34 The tstack entry points fold on zero use only. Lane. e. Depends on. B31. Brief. stub.

### M8 One command updates astack

State. later
Demo. A dry run of `astack update` prints each step, and a real run ends with a clean `astack doctor`.
Depends on. M2.
Blocks.
- B17 The CLI gets `astack update` (review `J1`). Lane. d. Depends on. B03. Brief. stub.

## Not yet specified

- Which STE rules B11 softens. B09 must record a sample with labels for each rule.
- How the B06 registry reuses a model run, and how B07 finds a manifest with no `--base`.
- How the B28 witness reads generic steps, and whether a 15-line block fits real plans.

## Premises

- The host sends no `source` field for a workflow brief. Falsifier. A captured workflow brief with `source` set to `user`.
- No product repo or companion profile names a skill that B18 cuts. Falsifier. An apply dry run that reports a cut skill name.
- 63 of 81 product plan files name a code path. Falsifier. A count below half at B28.

## Risks

- Open PRs conflict in `.astack/proof.json` until B07 lands. Merge B02 first, then merge main into each other PR.
- check effects can report false findings. B29 gives advice for 7 days before B36 makes it fail.

## Unresolved questions

None.
