# Opening a PR

Run this playbook at the end of every other playbook.

## Worktree

Use a git worktree based on main.
Subagents inherit that worktree.
Multiple `Agent` calls on the same branch each need their own worktree with `isolation: "worktree"`.
If calls reuse a checkout, run `git fetch && git reset --hard origin/<branch>` between them.
Apply the operator's destructive-reset gate before a reset.
Move unrelated work from a dirty branch into a patch.
Create a fresh worktree and apply that patch there.
If the worktree is tangled, reset from main and redo the smallest change.
Keep the same operator gate for that reset.

## Commits

Commit often.
Before opening a PR, rebase the work into small, ordered commits.
Each commit must be landable and help explain the sequence.
Amend a commit just made when the fix belongs in it.
Use a new commit for a separate change.
Commit bodies do not repeat the subject.

## PRs

After the build, run `/astack:deslop` on the branch diff against its base.
Commit its edits.
It sends the comments through `/astack:no-comments`.
Without astack, remove slop yourself.
Then run `/astack:no-comments` before review.
Use `/astack:write-docs` for every PR title, description, and commit body.
Apply every writing layer except Diátaxis.
Keep the STE vocabulary rules.
Use one word for each action.
Keep articles.
Prefer a plain verb to an `-ing` form when it fits.
Apply the slop-removal rules from `/astack:write-docs` after writing.

## PR head checks

Use the checkout of the PR before acting on it.
The state and the diff of a PR hold for its `headRefOid` only. Compare `git rev-parse HEAD` with `headRefOid` before you act on the PR.

There is no PR only when gh exits 1 and its standard error matches `grep -qi 'no pull requests found for branch'`. Each other failure of `gh pr view` is an error, not a missing PR. Print the error of gh, and stop.

## Review

With astack installed, the agent that opens the PR runs `/astack:code-review` against the branch base.
Run it after the slop and `/astack:no-comments` passes, before `gh pr create`.
Without that skill, review the diff against repository standards and the ticket yourself.
Read `astack:interrogate` by path for a contested design, then follow its process.
Also use that process for public API changes, database migration changes, or new dependencies between workspace packages.
Fix each hard Standards violation in a separate commit.
Fix each Spec finding in a separate commit.
Fix each `interrogate` finding marked Act on in a separate commit.
A smell requires judgment.
Fix it only when the fix stays inside the scope fence.
Use `/astack:write-ticket` for a finding outside that fence.
The session that owns the ticket files it.
Run `/astack:no-comments` again when fix commits add comments.
An Autopilot owner opens its PR early.
It completes this review before its code-ready report.

## Titles

Use Conventional Commits form `type(scope): subject`, with no trailing period.
Types include `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, and `perf`.
The scope names an area, such as `astack` or `mode`.
Keep the subject short and imperative.
Name a real symbol when it carries the change.
An example is `fix(astack): retarget opening-a-pr babysit trigger`.

## Descriptions

Write a briefing that a reviewer can read in one minute with the diff open.
State why the change exists, what it leaves out, what it can break, and how you proved it.
Use short sentences and few identifiers.
The PR body becomes the squash commit body.
Keep that body under about 40 lines.
Use the repository PR template when one exists.
The astack hook checks its headings.
`/astack:write-docs` names the template locations.
Without a template, follow `/astack:write-docs` for the ticket line and optional sections.
Keep these four `##` headings exactly as written and in this order.
The hook refuses a body that lacks them.
Never use bold lead-ins in place of the headings.

- `## Why`. State the problem and approach in 1 to 3 short sentences. Omit SHAs, rebase history, and a preamble about the base branch. Include a rejected alternative only when it answers a likely review question.
- `## What changes`. Give 1 to 3 short bullets about behavior. Then name deliberate exclusions, such as a follow-up or known gap. Name a symbol or path only when it carries the change. Name both sides of a rename or retarget.
- `## Verification`. Give 1 to 3 bullets with a real run path and its result. For performance, give one primary number and its unit with `before → after`. Link the arena or swarm directory for other details. Omit sample-size methods, lane accounts, and metric tables.
- `## Risk and rollback`. Use 1 or 2 sentences for the affected scope, its safety or risk, and the rollback. If main is red, state the cost of leaving it red.

Attach a video or screenshot after the sections when it proves a claim.
Put full SHAs, lane reports, detailed measurement corrections, file checklists, and `CLEAN` verdicts in a linked artifact.
Keep them out of the PR body.

## Forge

Use GitHub CLI (`gh`) for every PR operation, including create, edit, view, watch, and merge.
Never require Graphite (`gt`).

## Size and stacks

Prefer five narrow PRs to one large PR under the owner's scope rules.
A stack is a chain of base branches.
The root PR targets trunk.
Each child branch rebases onto its parent's exact tip.
Its PR targets that parent branch.
After a parent merges, move the child to trunk under `playbooks/shipping.md` step 4.
Create a child with `gh pr create --base <parent-branch>`.
Retarget it with `gh pr edit <pr> --base <parent-branch>`.
Branch from trunk only for independent work.
Rebase on trunk before substantial stack work.

## Readiness

Open every PR ready.
Never pass `--draft`.
If a PR opens as a draft, run `gh pr ready <number>`.
Run `gh pr view <number>` before referring to its status.

## Babysit

Opening a PR does not start a babysit.
Post the URL and continue the build.
Finish the phase or stack before a separate babysit pass.
Start that pass only when the user asks after the whole stack exists.
Babysitting each new PR delays the build.
It spends checks on commits that later waves restart.
Push back when feedback moves away from the intent.

A subagent that opens a PR follows the PRs and Review sections above.
It posts the URL and returns to its parent without babysitting.
An Autopilot-full or Autopilot-stack owner has one exception.
Its brief assigns the babysit loop and supplies the request that `playbooks/babysit.md` requires.
That owner starts the loop after its code-ready report.
It reports merge-ready or `STACK-READY` under its own playbook.
It can babysit before the whole stack is built.
The whole-stack waiting rule here and in `playbooks/babysit.md` does not apply to that owner.
