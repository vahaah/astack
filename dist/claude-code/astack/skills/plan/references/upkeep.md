# Long-term upkeep

This page covers resume, the session boundary, milestone exit, diverge, and pause and close.

## Resume

The plan, trail, tracker and git hold state, never a transcript. Never ask a settled question again.

1. Run `astack check-plan <file>` and read `delegate`, `checkpoints` and `owner-gates` (`delegate: on` keeps the grant).
2. Run `astack session resume <plan>` when a session record exists and follow its prompt.
3. Send one `haiku` subagent to read plan tickets, issues closed since `reviewed`, comments citing the plan and open programme decisions.
4. When `home` is `linear` or `github`, read the tracker copy as the plan.
5. Read the trail with `astack plan trail <slug>` and log the `start` row (unattended resume stops here).
6. Read `git log --since=<reviewed>` on the plan and the `now` session Files.
7. After `git fetch`, take the first branch that applies:
   - The `now` PR merged, and a next session branch exists. Continue that branch, with no second boundary.
   - Default rows exist. Hold a ratification round.
   - The PR of the `now` session merged. Run the session boundary.
   - A divergence trigger fired. Run Diverge.
   - A programme has an open decision. Settle the first one.
   - Else give 5 bullets or fewer, name the next step and start command, and stop.

Update `reviewed` to today when a resume edits the plan.

## Session boundary

Run it once when the PR of the `now` session merged. Skip it after the last session.

1. Run the session proof on the real artifact and log a `boundary` trail row.
2. Compare what merged with the steps and Exit. Read `astack:how` by path if the shape moved.
3. Collapse the session to `State. done` and `Ticket.`. Graduate durable D rows to ADRs (`astack:write-docs`) or delete rows now held by tests or types.
4. Hold one round (at most 7 questions) on moved premises, fired risks, concrete fog and the next execution grant.
5. Promote `next` to `now`, run S5 for the new `next`, update `reviewed`, and run `astack check-plan --base <last plan commit> <file>`.
6. Commit edits first on the next session branch with the plan in proof scope. Push with no PR if the grant declined. Send mechanical lessons to lint and judgment lessons to repo rules.

Boundary moves (first yes wins, at a phase boundary only):
- Continue when this context is primary source or smart zone remains.
- `/clear` when prior exploration is disposable.
- `astack session handoff` only to switch harness, change repo, hand to a peer or fork a side task.
- Subagent when the next task runs AFK with tight scope.
- `/compact <next phase focus>` otherwise.

## Milestone exit

Run when every session of the `now` milestone merged.

1. Freeze merges, run all gates on a fresh stack, and walk each journey as a real persona.
2. Show the demo on the real system with the milestone Proof command.
3. Post one tracker health update (Linear project update or GitHub map comment).
4. Set `State. exited`, promote the next milestone, and commit on the next session branch. Push with no PR and hold one re-grill round.

## Diverge

Triggers:
- A gate or ticket fails twice, or proof moves away from Exit twice.
- A rejected option becomes necessary, or unapproved follow-up tickets appear.
- A premise falsifier fires, or a worker leaves the sketch.

1. Before a third attempt, write the shared premise and read `astack:principles references/attack-the-premise.md` by path for its census.
2. Edit `delegated`, `evidence` or `default` rows in place, and log a `diverge` row.
3. Owner calls: re-grill a changed subtree (`Superseded by` and superseding ADR), or replace the plan with `supersedes:` and delete the old file in the same PR.

## Pause and close

"pause" is a hard stop. Commit `wip:` on the current or next session branch and push with no PR. Run `astack session handoff <plan>`, print its resume prompt, and stop. Set `status: paused` only past one session.

The last session PR carries the close. Compare planned and merged sessions, count superseded rows and fired risks. Send each lesson to its home, and delete the plan. Ask the user to run `/astack:reflect`.
