# Programme tier

A programme spans multiple milestones with an index and one brief per block.
Write each brief at most two sessions ahead, and keep decisions in the index.

## Index and briefs

Start `<plan dir>/<slug>/index.md` from `astack check-plan --template=programme`.
Required sections are Goal, Scope, Decisions, Milestones, Not yet specified and Unresolved questions.

```markdown
## Milestones

### M1 Events land in staging within 10 minutes

State. now
Demo. An analyst sees a test event in staging 10 minutes after a click.
Proof. `bun scripts/event-lag.ts --table staging`
Depends on. None.
Target. 2026-11-20
Blocks.
- B01 Stream events into staging. Lane. a. Brief. B01.md.
- B02 Model the staging table. Lane. b. Depends on. B01. Brief. stub.
```

- One milestone is `now` (`State.` is `now`, `next`, `later` or `exited`).
- Each block bullet reads `B<nn> <outcome>. Lane. <x>. Depends on. <B handles>. Brief. <file|stub|done>.`.
- The index holds no live status. `astack board` derives it from the plan, tracker JSON and git.
- A brief sets `tier: brief`, `programme: <slug>` and `block: B<nn>` with session handles `B<nn>/S<n>`.
- The last session PR of a block moves durable facts to ADRs or tests, deletes the brief and sets `Brief. done`.

## Chart a programme

1. Run S0 and S1, name the destination in round 1, and grill breadth-first across the space.
2. Drop to `standard` (log `tier` trail row) if no fog remains.
3. Write the index, put fog under `## Not yet specified`, and write open decisions with `Recommended.`, `Rejected.`, `Binds.` and `Decide by.`.
4. Sessions build the interim default until an answer changes it.
5. When asked, file the map and each `Binds.` question through `astack:write-ticket` (Map template). Write keys back with `astack plan keys`.
6. Write briefs for blocks starting in the next two sessions, run S1 research briefs for research questions, and stop.

## The map

A map is a `wayfinder:map` tracker issue using the Map template of `astack:write-ticket`, with decision issues as children.

| Label | Who answers | Work |
|---|---|---|
| `wayfinder:grilling` | Person (default) | `astack:grilling` and `astack:domain-modeling` |
| `wayfinder:prototype` | Person | `astack:mode playbooks/prototype.md` |
| `wayfinder:research` | Agent alone | S1 research brief (`stages.md`) |
| `wayfinder:task` | Agent or person checklist | Prerequisite manual work |

Never answer for a person. Assign an issue before work, add dependencies only after real issue numbers exist, and never cut fog into guessed issues.

## Work through a map

For a `wayfinder:map` issue with no plan (otherwise run `/astack:plan <slug>`):

1. Read the map body and claim the named issue or first unblocked frontier issue.
2. Do the work its label names, post the answer, close the issue, and add one line under Decisions so far.
3. File newly concrete issues and clear their fog lines. Take one non-research issue per session.

## Board, milestone exit and close

```sh
astack board <index> [--tracker <file|->] [--wip <n>]
```

- Never commit the board output. Drain open session PRs before launching new sessions.
- Launch startable sessions longest tail first up to WIP (5, or `plan.wip`), and write named briefs next.
- Run `upkeep.md` Milestone exit when every session of `now` merges.
- When the last milestone exits, the last session PR deletes `<plan dir>/<slug>/` and keeps ADRs and the glossary.
