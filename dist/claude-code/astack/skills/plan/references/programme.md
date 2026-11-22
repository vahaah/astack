# Programme tier

A programme is a destination that needs more than one milestone.
It has an index and one brief for each block.
Write a brief at most two sessions before its first session starts.
Keep the decisions in the index, not in a map issue.

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
- Over a `template.md` cap, move detail into the briefs.

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
8. Start one background subagent with the S1 research brief of `stages.md` for each research question. Each one pushes a `research/<slug>-<topic>` branch and opens no PR.
9. Stop. Charting settles no decision by hand.

## The map

A map is one tracker issue with the label `wayfinder:map`.
Its body uses the Map template of `astack:write-ticket`, and its children are decision issues.
The tracker doc of the repo gives each command.

| Label | Who answers | Work |
|---|---|---|
| `wayfinder:grilling` | A person. This is the default | `astack:grilling` and `astack:domain-modeling` |
| `wayfinder:prototype` | A person | The prototype playbook of `astack:mode` |
| `wayfinder:research` | An agent alone | The S1 research brief of `stages.md` |
| `wayfinder:task` | An agent alone, or a person with a checklist | The manual work that a decision needs first, such as an account |

Never answer for a person.

- Name each map and issue by its title as a link, also under Decisions so far.
- Add the dependencies after the real issue numbers exist. Never write a placeholder such as `#<n>`, because it can link another issue.
- A claim is an assignee. Assign the issue before any work, so that a parallel session skips it.
- The frontier holds each open child with no assignee and no open blocker.
- Do not cut fog into guessed issues. When an answer makes it precise, file its issue.
- Write work past the destination under Scope with its reason. It never becomes an issue of this map.
- Close an issue that is out of scope, with no line under Decisions so far.

## Work through a map

Use this loop for a `wayfinder:map` issue that no plan holds.
When its Notes name a plan, run `/astack:plan <slug>` instead.

1. Read the map body, but not each child.
2. Take the issue that the owner names, or the first issue of the frontier. Claim it.
3. Do the work that its label names.
4. Post the answer as a comment. Close the issue. Add one line to Decisions so far.
5. File each issue that the answer makes precise. Remove its fog line.

Take one decision issue in each session. Research issues are the exception.

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

## Close

A programme closes when its last milestone exits. The last session PR deletes `<plan dir>/<slug>/`. Keep the ADRs and the glossary. Mark the tracker container complete.
