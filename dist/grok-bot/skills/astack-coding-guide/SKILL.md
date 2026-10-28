---
name: "astack-coding-guide"
description: "Use when you own a ticket or a change, from planning it to the merged PR. The house daily workflow gives the commands from /astack-plan to the merged PR in order. It also says what to do when a step stops short, and which command starts each /astack-plan route. The rules for the code itself are in astack-coding-rules."
metadata:
  astack-version: "0.1.0"
---

# Coding guide

This guide gives the daily workflow for the session that owns a ticket.
`astack-coding-rules` holds the code rules.
Load it before your first edit.
Its rules apply at every step below.
For TypeScript or Swift, also load `astack-types` for the type and FP rules.
The always-on coding rule is their short form.
A stricter repo rule wins.

## Daily workflow

Follow these steps in order for every change.
Only the user can start a skill that sets `disable-model-invocation`.
Here, those skills are `/astack-mode`, `/astack-interrogate`, `/astack-reflect`, `/astack-implement`, `/astack-implement-spec` and `/astack-retro`.
An agent reads each needed SKILL.md at the path from `astack skill-path <plugin>:<skill>`.
Then it follows the skill.
If the skill is unavailable, follow the plain description of its step.

The session that owns the ticket runs these steps.
A delegate loads `astack-coding-rules`.
It does not need this guide.
It builds inside its brief, runs the gates, commits and returns.
It never runs `/astack-plan`, files tickets or opens a PR unless its brief says so.
It reports findings outside the scope fence to the owner.
The owner files those tickets.

In an Autopilot run, each PR owner owns its ticket for steps 3 to 8.
It loads this guide too.
Where a step says to ask or show the user, it reports to the root that spawned it.

1. Plan work that is unclear, needs a decision before code, or spans more than one PR with `/astack-plan`.
   It grills the user on their decisions.
   It settles facts and design forks through the astack principles.
   It writes a durable plan file.
   The standard tier files no new tickets.
   A programme exports its sessions to the tracker when the user asks.
   A one-PR change with an obvious approach skips the plan.
   Its ticket still passes the `/astack-write-ticket` rubric.
2. Build each ticket under `/astack-mode`, on a branch or a worktree.
   Never build on the default branch.
   Mode picks the Feature, Bug fix or Refactoring playbook.
   A feature grows slice by slice.
   Each slice starts with a failing test under `astack-tdd`.
   A bug fix reproduces first and follows `astack-tdd` inside the Bug fix playbook.
   Its test or script goes in the same commit as the fix, as step 7 says for a finding.
   This rule wins over step 5 of the Bug fix playbook.
   "Test behavior, not implementation" in `astack-coding-rules` says where each test goes.
   A delegate cannot ask the user.
   Put the test seams that the plan, the ticket or the user agreed in each code delegate's brief.
   When nobody agreed one, ask the user before you write the brief.
   Only when nobody can answer, take a seam from the ticket's Verification or acceptance criteria.
   Put that seam in the brief.
   Name it in the PR's Verification.
   For a plan session, follow "Build from the plan" below.
3. Run the repo's gates for lint, typecheck, tests and doc checks where they exist.
   Run them again after step 4 and after each fix commit.
   Put the last run's counts in the PR's Verification.
4. After the build and before step 5, run `/astack-deslop` on the branch diff against its base.
   Commit its edits.
   It sends every added comment to `/astack-no-comments`.
   Comment Sicko judges each comment against the keep list and the repo's keep patterns.
   `astack check-comments --base <base>` lists comments that the hook denies or leaves to Sicko.
   If deslop is unavailable, run `/astack-no-comments` yourself.
   If that skill is also unavailable, use an available equivalent or audit each keep clause manually.
   Commit messages follow `astack-write-docs`.
5. Review the branch against its base with `/astack-code-review`.
   It checks the Standards and Spec axes.
   For a public API change, read `astack-interrogate` by path with `astack skill-path astack:interrogate`.
   The public API definition is in `astack-coding-rules`.
   Follow the skill on the diff.
   A diff that adds or edits a database migration also needs interrogate.
   So does a new dependency between workspace packages, or a design that the user contests.
   Fix each hard Standards violation, each Spec finding and each interrogate finding marked Act on in a new commit.
   A smell needs judgment.
   Fix one only when its fix stays inside the scope fence.
   File a finding whose fix lies outside the fence with `/astack-write-ticket`.
   Run `/astack-no-comments` over comments that the fix commits add.
