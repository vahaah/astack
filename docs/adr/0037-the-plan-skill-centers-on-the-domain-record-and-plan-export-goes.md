# 0037. The plan skill centers on the domain record, and plan export and drift go

Status: Accepted
Date: 2026-11-23
Ticket: none
Supersedes: none
Amends: 0013 D3

## Context

The plan skill held 14,684 words across 13 files (`SKILL.md` held 2,861 words).
It repeated checker rules, duplicated tier and tracker prose, and documented `astack plan export` and `astack plan drift`.
Stages S3 to S6 did not own the `## Domain and effects` block that ADR 0018 added, and `template.md` omitted that section.
`astack plan export` and `astack plan drift` spanned 1,068 lines across `src/astack/plan/export.ts` and `src/astack/plan/drift.ts`.
They ran 6 and 2 times in 30 days, and planned 110 writes with 7 defect kinds in a dry run.
`astack session handoff` printed `Open. <n> unresolved questions in the plan.`, which hid waiting items behind a count.

## Decisions

### D1. The plan skill centers on the domain record across stages S3 to S6

Each stage from S3 to S6 owns one part of the domain record for code plans.
S3 names the owning context from `CONTEXT.md`.
S4 drafts the `domain` block from `astack check-plan --template=domain`.
S5 links each block step to one `Files` cell `<module>#<name>`.
S6 adds a code-checked `law` for each `inv` and write `cap`.

### D2. Plan prose keeps only rules that no command enforces

Rules enforced by `astack check-plan` or the plan hook become one pointer, because each command prints the fix.
`tiers.md` folds into `SKILL.md`, and `phase-boundaries.md` folds into `upkeep.md` as 5 boundary move lines.
The plan skill drops below 8,000 words across 11 files, with `SKILL.md` at or under 2,000 words.

### D3. Plan export, plan drift and the kind:programme label go

`astack plan export`, `astack plan drift`, `src/astack/plan/export.ts`, `src/astack/plan/drift.ts`, `kind:programme` and helpers with no callers left are deleted.
`PlanSettings` drops `team`, while `src/astack/profile.ts` still accepts `plan.team` until product profiles drop it.
Calling `astack plan export` or `astack plan drift` exits 2 with usage text that names neither command.

### D4. Plan keys stays and programmes file issues through write-ticket

`astack plan keys` stays so an agent writes filed tracker keys back into plan files in one commit.
Programmes file their map issue and `Binds.` decision issues through the Map template of `astack:write-ticket`.
`astack board` and `astack session resume` keep their tracker JSON reader.

### D5. The session hand-off comment drops its question count and keeps 4 lines

`handoff` in `src/astack/plan/session.ts` removes the `Open.` line and prints 4 lines: branch and PR, done steps, next step, and resume command.
A status ask lists every waiting item under ADR 0024 D2 instead of hiding items behind a count.

## Domain and effects

Terms. none

```domain
context Plan
agg  Plan @ src/astack/plan/types.ts: Plan
agg  SessionRecord @ src/astack/plan/session.ts: SessionRecord
inv  PL1 Plan: the plan file holds the structure, and no command syncs a tracker copy with it
inv  HC1 SessionRecord: a hand-off names the done steps, the next step and the resume command, and no count of open questions
step handoff : (Plan, Session, SessionRecord, string) -> SessionOutput
law  L1 PL1 astack plan export and astack plan drift exit 2, and the plan usage names neither   check: prop plan-cut-commands
law  L2 HC1 for each count of open questions and done steps, a hand-off has 4 lines and no question count   check: prop handoff-names-no-count
rung R4
```

## Consequences

- Easier: agents read half as much plan prose and build a checked `domain` block in stages S3 to S6.
- Easier: 1,068 lines of export and drift sync code and tests leave the repository.
- Harder: a plan with a tracker home loses automated drift checks and relies on manual edits.
- Follow-up: drop `plan.team` acceptance from `src/astack/profile.ts` after product profiles migrate.

## Alternatives considered

- Keep the domain record as one paragraph under Run the stages. Rejected because no stage owned drafting, linking or law checks.
- Keep short copies of checker rules in `template.md`. Rejected because copies drift from `check-plan` and inflate skill words.
- Keep `plan export` and `plan drift` as opt-in commands. Rejected because they cost 1,068 lines and 1,171 words for low use.
- Delete `astack plan keys` too. Rejected because filed programme decision issues still need `Ticket.` write-back.
- Print up to 3 open questions in the hand-off comment. Rejected because that repeats Catch up inside a tracker comment.
