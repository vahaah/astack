# Workflow

This page is the path that astack asks you to follow.
The charts on the [README](../README.md#workflow) show the same path.
The rule card is the list that the agent loads.
When this page and the card differ, the card wins.
The card is `marketplace/plugins/astack/skills/mode/references/card.md`.
The daily steps for the session that owns a ticket are in `marketplace/plugins/astack/skills/coding-guide/SKILL.md`.

## What you say

Say the work in plain words.
You do not need to name a command.
`/astack:mode` with no argument reads the plan, the tracker and git.
Then it does the next step.
A rule in your rules folder can add a route.
It cannot remove a route.

The route table on the README is the set that you use most.
Quotes in that table are words you can type.

## Daily path

Follow these steps for a change that you own.
Do not build on the default branch.

1. Plan work that is unclear, that needs a decision, or that spans more than one pull request.
   Start with `/astack:plan`.
   The first questions ask for the goal.
   They also ask for the one decision that the work drives.

   Later rounds ask only for a choice that belongs to you.
   Each question has one recommendation.
   A clear change in one pull request can skip the plan file.
   The ticket still follows `/astack:write-ticket`.
2. Build on a branch or a worktree.
   `/astack:mode` selects the feature path, the bug-fix path, or the path that changes structure.
   A feature grows one slice at a time.
   Each slice starts with a test that fails.

   A bug fix shows the failure first.
   Write `Root cause: X because Y` before the fix.
   Put the test, or the script, in the same commit as the fix.
3. Run the gates of the repository.
   Run lint, the type check and the tests.
   Run each document check that the repository has.
   Run them again after you clean the diff.
   Run them again after each fix.
   Put the last counts in the pull request.
4. Clean the diff before review.
   Run `/astack:deslop` on the branch against its base.
   Then run the comment check.
   A comment stays only when a keep clause covers it.
5. Review the branch against its base.
   `/astack:code-review` checks standards and the spec.
   Fix each hard finding in a new commit.
   File a finding that sits outside the scope with `/astack:write-ticket`.
6. Open the pull request from the session that owns the ticket.
   Use the pull request template of the repository.
   Put the ticket key on the first line when the profile asks for it.
   Do not put a key after a word that closes a ticket.
7. Harden the pull request when `.claude/pr-review-hardening.profile.md` is in the repository.
   Run `/astack:pr-review-hardening` on the head that is ready.
   Stop when the run is not clean.
   Continue only when you say so.
8. Land the pull request.
   A merge needs a grant in the profile or in that turn.
   Ask for Shipping when you want mode to merge.
   Update the gate counts after the last fix.
   The counts must be true for the head that lands.
9. After that pull request merges, run `/astack:plan` for the next session.
   Build the next session only after that grant.

## One session

One plan session is one pull request.
Start it with `astack session start <plan>`.
The steps sit in waves.
Workers build the steps in worktrees.
The main thread lands those commits in plan order.
`astack session checkpoint` writes the checkpoint on the pull request.

`astack board <plan>` shows the work that you can start.
The board is a view.
Do not commit the board.

A quick plan writes no file.
Start that work with `/astack:implement` for one ticket.
Or name the feature playbook to `/astack:mode`.

| Shape | Start |
|---|---|
| One ticket with parallel child tickets on one branch | `/astack:implement-spec <ticket>` |
| A stack of pull requests | `/astack:mode` Autopilot-stack for that ticket and plan |
| A programme | `/astack:mode` Orchestrate for the plan, and `astack board` for the frontier |
| Work that only a person can do | None. Name the step and stop. |

## Other help

| You want | Open |
|---|---|
| How the plan file is shaped | [Planning](planning.md) |
| The binding design | [Design](design.md) |
| A decision and why it won | [Decisions](adr/README.md) |
| Install in a product repository | [Install in a repository](install-repo.md) |
| Hook profiles | [Hook profiles](runbooks/hook-profiles.md) |
| A private companion | [Private companion](runbooks/private-companion.md) |
| Cursor cloud | [Cursor cloud](runbooks/install-cursor-cloud.md) |
| Grok Bot | [Grok Bot](runbooks/install-grok-bot.md) |
| Publication | [Publish](runbooks/publish.md) |
| How our code works | `astack:how` |
| Why the code has this shape | `astack:why` |
| A fact outside the repository | `astack:research` |
| A ticket or a document outside a plan | `astack:write-ticket` or `astack:write-docs` |

Read a skill before you say what it does.
Use `astack skill-path <plugin>:<skill>`.
Only an exit code of 1 from that command means that the skill is not installed.
