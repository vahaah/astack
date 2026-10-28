# Sessions

A session is one PR and one integrator run.
Its steps are commits.
Parallel step workers build the steps in worktrees, in waves.
The main thread lands their commits.
This is the usual shape for a ticket and for a go-live push.

## Start

```sh
astack session start <plan> [<session>] [--prefix <name>] [--ultracode]
```

- It picks the `now` session, or the one you name. In a programme, give the brief, not the index.
- It prints the branch `<prefix>/<key>/<slug>`. A `Branch.` line in the plan wins. The prefix comes from `--prefix`, `plan.branchPrefix` in the profile, or the first word of `git config user.name`.
- It prints the waves, the checkpoint cadence, the grant and the owner gates.
- It prints the tracker writes. Run them through the Linear MCP or `gh`. The standard tier moves the existing ticket to In Progress and assigns it. A programme also posts a claim comment on the session issue.
- It saves a record in `<git common dir>/astack/plans/<slug>/session-<handle>.json`. `--ultracode` marks the session as one that runs workflows, so the resume prompt asks for them again.

Before a fan-out, record `git status --porcelain` and `git stash list`.
Make the worktree from the default branch.
Never work on the default branch.

## Run each wave

1. Read the steps of the wave from the steps table.
2. Give each step worker one step, its Files, its Exit and the D rows it covers.
   Tell it to commit on its own step branch.
   Forbid changes outside its Files.
3. Run the workers in parallel.
   With "ultracode", use the Workflow tool.
   Else use background agents with `isolation: "worktree"`.
   Where the profile says so, step workers run on the cheaper model.
   Under that profile rule, the integrator and judgment stay on the strongest model.
4. As the integrator, land the step commits on the session branch in plan order.
   Run the scoped gates after each commit.
   Resolve each conflict.
5. Only the integrator applies migrations and runs database tests, because the local database is shared.
6. A step in the `integrator` lane runs in the main thread, in order.

One editor works on each hot-file region in a wave.
A step only adds to a hot-file region.
When two steps need the same region, put them in different waves.
The checker enforces this rule.

## The protocol of one step

1. Write a step plan of 10 lines or fewer.
   Under `checkpoints: report`, post it.
   Then continue.
   Under `approve`, wait.
2. Build the step. Write the failing test first.
3. Run the scoped gates: format, lint, tests and the type check for the touched packages.
4. Run parallel review lenses, such as correctness, security, UX and test gaps.
   Fix the findings.
   Run the lenses again until a round finds nothing.
5. Prove each key assertion.
   Put back the defect it guards.
   Confirm that the test fails.
   Remove the defect again.
6. Commit with a subject that can carry the plan handle, such as `S1 step 3 stream rows to the response`.

## Checkpoints

```sh
astack session checkpoint <plan> [<session>] --summary <file|-> [--steps 3,4 | --wave W2] [--gates "<counts>"] [--proof <log>] [--screenshot <file>] [--pr <n>]
```

- `--summary` is required. Write 10 lines or fewer about the scope.
- `--proof` takes the red-green-red log file. The package holds the last 20 lines of the log in a code block, never the path.
- With no `--steps` or `--wave`, it takes the next scope. A session with 8 steps or fewer has one checkpoint for each step. A larger session has one for each wave.
- It prints the chat lines and the package. The chat has 6 lines or fewer. They give the scope, the gate counts, the D rows covered, the place of the package, the next step and the mode.
- The package holds these parts:
  - a summary of 10 lines or fewer;
  - the D rows covered and the gate counts;
  - the red-green-red log, and the screenshots of a UI step;
  - the commits and the diffstat.
- The first checkpoint opens a draft PR for the session branch, then posts the package on it. Its body starts with `Part of <keys>` when the plan names tickets. Each later checkpoint posts the package on the PR of the branch, or on `--pr <n>`. It never opens a second PR, and the duplicate-PR hook refuses one. Never post a checkpoint on the issue.
- The package holds the commits and the diffstat of the local `HEAD`.
  The state and the diff of a PR hold for its `headRefOid` only. Compare `git rev-parse HEAD` with `headRefOid` before you act on the PR.
  Read both from `gh pr view <n> --json headRefName,headRefOid`.
  There is no PR only when gh exits 1 and its standard error matches `grep -qi 'no pull requests found for branch'`. Each other failure of `gh pr view` is an error, not a missing PR. Print the error of gh, and stop.
  Push before you post.
  Post only on a PR whose `headRefName` is the session branch.
- The output warns when a step of the scope has no commit whose subject says `S<n> step <k>`. Commit each step with that subject.
- `report` mode continues at once. A step marked `approve ui` or `approve one-way`, or a plan with `checkpoints: approve`, waits for the owner.
- Compare the work with the D rows that the scope covers. A step that breaks a row stops for a round, or for a `delegated` row under a grant.
- When the owner sends "go" twice in a row with no other words, offer `checkpoints: report` in one line.

Each push starts CI. Where the repo allows it, CI cancels the run in progress, and review bots skip draft PRs.

## Hand-off and resume

```sh
astack session handoff <plan> [<session>]
astack session resume <plan> [<session>] [--tracker <file|->]
```

- The hand-off comment has 5 lines or fewer. They give the branch and the PR, the steps done and the next step. Then come the count of open questions and the resume command.
- In the standard tier, post it on the existing ticket. That is the only comment the plan adds there. Also post it on the PR.
- The resume prompt names the plan, the session, the branch, the PR and the next step. It says whether delegation is on, and it names the owner gates. It ends with "Use ultracode." when the session ran workflows.
- The session record lives in the local git directory.
  In another clone or on another machine, check out the session branch.
  Run `gh pr view <branch> --json number,body,comments`.
  Pass that JSON with `--tracker`.
  Resume reads the done steps from the commit subjects and the checkpoint comments.
  It reads the PR number and ultracode from the PR.
- "pause" is a hard stop. Make a `wip:` commit, run the hand-off, give the resume prompt and stop.

## Finish

1. Run the whole-work proof from `## Proof` on the session branch.
2. Move durable facts to ADRs or tests.
3. Mark the PR ready. The merge needs the grant of the profile or of this turn.
4. After the merge, run `/astack:plan <slug>` for the session boundary in `upkeep.md`.
