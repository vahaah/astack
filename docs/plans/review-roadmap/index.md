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
The programme has 38 blocks in 8 milestones, and each block is one PR.

## Context

- The upstream review found 66 confirmed or partial defects. Blocks B01 to B17 hold them, and handles such as C1a are its candidate ids.
- The refocus research read astack, pstack, the local history and the external theory with 10 lenses and 18 verifiers. Blocks B18 to B36 hold its result.
- B37 holds the findings of the security review after B04. B38 holds the session repo rule, which B04 left as its second session.
- astack ships 61 skills with 150,701 words. 18 skills, `astack orch` and the migration module show zero use in 30 days.
- `bun run check` took 200.7 s and ran `check:proof` twice. After B19 it takes less than 43 s.
- No check compares the effects and laws of the proof contract with the code. TLC reads only the model files, so a code mutation cannot fail TLC.
- CONTEXT.md holds glossary terms, but it names no bounded context.
- ADRs 0011 to 0019 belong to index blocks. B01 takes ADR 0011, B05 takes 0014, B13 takes 0020, B03 takes 0021 and B09 takes 0022. B20 takes 0023, B14 takes 0024 and B15 takes 0025. B25 takes 0026, and B24 takes 0027.

## Goal

Goal. astack keeps only the parts with measured use. Each code change names its side effects as typed arrows, and a check compares them with the code.
Decision. Which parts of astack stay, and in which order do the 38 blocks merge, so that each later PR costs less?
Done when. The budget gate reports at most 98,100 skill words. A plan with a domain block passes check-plan, the tsc witness and `astack check effects`. Today astack has 131,412 skill words and none of these checks.

## Scope

- In. The candidates of the review and the verified cut list of the refocus research, as the block lines name them.
- In. ADRs 0011 to 0019, the word budget gate, the proof ladder, the domain and effects record and the law checks.
- Out. The 10 deferred upstream commits, and an Effect-TS runtime in astack itself.
- Out. The product repo updates after B04, B07, B24 and B28. Each is one PR in that repo, with the merge grant of that repo.
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
| D7 | | Graduated to ADR 0024 D1 | | | | |
| D8 | decision | Duplicate playbooks go, the long AGENTS.md bullet moves to a runbook, and size caps only go down | Caps only | two-way | user R1 | plan |
| D9 | decision | The CLI gets `astack update`, dry run by default, and it never writes Codex trust | Keep the README steps | two-way | user R1 | plan |
| D10 | | Superseded by D15 | | | | |
| D11 | decision | The writing hooks keep the 20 and 25 word limits, count a number and its unit as one word and fix astack's own templates. B11 softens a rule only after one week of B09 telemetry | Soften the hooks now | two-way | user R2 | plan |
| D12 | decision | Attended detection stays as ADR 0010 D4 says. The owner files the host request for `source` set to `user`, and B04 owns the astack side. The ready report names each deploy job. A broad discard passes only in a repo that this session made | Infer the source from text. An attended override | two-way | user R2 | ADR 0010 D4 |
| D13 | | Graduated to ADR 0021 D4 | | | | |
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

State. exited
Demo. A harness brief, a working-tree profile edit and an MCP merge tool each fail to merge. `bun run check` takes less than 60 s.

### M3 Text takes the pstack shape

State. now
Demo. The budget gate reports at most 120,000 skill words.
Proof. `bun run budget && bun run validate && bun test tests/hardening-consistency.test.ts`
Depends on. M1.
Blocks.
- B14 Orchestrate keeps supervision rules and a catch-up route (review `G4`, `H7`, `G3`). Lane. e. Brief. done.
- B15 Rule text fixes (review `D7`, `D8`, `H8`, `H5`, `C4`, `J6`). Lane. e. Brief. done.
- B16 Duplicate playbooks go, and the docs match the tree (review `H10`, `H4`, `H6`, `H9`). Lane. e. Depends on. B14, B15. Brief. B16.md.
- B21 Wrapper skills fold into their homes. Lane. e. Brief. done.
- B22 Programme charting moves into the plan skill. Lane. e. Depends on. B21. Brief. done.
- B23 Thinking skills take the pstack size (review `H3`). Lane. e. Brief. B23.md.
- B24 The repo hardening stub needs the plugin. Lane. e. Brief. B24.md.
- B25 One lexer reads TypeScript and JavaScript comments. Lane. c. Brief. B25.md.

### M4 Proof follows risk, and models meet the code

State. next
Demo. A docs-only diff starts no java process. A code mutation that drops the authority check fails the conformance test.
Proof. `bun test tests/astack/proof-ladder.test.ts tests/astack/change-proof-manifest.test.ts tests/astack/session-guards-model.test.ts tests/astack/guards.test.ts tests/property && bun run check:proof`
Depends on. M1.
Blocks.
- B26 `Result` gets `map`, `andThen` and `all`, with property tests for its laws. Lane. g. Brief. done.
- B06 The risk ladder and a model registry select models by path (review `A3`, `A7`). Lane. b. Brief. done.
- B07 Each change carries its own proof manifest (review `A2`). Lane. b. Depends on. B06. Brief. B07.md.
- B38 A broad discard passes in a repo that this session made (review `E1`). Lane. a. Brief. B38.md.
- B27 A conformance test drives the real guards from the SessionGuards model. Lane. a. Depends on. B38, B06. Brief. B27.md.

### M5 One domain and effects record, checked against code

