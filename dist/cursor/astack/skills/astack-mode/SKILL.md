---
name: "astack-mode"
description: "Use for /astack-mode, \"what next\", \"go\" or \"resume\". The owner's way of work as a router over astack playbooks and skills. With no argument, it reads the plan, the tracker and git and does the next frontier step. It handles the delegation grant and keeps replies in STE."
disable-model-invocation: true
---

# astack mode

This skill routes work to the playbooks and skills in `astack`. The order of precedence is a stricter repo rule, then `astack`.

The mode lasts until the context is compacted. After a compaction, read `SKILL.md` again and continue.

## Load the rules

1. Apply the rule card. The always-on copy is `astack.md` in the rules directory of the agent tool. When it is not in your context, read `references/card.md`.
2. Read the mode section files in `references/`: `non-negotiables.md`, `autonomy.md`, `subagents.md`, `paths-and-wakeups.md`, `writing-the-reply.md`, and `playbooks.md`. Read `astack-principles` (`astack skill-path astack:principles`) for the engineering principles.
3. Load `astack-coding-rules` before the first code edit.

## Route the request

Use the arguments in the user's request and the last owner message. Find the first row of the route table in `references/routes.md` that matches the owner's words. Open the playbook or skill that the row names. Copy its steps into the task list before you start. A step that you skip stays in the list with `skip: <reason>`.

The mode playbooks are in `references/` and `playbooks/`:

- `references/refresh.md` for "update from main".
- `references/comments-triage.md` for "comments" and "check github comments".
- `references/resume.md` for "resume" and a new session on old work.
- `references/create-pr.md` for "create pr".
- `references/playbooks.md` for the 23 execution playbooks in `playbooks/`.

## With no argument, do the next step

Read the state. Run each command as its own Bash call, in parallel. Never chain them with `&&`.

```sh
astack check-plan --brief
git status --short --branch
git log --oneline -5
git rev-parse HEAD
gh pr view --json number,state,isDraft,reviewDecision,mergeStateStatus,headRefOid
```

There is no PR only when gh exits 1 and its standard error matches `grep -qi 'no pull requests found for branch'`. Each other failure of `gh pr view` is an error, not a missing PR. Print the error of gh, and stop.

The state and the diff of a PR hold for its `headRefOid` only. Compare `git rev-parse HEAD` with `headRefOid` before you act on the PR. When they differ, the first step is a push of the local commits or a pull of the remote ones. Then read the state again.

Then take the first row that matches, and do that step. Do not only name it.

| State | Next step |
|---|---|
| The open PR has review threads that are not resolved, or red CI | `references/comments-triage.md` |
| The branch is behind its base and the owner asked for a sync before | `references/refresh.md` |
| The branch has a finished build and no PR | `references/create-pr.md` |
| The open PR is green, has no open threads, and the profile wants a hardening run that did not run on this head | `astack-pr-review-hardening` |
| The open PR is green and clean | Report it as ready to merge. Merge only with a grant, through the `astack-mode` Shipping playbook |
| A plan has a `now` step with no branch that meets its Exit | Build that step with the route that the plan names. Read `references/resume.md` |
| A draft plan has open questions | `/astack-plan <slug>`. It asks the queued round |
| Nothing above | Ask the owner what to build. Recommend one option from the tracker frontier |

## The delegation grant

"go", "do your recommendation" and "use best practices and our previous decisions" give a delegation grant.
Read its full rule in `references/delegation.md`.
Apply these rules:

- Write `delegate: on` to the plan frontmatter at once. The grant lasts for the session and stays after a resume.
- Decide the agent calls. Decide the owner calls that have one clear best option. Record each as `delegated` in its decision row. Include the reason.
- The owner gates always stop the work. "ask me" or the end of the plan ends the grant.

## Replies

Write every reply in ASD-STE100 Simplified Technical English, as the card says, also short and simple replies. Give the result first. Mark each claim as measured, inferred or a guess. Do not repeat the items that the owner agreed.

Keep a checkpoint reply to 6 lines or fewer.
Give the commit or PR link, gate counts, next step, and count of open questions in that order.

Before a long written answer, run `astack check ste -` on the draft.
