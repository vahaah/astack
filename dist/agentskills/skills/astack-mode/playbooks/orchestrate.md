### Orchestrate

Run a programme board under one coordinator chat.
Use Autonomous run when one agent can finish the work within the session budget.
You own the programme, never the code.
You write briefs, start sessions, drain completions and take the calls of the programme.

#### State

The plan, `astack board <index>`, the tracker and git hold the programme state.
Keep no store file, no status file and no file of orders that each spawn pastes.
Put a stable order in the brief template, the repo profile or an ADR.

#### Steps

1. Read the state with `astack board <index>`.
2. Drain the open PRs first. Take each one to a merge or to an owner gate through `playbooks/babysit.md` and `playbooks/shipping.md`.
3. Write each brief that the board names before its session starts. A worker cannot ask you a question, so a brief with a missing field fails in silence.
4. Start at most 5 sessions with `astack session start <plan> <session>`.
5. After each merge, read the board again. Then start the next ready session.

#### Supervise

- Treat a completion as a queue event, not an interrupt. Finish the current brief, merge or gate first.
- Keep one writer for each branch and each worktree.
- Never resume an agent to probe it. Read `gh`, the pushed branches and `ListAgents` instead.
- Retry by the failure mode. After two retries, abandon the unit and plan around it.
- A verdict holds for one PR head. A new head cancels it. Green CI is only input to a verdict.
- Put each finding outside the frontier in the drafts file with `astack plan draft <plan> <title> <why>`. Fix only what blocks the frontier.

#### Escalation

Escalate an action that you cannot undo, such as a force-push to a shared branch, a deploy or a deletion.
Escalate a product call that no experiment can settle, and a dead end that stays after a replan.
Escalate each owner gate of the plan.
Route the work around a gate and continue.
Do not escalate a rebase, a retry, a flaky CI run, a review thread or a format fix.

#### Reply

At each checkpoint, give the board counts and the link of each merged PR.
List each waiting item as the Catch up part of `references/resume.md` says.