6. Open the PR ready with `gh pr create` from the session that owns the ticket.
   Use the repo's PR template, else the `/astack-write-docs` body.
   Name the ticket on its first line.
7. Harden the PR when the repo has `.claude/pr-review-hardening.profile.md`.
   Run `/astack-pr-review-hardening --pr <number>` on the code-ready head, right after step 6.
   A fix can add a test or script that fails for the finding's reason.
   Run the failing check before the fix. Record its output. Then commit the test or script together with the fix, so every commit is green. The PR's Verification shows the failing run first, then the passing run. Each finding owns its commits. No commit holds two findings.
   In an Autopilot run, the PR owner runs hardening after its code-ready report.
   Only the owner writes to its branch.
   Build the whole stack before you harden its PRs bottom-up.
   After a fix, rebase the PRs above that PR.
   In Autopilot-stack, the root does that rebase.
   Push fix commits that remain local after the stop before step 8.
   Ask the user before that push.
   Do not ask when this session's push grant or an Autopilot grant covers the PR.
   Then act on the stop:
   - `stop_clean` continues to step 8.
     The stop counts while the PR's `git patch-id` stays the same.
     A later fix commit, such as a babysitting or verification fix, needs another run before the merge.
   - For an `out-of-scope` finding, fix it yourself in a new commit.
     Then run hardening again.
     For example, its fix needs a migration or a file that the finding does not name.
     When the fix lies outside the scope fence, file it with `/astack-write-ticket` instead.
     Then ask the user whether the PR waits for that ticket.
   - For any other unclean stop, show the final report to the user.
     Then stop.
     Examples are a recurring finding, a missing env variable or precondition, and a spent iteration limit.

   Never start step 8 after an unclean stop unless the user says to.
   If the run returned the PR to draft, run `gh pr ready <number>` after a later run stops clean.
   Do the same when the user says to go on.
8. Land the PR.
   Under `astack-mode`, Babysit watches the PR once the user asks for it.
   Shipping lands it.
   In an Autopilot run, each owner babysits its own PR.
   Its playbook says who lands it.
   Under Shipping and either Autopilot playbook, keep `merge.after_clean_stop` at `report` in the hardening profile.
   Those playbooks verify each PR before the merge.
   Under any other route, the user merges after review or asks `/astack-mode` to use Shipping.
   Before the merge, update the Verification counts after the last fix commit.
   The counts must be true at the head that lands.
   When the profile sets `proof.pr_comment`, link to hardening's last PR comment instead of counting.
9. After the plan's `now` session PR merges, run `/astack-plan <slug>`.
   It reviews the session boundary and asks for the next session's grant.
   Build the next session only after that grant, or under a delegation grant.
   After a merge or a session that needed corrections, the user runs `/astack-retro` in the same session.
   Or the user runs `/astack-reflect` to turn its lessons into edits on existing skills.

The `astack-mode` Opening a PR playbook runs steps 4 to 6 at the end of every playbook.
Step 5 runs after `/astack-deslop` and before `gh pr create`.
An Autopilot playbook opens the PR early.
There, step 5 runs before the code-ready report.

## Build from the plan

A plan session is one PR.
Start it in a fresh session with `astack session start <plan>`.
Follow the sessions reference of `astack-plan`.
Step workers build each wave's steps in worktrees.
The main thread is the integrator lane.
It lands their commits in plan order.
Each checkpoint goes to the PR with `astack session checkpoint`.

A quick plan writes no file.
The user starts it with `/astack-mode Feature playbook for <ticket>` or `/astack-implement <ticket>` for one ticket.

Other routes fit work of another shape:

| Shape | Command |
|---|---|
| One ticket whose sub-issues parallel implementers build off one integration branch | `/astack-implement-spec <ticket>` |
| A reviewed stack of PRs that the user lands | `/astack-mode Autopilot-stack playbook for <ticket> from plan <slug>` |
| A programme board under one coordinator | `/astack-mode Orchestrate playbook for <slug>`, with `astack board <index>` for the frontier |
| Work only a person can do | None. Name the step to the user and stop |

Read a playbook with `astack skill-path astack:mode playbooks/<name>.md`.
The rules in `astack-coding-rules` hold under every route.
