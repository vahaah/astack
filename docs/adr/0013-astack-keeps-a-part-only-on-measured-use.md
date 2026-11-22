# 0013. astack keeps a part only on measured use, and a word budget stops skill text from growing

Status: Accepted
Date: 2026-11-22
Ticket: none
Supersedes: none

## Context

astack shipped 61 skills with 150,701 words of skill text, and no gate stopped the growth of that text.
The refocus research counted the use of each skill, agent and command in 30 days of Claude Code and Codex history.
Each count of 0 had a positive control in the same window, such as 1,728 sessions that loaded `astack:coding-rules`.

11 skills, the researcher agent, `astack orch`, the agent-stack migration module, `astack plan move` and `astack plan import` had 0 use.
The names `codex` and `grok-build` of the hook tool acted as an unknown tool, because no client calls them.
The Cursor hook read a string-only problems file that no revision of astack ever wrote.
Each of these parts still cost review time, tests and words that an agent can load.

## Decisions

### D1. A part stays only with measured use or a live dependent

A skill, agent, command or module goes when it has 0 use in 30 days and no live dependent.
A live dependent is code, a route, a test or an accepted ADR that needs the part.
Each count of 0 needs a positive control in the same window and the same history.

Each route that named a cut part points to its successor.
The duplicate-skill map of `scripts/lib/duplicate-skills.ts` names the skill of that route for each cut upstream skill.
When the route sends the work to the owner, the map keeps the cut name, and the report says that astack ships no successor.
The report never calls a cut skill superseded, so it never prints a command that removes the copy of a user.

### D2. A word budget caps each skill and the total

`bun run budget` counts the words of each `*.md` file in each skill tree under `marketplace/plugins/astack/skills/`.
A word is a run of characters with no whitespace, as `wc -w` counts it.
`scripts/lib/budget.json` holds one cap for each skill and one cap for the total.
The gate fails when a skill or the total passes its cap, and when a skill has no cap.
Each failure names the skill or the total.
`bun run check` runs the gate.

A cap above its count passes with a note, so each commit of a cut PR stays green.
The last commit of that PR runs `bun scripts/budget.ts --lower`, so each cap equals its count at the merge.
The lower step never raises a cap, and it drops the cap of a gone skill.

A cap rises only in the PR that moves text into that skill.
That PR must also make the total fall by more than the rise.
The total cap never rises.
The gate cannot see a PR, so the reviewer of the `scripts/lib/budget.json` diff enforces this rule.

#### Formal claim

A pass of the gate means that each skill and the total are at or under their caps.
A fail names a skill or a total over its cap.
The lower step never raises a cap above its start.

```text
PassWithinCaps   == a pass has each count at or under its cap, and the total at or under its cap
FailNamesOverrun == a fail has a count or the total over its cap
CapsNeverRise    == each cap and the total cap stay at or under their start
```

The [model](../../formal/WordBudget.tla) and its [configuration](../../formal/WordBudget.cfg) check these invariants over two skills and counts from 0 to 2.
They cover each order of the edit, check and lower steps.
The model takes the word count of each skill tree as a true observation.

#### Category composition

```text
skillWords   : SkillTrees -> WordCounts   effects: fs-read
budgetReport : WordCounts -> BudgetReport effects: none
lowerBudget  : WordCounts -> Budget       effects: none
```

`skillWords` reads each skill tree once and returns the word count of each skill.
`budgetReport` is pure. It takes the counts and a fixed `Budget`, and returns the problems and the notes.
`lowerBudget` is pure. It takes the counts and a fixed `Budget`, and returns the lowered `Budget`.

The `main` function of `scripts/budget.ts` reads the files, calls the three arrows and prints the result.
The record uses the `artifact` carrier and declares no composite arrow, so no composition, functor or monad law applies.

#### Implementation correspondence

`budgetReport` maps to the `Check` action of the model, and an empty problem list maps to the verdict `pass`.
`lowerBudget` maps to the `Lower` action.
`skillWords` is the observation that the `Edit` action changes.
The notes of `budgetReport` and the cap of a gone skill have no model state, and the unit tests examine them.

D1, D3 and D4 delete parts and repoint text.
They change no guard verdict, so they map to the preservation relation of the session guards.
The validate change of D3 is a script step that the model does not cover.

#### Verification

[The proof matrix](../../.astack/proof-coverage.json) links the word budget, the cut and the validate criteria of [the requirements](../reference/word-budget.md) to their tests.
The negative control removes the check of each skill from `Check`, and it must violate `PassWithinCaps`.
That mutation is the defect of a gate that reads only the total.
The normal test gate runs the tests of the budget, the duplicate map, the validate script and the session guards.

### D3. The first cut set

These parts go in the same PR as this ADR:

- The skills `wait-what`, `wizard`, `blast-radius`, `correct`, `create-verification-skill`, `maintain-verification-skill`, `to-spec`, `to-questionnaire`, `implement`, `implement-spec` and `triage`.
- The researcher agent. The research skill starts a background general-purpose agent with the same brief.
- `astack orch`, its store module and its tests. The store data on the owner's disk stays, because its deletion is an owner gate.
- `scripts/lib/migration.ts`, the generated `docs/migration.md` and the migration part of `apply --global`.
- `astack plan move` and `astack plan import`. `astack plan export`, `drift` and `keys` stay.
- The names `codex` and `grok-build` of the hook tool.
- The legacy Cursor record path, as D4 says.
- Five unused plan types, the unused comment `Verdict` type and the unused `gitText` helper of `scripts/lib/exec.ts`.
- The second run of `claude plugin validate` in `scripts/validate.ts`. `bun run dist` runs it once, and a missing `claude` gives a labelled SKIP.

The cut skills held 9,287 words.
After the cut and the repointed routes, the budget holds 50 skills and 140,953 words, under the plan target of 141,500.

### D4. Cursor no longer delivers old string-only records

ADR 0004 D4 told Cursor to deliver an old string-only record once as an unverified report.
No revision of astack ever wrote that record, so the hook read a file that nothing makes.
The Cursor stop hook no longer reads it.
ADR 0004 D4 holds a dated Amended note that points to this decision.
The other parts of ADR 0004 D4 stay as they are.

## Consequences

- Easier: astack ships only the parts that someone uses or that a live part needs.
- Easier: skill text cannot grow without a cap change that a reviewer sees.
- Harder: each PR that cuts skill text also lowers the caps in `scripts/lib/budget.json`.
- Harder: a person who uses a cut upstream skill keeps a flat copy of it, because astack no longer ships it.
- Follow-up: later blocks fold the wrapper skills and shrink the thinking skills under the same budget.

## Alternatives considered

- Keep each part until a person asks to cut it. Rejected because no person asks, and each part keeps its cost.
- A lint warning for skill size. Rejected because a warning does not stop growth.
- A total cap only. Rejected because one skill can then grow while another shrinks.
- Fail a cap above its count. Rejected because each commit of a cut PR then needs a cap edit.
