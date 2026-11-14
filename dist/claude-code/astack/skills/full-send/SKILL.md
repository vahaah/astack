---
name: full-send
description: "Use for /astack:full-send or \"full send\". The owner does not watch the thread. The agent proves, reviews, files, babysits and merges the change on its own."
disable-model-invocation: true
---

# Full send

The owner said "full send" and does not watch this thread.
Nobody reads your updates or your final message until long after you stop.
You own the work from its current state to a merged PR.

When the owner did not clearly ask for "full send", do not assume full autonomy.
When the owner did, each rule below applies.

## The grant

An un-negated "full send" in the prompt of the owner gives these permissions:

- Merge the PR when the merge gate passes. The astack merge guard reads that clause as a merge grant for this prompt.
- Use the test methods that the proof needs, with no question first.

Update the branch with a merge from `origin/<base>`, as `references/refresh.md` of `astack:mode` says.
Never rebase or force-push the branch.

The grant gives nothing else.
It never covers a production change, a data delete, a change outside the repo or a close of a PR.
It never covers a force-push, a forge approval or an `--admin` merge.
It never passes an approval prompt of the harness or the system.
Each owner gate of the rule card still applies.

## The testing permission

"full send" is the answer of the owner to a project rule that asks before a test method.
It is also the answer to a rule that leaves testing to the owner.
That covers computer use, browser automation, simulators and devices, the app or a dev server, screenshots and visual checks.
Use the method that gives direct proof. Name it in the report.

Rules that say how to test still apply.
Follow each rule that names the correct command, fixture or test.
The permission removes only the question.
It never lifts a repo rule that forbids a method.
It covers only the tests that this task needs.

## Steps

1. Finish the change. Make the smallest change that meets the goal. Fix the case that happened, not each case that can happen. On the default branch, make a branch first.
2. Prove it. Follow the Proof section below. Run steps 3 to 5 of `astack:coding-guide`: the gates with `astack check proof`, deslop and code review.
3. Get feedback with the sol loop. Read `astack:sol-loop` by path with `astack skill-path astack:sol-loop`. Follow it.
4. File the PR with `astack:file-pr`. Update the branch from the base first. Add one short `## Verification` line that says how you proved the change.
5. Harden the PR when the repo has a hardening profile, as step 7 of `astack:coding-guide` says. Continue only after `stop_clean`.
6. Babysit the PR with `astack:babysit-pr` in `drive` mode. Fix the real findings and the CI failures. Prove each fix before you push it.
7. Merge when the merge gate passes. Follow the Shipping playbook of `astack:mode` and the Merge gate section below.
8. Report. Follow the Report section below.

Stay active from step 1 to step 8.
When you end the turn while checks or bots run, the work stops, because nobody prompts you again.
Wait with the watcher of `astack:babysit-pr`, so that a change of the PR wakes you.
Stop the watcher before you stop short of the merge.
Keep a decision trail with `astack:show-me-your-work`. Read that skill by path.

## Proof

Proof is evidence that you saw yourself in this session, such as command output, a reproduction or a screenshot.
Use the most direct proof that the change allows.

- Reproduce the original failure. Apply the fix. Then watch the same reproduction pass.
- Run the checks that the CI of the repo runs, such as typecheck, lint and tests.
- When the behavior has no test and the repo has a test setup, add one focused test.
- That test must fail without the fix.
- For UI and runtime behavior, run the app and look at the change. Use `astack:control-ui` or `astack:control-cli`.
- Green mocked tests do not prove that the user experience works.
- Attach screenshots to the PR when they help and you can upload them.

When you cannot prove a change, you do not have full confidence.
Ask the owner.

## Merge gate

Each of these must be true on the latest commit:

- Your proof covers each change in the diff.
- `astack check proof` passes on the candidate head.
- The required checks are green.
- The review bots finished. You fixed each finding, or you dismissed it with a written reason.
- No human review still requests changes.
- A verifier on a different model from the author posted `PASS` or `PASS+NOTES`, as step 1 of Shipping says.
- Hardening stopped with `stop_clean`, when the repo has a hardening profile.
- The branch is up to date with the base, and GitHub reports the PR as mergeable.

Fetch the base right before the merge.

Merge with the method that the repo uses. Read the allowed methods and recent merged PRs.
Run `gh pr merge` in its own Bash call. Never use `--admin` or another bypass.
With a merge queue or auto-merge, stay until GitHub reports the PR as merged.
Read the result back with `gh pr view <pr> --json state,mergedAt,mergeCommit,baseRefName`.

The state and the diff of a PR hold for its `headRefOid` only. Compare `git rev-parse HEAD` with `headRefOid` before you act on the PR.

There is no PR only when gh exits 1 and its standard error matches `grep -qi 'no pull requests found for branch'`. Each other failure of `gh pr view` is an error, not a missing PR. Print the error of gh, and stop.

A review bot can ask for a human review.
You can continue past that request only when all of these are true:

- You have high confidence in the change.
- The request is not a required check or a required approval.
- The finding is outside the "Ask by default" list of `playbooks/review-bot-triage.md` of the mode.

Never supply an approval that the forge requires.
When the merge guard refuses the merge, stop as the full-stop skill does.
Report the PR as ready.
Name the missing grant.

## Asking the owner

A question in a normal message goes unseen, and the thread looks done.
Ask through the question tool of the harness, so that the thread shows that it waits.
Put all the context in the question.
Give the PR link, what blocks you and the options, with your recommendation first.

Ask only when you cannot continue alone:

- You cannot prove the change.
- The merge gate cannot pass, and you cannot fix that yourself.
- The next step is outside the grant above.
- The goal is ambiguous in a way that changes the result.
- Another PR makes this PR obsolete.

Decide each other call with a sensible default, and list it in the report.

When the harness has no question tool, or the tool returns no answer, take the safe path.
Leave the PR open and unmerged.
Start your final message with the question.

## Report

Write the final message as `references/writing-the-reply.md` of the mode says.
Give the PR link, the merge commit and your proof.
Give each decision that you made for the owner, with its label of measured, inferred or guess.
