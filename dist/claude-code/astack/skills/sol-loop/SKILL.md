---
name: sol-loop
description: "Use for /astack:sol-loop or \"sol loop\". One reviewer from another model family reviews the change in rounds. The agent makes the smallest changes that satisfy the reviewer and pushes back on scope growth."
disable-model-invocation: true
---

# Sol loop

Use this loop to make a change more correct before you file a PR, or after.
Make the smallest changes that satisfy the reviewer.
Watch for scope growth, and push back with evidence.

## The reviewer

- Read the `sol-loop reviewer` line of `${CLAUDE_CONFIG_DIR:-~/.claude}/rules/astack-models.md`, which `astack:setup-models` writes.
- Take the first value of that line whose family is not the family of the session model. With no line, take `claude` under an OpenAI model and `codex` otherwise.
- Read each value and its family in the file that `astack skill-path astack:arena references/external-seats.md` prints. Run the reviewer in its read-only form.
- With no listed value of another family, report the blocker and stop.
- When the CLI is missing or signed out, report the blocker and stop. Never put another model in its place.
- Use one reviewer only. The reviewer never starts subagents or other reviewers.
- Make no edit to the scoped files while a round runs.
- Do not poll. Wait for the exit of the background Bash call.
- A timeout, an error or no reply is not an approval.
- On a failure, stop the process and make sure that it stopped. Then start the round again with the ledger.

## Budget

- The default is 3 rounds. Round 1 is a full review. Later rounds examine only the changed code and the open findings.
- Go up to 5 rounds only when the owner asks for more rounds.
- Also go up to 5 rounds while a `blocker` or `should` stays open with evidence in a high-risk area.
- The high-risk areas are security, permissions, auth, data loss, state and concurrency.
- Stop early when a round returns only nits.
- A declined nit needs no new round. A fix that changes only a comment, a doc or the format needs no new round either.
- Keep a ledger with the id, the severity, the outcome and the usage of each finding. Record the usage only when the CLI reports it. Never guess it.

## 1. Set the scope

1. Run `git status --short`. Do not stash, discard or include unrelated changes.
2. Limit the review to the paths of the change when they separate cleanly. Else stop and ask the owner.
3. Run `git fetch origin`.
4. For a PR, read `gh pr view <n> --json baseRefName,headRefOid`. Work in the checkout of the PR, as `playbooks/babysit.md` of `astack:mode` says.
5. `HEAD` must be the head of the PR, or ahead of it only by this change. Then the base is `git merge-base HEAD origin/<baseRefName>`.
6. Without a PR, the base is `git merge-base HEAD origin/<default branch>`.
7. Without a remote, use a base that the owner names, or `HEAD` for uncommitted changes only.
8. Record the base as `BASE_SHA`.

Run `astack check pr-head` before you act on a PR, with `--pr <n>` for a named PR. Go on only after exit 0 with an `ok:` last line or exit 3 with a `no_pr:` last line.

A failure of `gh pr view` is an error, not a missing PR. Print it, and stop.

The change runs from `BASE_SHA` to the working tree in the scoped paths, with the untracked files.
`<out>` is a new folder from `mktemp -d`, outside the checkout.
Use one diff command for all rounds, `git diff <BASE_SHA> -- <paths> > <out>/diff.txt`. Write `git status --short` to `<out>/status.txt`.

State the intent and what is out of scope in 1 or 2 sentences.
Run the checks that cover the change.
Do not send code that this change breaks.
Name each missing check and each check that failed before the change in the brief.

## 2. Start a round

Write the brief to `<out>/brief.md`.
Run the reviewer on it as a background Bash call.
For round 1, the brief is this text with the values filled in:

```text
Review only. Do not edit, commit, push, comment on PRs or start subagents.
Repo: <absolute path>  Base: <BASE_SHA>  Intent: <intent>  Out of scope: <scope>  Checks: <results>
Read: <out>/diff.txt and <out>/status.txt. Read the untracked files too.
Read the code around the change. Find bugs, broken callers and gaps against the intent.
Skip style unless it hides a bug. Hold the change to the smallest form.
Flag code, tests or guards that the intent does not need.
Other paths, rare cases, small performance costs and extra compatibility are nits.
blocker = the intended case is wrong. should = a real bug that callers hit, inside the intent. nit = the rest.
Reply:
VERDICT: APPROVE or CHANGES
S1 [blocker|should|nit] <file>:<line> <claim>. Fix: <suggestion>
Keep each id stable across rounds.
```

## 3. Answer the findings

Examine each finding and its severity yourself.
Another path, a rare case or a small cost is a nit, whatever its label.

- Agree. Reproduce a `blocker` or a `should` before you fix it. The Authority rule of `astack:pr-review-hardening` applies.
- Make the smallest fix. Prefer to delete or narrow code over a new lock, cache, helper or option. Fix the case that happened.
- Give each fix its own commit with the check that fails without it, as `astack:coding-rules` says.
- Disagree. Say why, with evidence such as a `file:line`, a test or an output.
- Out of scope, or a nit. Decline it in one line, and list it as a follow-up.

Update the ledger.
Run the checks again, and run `git diff --shortstat <BASE_SHA>`.
When the review made the diff larger, cut it first.
Do not agree only to end the loop.

## 4. Start the next round

Start a next round only when budget remains and one of these is true:

- A `blocker` or a `should` is open.
- Behavior code changed.
- The approval does not cover the current behavior diff.

Write `<out>/diff.txt` and `<out>/status.txt` again with the commands of step 1.
Send the round 1 brief and the ledger.
Mark each ledger item `fixed:`, `disagree:` or `declined:` with its evidence.
Add the change since the last round.
Tell the reviewer to examine only the open ids and the changed code.
Tell it to mark each old id `resolved` or `still open: <reason>`.

## 5. Stop

- Agreed. The reviewer says `APPROVE` on the current behavior diff. No `blocker` or `should` is open, and you have no concern of your own.
- Stuck. An item stays disputed after two replies, or the budget ends. Show both sides in 2 or 3 lines each. The owner decides.
- The end of the budget is not an approval.

Push nothing while the loop runs.
After the loop, push under the Autonomy rule of the rule card, after green gates.
For a PR, add one bullet to `## Verification`, such as `Reviewed by codex:<model>, verdict approved.`
Keep the round count out of the PR body.

## Report

- The rounds and the reviewer value.
- What the reviewer changed, and the diff size before and after.
- Each fixed and declined finding, with its reason.
- The usage, or "not reported".
- Whether you pushed.
