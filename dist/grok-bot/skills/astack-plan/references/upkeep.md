# Long-term upkeep

At S0, `/astack-plan` picks a mode from its input. This page covers resume, the session boundary, the milestone exit, diverge, and pause and close.

## Resume

The plan, the trail, the tracker and git hold the state.
A transcript never does.
Never ask a settled question again.

1. Run `astack check-plan <file>`. Read the frontmatter keys `delegate`, `checkpoints` and `owner-gates`. `delegate: on` keeps the grant of the last session.
2. Run `astack session resume <plan>` when a session record exists. Follow the prompt it prints.
3. Send one `haiku` subagent to read the tracker. It reads the tickets of the plan, the issues closed since `reviewed`, and the comments that cite the plan. In a programme it also reads the open decision issues.
4. For an exported plan, run `astack plan drift <plan>` with that tracker JSON.
5. Read the trail since the last `start` row with `astack plan trail <slug>`. Then log the `start` row of this run. An unattended resume stops here.
6. Read `git log --since=<reviewed>` on the plan and on the Files of the `now` session.
7. Take the first branch that applies:
   - Default rows exist. Hold a ratification round.
   - The PR of the `now` session merged. Run the session boundary.
   - A divergence trigger fired. Run Diverge.
   - A programme has an open decision. Settle the first one.
   - Else give 5 bullets or fewer, name the next step and its start command, and stop.

Set `reviewed` to today when a resume changes the plan.

## Session boundary

Run it when the PR of the `now` session merged.

1. Run the whole-work proof of the session on the real artifact. Log a `boundary` trail row.
2. Compare what merged with the steps and with the Exit.
   When the shape moved, read `astack-how` by path.
   Follow it over what merged.
3. Collapse the session to `State. done` and its `Ticket.`.
   Check each decision row that constrains only merged code against the three ADR tests of `astack-write-docs`.
   Move a row that passes to an ADR.
   Otherwise delete it, because a test or a type now holds it.
4. Hold one round of 7 questions or fewer. Ask about the premises whose ground moved and the risks whose trigger fired. Also ask the fog that is now a question, and the grant for the next session.
5. Promote the `next` session of the lane to `now`, and run S5 for the new `next`.
6. Set `reviewed`, run `astack check-plan --base <last plan commit> <file>`, and commit under the one-writer rule.
7. Send each mechanical lesson to a checker rule or a repo lint. Send each judgment lesson to one line in the rules of the repo.

A boundary is the only place to clear, hand off or compact. Pick the move with `references/phase-boundaries.md`.

## Milestone exit

Run it when each session of the `now` milestone merged.

1. Freeze the merges. Run all gates on a fresh stack.
2. Walk each journey as a real persona, never as a superuser.
3. Show the demo on the real system with the Proof command of the milestone.
4. For an exported plan, run `astack plan drift`.
5. Post one tracker update with its health. That is a project update in Linear, or a comment on the map issue in GitHub.
6. Collapse the milestone to `State. exited`. Promote the next milestone.
7. Hold one re-grill round of 7 questions or fewer.

## Diverge

Six countable triggers start a divergence review:

- One gate fails twice, or one ticket opens again twice.
- The proof moves away from the Exit across two runs.
- A rejected option becomes necessary.
- A session gains a follow-up ticket, or the plan files more tickets than the owner approved.
- The observation that falsifies a premise happens.
- A step worker leaves the sketch, as Phase D of `astack-architect` describes.

Answer with the smallest change that holds:

1. Before a third attempt, write down the premise that the failed attempts share.
   Run `astack skill-path astack:principles references/attack-the-premise.md`.
   Read the path it prints.
   Run its census script on that premise.
2. Fix the words of a `delegated`, `evidence` or `default` row in place. Supersede a `user` row instead.
3. When a decision changes, grill that subtree only.
   Add a new row.
   Mark the old one `Superseded by`.
   Write a superseding ADR when the old row cited one.
4. A changed destination is new work.
   Write a plan with `supersedes:`.
   Delete the old file in the same PR.

Take answers 1 and 2 on your own.
Log each one as a `diverge` row.
Answers 3 and 4 are owner calls.
New scope becomes a session amendment or a draft.
Never add it quietly to an Exit.

## Pause and close

"pause" is a hard stop. Make a `wip:` commit and run `astack session handoff <plan>`. Give the resume prompt it prints, and stop. Set `status: paused` only when the owner stops the work for longer than a session.

At close, compare the planned sessions with the merged ones. Count the superseded rows and the risks that fired. Send each lesson to its home. Ask the user to run `/astack-retro` and `/astack-reflect`. The closing PR deletes the plan.