State. later
Demo. check-plan refuses a law with no check. The tsc witness fails on a wrong step type. `astack check effects` reports a pure module that writes files.
Depends on. M4.
Blocks.
- B28 The plan `domain` block, the CONTEXT.md contexts card, the parser and the tsc witness. The witness replaces the typed witness mention check, and the laws give the R2 and R3 rungs. Lane. g. Depends on. B07, B26. Brief. stub.
- B29 `astack check effects` compares capabilities with imports, as advice, and the grant monoid gets its control when grant.ts splits. Lane. g. Depends on. B28. Brief. B29.md.
- B35 Hook handlers reach files, git and the profile through ports. Lane. a. Depends on. B08, B10, B29. Brief. stub.
- B36 `astack check effects` fails after its advice window. Lane. g. Depends on. B29, B35. Brief. stub.
- B30 One ADR template with a domain part and an effects part, and `astack check adr` on the reader of src/astack/adr.ts. Lane. e. Depends on. B07. Brief. B30.md.

### M6 Hooks deny less, and each PR has one review budget

State. later
Demo. A denied chained command says that nothing ran. A PR with a clean head gets a delta review.
Depends on. M2.
Blocks.
- B08 Hooks read the body that the same command writes (review `B3`, `B2`, `K8`, `K6`, `K3`, `K2`, `K7`). Lane. c. Brief. stub.
- B10 Public issue and PR text passes a hashed deny list (review `K5`, `K4`). Lane. a. Brief. stub.
- B11 The STE hooks and the comment advice soften where telemetry shows false denies (review `B5`, `B6`, `B4`, `K1`). Lane. c. Brief. stub.
- B12 One review record and a delta review (review `D3`, `D1`, `D2`, `D6`, `D4`). Lane. e. Depends on. B07, B24. Brief. stub.
- B37 The shell reader and the destructive guard close the stdin, fd and environment config forms. Lane. a. Brief. B37.md.

### M7 A pstack-shaped router and short hot-path text

State. later
Demo. The delegate read set has at most 2,000 words, and the budget gate reports at most 98,100 skill words.
Depends on. M3, M5.
Blocks.
- B31 The mode skill becomes a router of about 20,000 words, and each delegate reads a worker card of at most 300 words. Lane. e. Depends on. B14, B15, B16. Brief. stub.
- B32 The coding rules get short, and the types skill holds the law rules. Lane. e. Depends on. B28. Brief. stub.
- B33 The plan skill centers on the domain record in about 8,000 words. It cuts `plan export` and its `kind:programme` label, and the hand-off comment drops its question count. Lane. e. Depends on. B22, B28. Brief. stub.
- B34 The tstack entry points fold on zero use only. Lane. e. Depends on. B31. Brief. stub.

### M8 One command updates astack

State. later
Demo. A dry run of `astack update` prints each step, and a real run ends with a clean `astack doctor`.
Depends on. M2.
Blocks.
- B17 The CLI gets `astack update` (review `J1`). Lane. d. Brief. stub.

## Not yet specified

- Which STE rules B11 softens. B11 draws and labels a sample from the B09 event log, as ADR 0022 says.
- How B07 finds a manifest with no `--base`, and whether B07 also moves the four proof sections of ADR 0015.
- How the B28 witness reads generic steps, and whether a 15-line block fits real plans.
- Which block corrects the launcher sentence of the engine and the stub fallback. Both say that the launcher exits 0 with no runtime, but it exits 1. ADR 0025 names this fix.
- Which block owns the R5 kernel rung of D16. Which block cuts the `model:` law witness kind of ADR 0017.
- Which block makes the `astack:<name>` validate check read docs/ and README.md. Which block makes the dist allow check fail on a stale name in a brace list.
- The six findings of B37. The shell reader reads a redirect fd by number, the fd of a heredoc and an unknown `$` form. The destructive guard reads git config from the environment, the gate record folder and the `core.hooksPath` target.

## Premises

- The host sends no `source` field for a workflow brief. Falsifier. A captured workflow brief with `source` set to `user`.
- No product repo or companion profile names a skill that B18, B21 or B22 cut. Falsifier. An apply dry run that reports a cut skill name.
- 63 of 81 product plan files name a code path. Falsifier. A count below half at B28.
- The hooks of the owner write events with a state folder, and the transcript holds the input of each hook call. Falsifier. No `events.jsonl` one day after install, or a logged deny with no tool input.
- No product repo ADR has a decision heading with no title. Falsifier. A check-plan run in a product repo that loses an ADR cite.
- No test file writes a path that another test file reads. Falsifier. A test that fails only in the parallel run.

## Risks

- Open PRs conflict in `.astack/proof.json` until B07 lands. Merge B02 first, then merge main into each other PR.
- check effects can report false findings. B29 gives advice for 7 days before B36 makes it fail.
- The astack `main` has no branch protection and no ruleset, so a session can push a profile edit to it. Only the owner can turn protection on.
- The owner owes the four paid seat probes of B15, SL-CODEX-1, SL-CODEX-2, SEAT-PLAN and SEAT-CODEX. Until they run, the sol-loop seat rule is not proved on Codex.
- A CI runner with 4 vCPUs holds 4 test workers and 3 TLC heaps of 512 MB. A slow runner can push a test past 5 s. The answer is a diverge round, not a timeout raise.
- `recordDenies` rewrites `ledger.json` with no lock, so a parallel hook can lose a deny count. B11 owns the fix.

## Unresolved questions

None.
