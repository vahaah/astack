# Sessions

A session is one PR and one integrator run. Its steps are commits.

## Start

```sh
astack session start <plan> [<session>] [--prefix <name>] [--ultracode]
```

- Picks `now` (give the brief in a programme), prints the branch, waves, cadence, grant, owner gates and tracker writes, and saves the record in `<git common dir>/astack/plans/<slug>/session-<handle>.json`.
- Run tracker writes through Linear MCP or `gh`. Standard moves the ticket to In Progress and assigns it. Programme also posts a claim comment.
- Before a fan-out, record `git status --porcelain` and `git stash list`. Create the worktree from the default branch and never work on the default branch.

## Run each wave

1. Read the wave steps from the steps table.
2. Give each step worker one step, its Files, Exit and covered D rows. Forbid edits outside Files and copy "Commands in a worktree" from `astack skill-path astack:mode references/subagents.md`.
3. Run workers in parallel (Workflow tool with "ultracode", else worktree background agents). Keep integrator and judgment on the strongest model.
4. Land step commits in plan order on the session branch, run scoped gates after each commit, and resolve conflicts.
5. Run migrations, database tests and `integrator` lane steps in the main thread. Keep one editor per hot-file region in a wave.

## Protocol of one step

1. Write a step plan of 10 lines or fewer (post under `report`, wait under `approve`).
2. Write the failing test first, build the step, and run scoped format, lint, typecheck and tests.
3. Run one focused review of correctness, security, UX and test gaps. Reproduce blocking candidates before fixing, recheck confirmed fixes, stay inside the profile iteration cap, and never repeat a clean review.
4. Prove key assertions by restoring the guarded defect and verifying the test fails.
5. Commit with a subject carrying the handle, such as `S1 step 3 stream rows`.

## Checkpoints

```sh
astack session checkpoint <plan> [<session>] --summary <file|-> [--steps 3,4 | --wave W2] [--gates "<counts>"] [--proof <log>] [--screenshot <file>] [--pr <n>]
```

- `--summary` takes 10 lines or fewer. `--proof` embeds the last 20 lines of the red-green-red log, never its path.
- Default cadence is per step for 8 steps or fewer and per wave above 8. Chat gets 6 lines or fewer.
- First checkpoint opens a draft PR (`Part of <keys>` on line 1 when tickets exist) and posts the package there. Later checkpoints post on that PR only (never a second PR or issue comment).
- Push before posting.
  Run `astack check pr-head` before you act on a PR, with `--pr <n>` for a named PR. Go on only after exit 0 with an `ok:` last line or exit 3 with a `no_pr:` last line.
  A failure of `gh pr view` is an error, not a missing PR. Print it, and stop.
  Post only on a PR whose `headRefName` in `gh pr view <n> --json headRefName` is the session branch.
- `report` continues at once. `approve ui`, `approve one-way`, or `checkpoints: approve` waits for the owner.
- Compare work against covered D rows and stop if a step breaks a row. Offer `checkpoints: report` after two bare "go" replies.

## Hand-off and resume

```sh
astack session handoff <plan> [<session>]
astack session resume <plan> [<session>] [--tracker <file|->]
```

- The hand-off comment has 4 lines. They give the branch and the PR, the steps done, the next step and the resume command, with no question count.
- Post on the PR, and in the standard tier on the existing ticket too.
- On another clone, check out the branch and pass `gh pr view <branch> --json number,body,comments` via `--tracker` so resume reads commits and checkpoints.
- For "pause", follow Pause and close in `upkeep.md`.

## Finish

1. Run the whole-work proof from `## Proof` on the session branch.
2. Move durable facts to ADRs or tests.
3. Mark the PR ready. The merge needs the grant of the profile or of this turn.
4. After each merge except the last, run `/astack-plan <slug>` once for the session boundary in `upkeep.md`.
