---
name: "astack-full-stop"
description: "Use for /astack-full-stop or \"full stop\". The agent does the full-send work but never merges. It stops with the PR ready for the owner to merge."
disable-model-invocation: true
---

# Full stop

Do the work of `astack-full-send`, but stop with the PR ready for the owner to merge.
Never merge it.

Read `astack-full-send` by path with `astack skill-path astack:full-send`.
Follow its steps, its proof rules, its review and its babysit.
The rules below win over it.

A "full stop" request is the permission for that work, with no separate "full send".
That includes the testing permission of full-send.
A "full stop" request is the permission for the test methods that the proof needs, also when a project rule says to ask first.
The merge grant of full-send does not apply.
The astack merge guard never reads "full stop" as a merge grant.

Start only on `/astack-full-stop` or on a prompt whose only instruction is "full stop".
When the prompt also says "stop" or "pause", follow the Pause safely playbook of `astack-mode` instead.

A "Full stop." at the end of a message can be only emphasis.
So first make sure that the session has a change or a PR to deliver.
When it has none, ask the owner what to deliver.

## No merge

You can commit, push, update the branch and fix conflicts on the branch of this task.
A forced update follows the rule of full-send.

Never do these things, and never ask another agent to do them:

- Merge the PR.
- Turn on auto-merge.
- Put the PR in a merge queue.
- Push to the default branch.
- Pass around branch protection.

Before the work starts, turn off auto-merge with `gh pr merge <n> --disable-auto`.
Take the PR out of each merge queue.
Do this check again before each push.
Report these changes.
When you cannot stop an automatic merge, report the blocker before you continue.

## Stop at the gate

Use the merge gate of full-send as the readiness check.
Replace its merge step and its report step with a hand-off.
The proof and the review must cover the final diff.
Before the hand-off, examine again each behavior change and each important conflict fix.

Fetch the base.
Read the live PR with `gh pr view <n> --json state,isDraft,headRefOid,baseRefName,mergeStateStatus,reviewDecision,autoMergeRequest,statusCheckRollup`.

The state and the diff of a PR hold for its `headRefOid` only. Compare `git rev-parse HEAD` with `headRefOid` before you act on the PR.

There is no PR only when gh exits 1 and its standard error matches `grep -qi 'no pull requests found for branch'`. Each other failure of `gh pr view` is an error, not a missing PR. Print the error of gh, and stop.

Make sure that the PR is open, is not a draft and has no auto-merge.
When another person merged it, report that.

Give one of these verdicts:

- `Ready to merge`. The merge gate passes. Leave the PR open and unmerged.
- `Waiting for required approval`. Only a human approval remains. Make sure that it is the real blocker.
- `Blocked`. Say what stops the PR, what you tried and what it needs. Follow the question rules of full-send.

Stop the watcher before the hand-off or a question.

## Report

Write the report as `references/writing-the-reply.md` of `astack-mode` says.
Give the PR link, the final head, the verdict, the proof, the outcome of each reviewer and the open risks.
Say whether the PR is still open and unmerged.
