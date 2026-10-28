# Programme tier

A programme is a destination that needs more than one milestone.
It has an index and one brief for each block.
Write a brief at most two sessions before its first session starts.
Read the charting rules of wayfinder through `astack skill-path astack:wayfinder`.
Follow those rules with one change.
Keep the decisions in the index instead of the map issue.

## The index

`<plan dir>/<slug>/index.md` comes from `astack check-plan --template=programme`. Its sections are Context, Goal, Scope, Lanes, Decisions, Milestones, Not yet specified, Premises, Risks, Gates and Unresolved questions. Only Goal, Scope, Decisions, Milestones, Not yet specified and Unresolved questions are required.

```markdown
## Lanes

- a. Ingest. Files. services/ingest/.
- b. Warehouse. Files. warehouse/.

## Milestones

### M1 Events land in staging within 10 minutes

State. now
Demo. An analyst sees a test event in the staging table 10 minutes after a click.
Proof. `bun scripts/event-lag.ts --table staging`
Depends on. None.
Target. 2026-11-20
Blocks.
- B01 Stream events into the staging table. Lane. a. Brief. B01.md.
- B02 Model the staging table. Lane. b. Depends on. B01. Brief. stub.
```

- A milestone is a state that a person can watch. `Demo.` is one sentence, and `Proof.` is one command.
- `State.` is `now`, `next`, `later` or `exited`. One milestone is `now`. A wave is the milestone in progress, so a programme needs no wave unit.
- A `now` milestone needs Demo, Proof and Blocks. A `later` milestone needs Demo and can carry Fog.
- Each block bullet reads `B<nn> <outcome>. Lane. <x>. Depends on. <B handles>. Brief. <file|stub|done>.`. A lane must be under `## Lanes` when that section exists.
- The index holds no status of blocks or sessions. The tracker holds it, and `astack board` shows it.
- The index warns past 250 lines or 15 live D rows, and stops at 16 KB. Move detail into the briefs.

## Briefs

A brief is a standard plan with `tier: brief`, `programme: <slug>` and `block: B<nn>`.
Its sessions use the handles `B<nn>/S<n>`.
A session can depend on a session of another block, such as `B03/S1`.
The brief keeps no session log.
Post the hand-off on the PR and the issue.

The last session of a block moves its durable facts to ADRs or tests. Its PR deletes the brief and sets the block line to `Brief. done`.

## Chart a programme

1. Run S0 and S1 as for a standard plan.
2. Name the destination in a first round. It fixes the scope.
3. Grill breadth-first across the whole space. List the open decisions and the first sessions that can start now.
4. When this finds no fog, drop to the standard tier. Log a `tier` trail row.
5. Write the index. Put the fog under `## Not yet specified`.
6. Write each open decision as an unresolved question with an interim default, in this form:

```text
3. <Question>? Recommended. <Interim default>, because <evidence>. Rejected. <Other answer and its cost>. Binds. B07/S2, B09. Decide by. M2.
```

Sessions build the interim default.
Only a change to that default needs an answer.
On export, each question with `Binds.` becomes a decision issue.
It blocks the units that the question binds.

7. Write the brief of each block that can start in the next two sessions.
8. Start one background `astack-research` subagent for each research question. Each one pushes a `research/<slug>-<topic>` branch and opens no PR.
9. Stop. Charting settles no decision by hand.

## Run the board

```sh
astack board <index> [--tracker <file|->] [--wip <n>]
```

The board is a view that astack derives from the plan, the tracker JSON and git.
Never commit it.

- Drain first. When a PR of a session is open, merge or close it before a new launch.
- The startable frontier holds each session with steps whose dependencies are done and that no question blocks.
- The frontier comes longest tail first, so the session that unlocks the longest chain starts first.
- The WIP cap is 5 sessions, or `plan.wip` in the profile. The board prints a start command for each free slot.
- The board names each block whose brief to write next.
- Merges stay behind the owner gates and the merge grant of the profile.

## Milestone exit

After all sessions of the `now` milestone merge, run the milestone exit of `upkeep.md`.
It runs the gates on a fresh stack, the journeys for each persona and the demo.
It posts one tracker update.
Then collapse the milestone line to `State. exited`.
Hold one re-grill round of 7 questions or fewer.

## Close

A programme closes when its last milestone exits. Delete `<plan dir>/<slug>/` in the closing PR. Keep the ADRs and the glossary. Mark the tracker container complete.
