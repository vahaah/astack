---
name: "astack-interrogate"
description: "Use for an explicit request to interrogate code, run an adversarial review, or use multiple models to find failures. Reviewers run reproductions, and the lead keeps only failures that a rerun confirms."
disable-model-invocation: true
---

# Interrogate

Run this optional code review only when the user or repo profile requests it.
Use the plan's spec review for missing requirements before implementation.
Keep only concrete failures that a run proves.
Do not apply fixes.

## Set the scope

State the goal and required behavior from the user's request, spec, and PR description.
Use the named files or diff.
Otherwise pin the fetched base and the branch head.
Give every reviewer the checkout path, both SHAs, and the exact diff command.
Keep the review inside that scope.

## Run the reviewers

Use one reviewer for each `interrogate reviewers` entry in `astack-models.md`.
When no entry exists, use `opus` and `codex`.
Use the active harness's provider, permission, and delegation rules.
Report an unavailable requested reviewer.
Never substitute a model without authorization.

Give each reviewer an isolated reproduction workspace through the active harness.
The reviewer must preserve the implementation and the user's checkout.
It can add a temporary test or script in its own workspace.
Give each reviewer this brief:

> Find a failure that breaks the stated behavior. Run a test, script, or command against the real code. Report the exact command, actual output, expected output, and triggering input. Leave out a claim that you did not run. No verified findings is a valid result.

Run one review pass.
Do not request another whole-diff review because the first pass found nothing.
A profile's iteration bounds still apply when hardening invokes this skill.

## Confirm the failures

Rerun each reported command at the same pinned code state.
Use an isolated reproduction workspace when a command writes files.
Keep the finding only when the rerun confirms the failure and that failure breaks the required behavior.
Compare with the base before calling a failure introduced.
Merge findings that share a root cause.
Agreement between reviewers does not replace a reproduction.
Recheck a fix with its failing control and the required repo gates.

## Report

- State the goal and reviewed SHAs.
- Give each verified failure its command, actual output, expected output, and triggering input.
- Name the reviewers that found each failure.
- Give each reviewer's dropped claim count and its reasons.
- Report unavailable reviewers and unrun commands.
- Say "no verified findings" when no failure survives.

Keep style preferences, refactoring wishes, and hypothetical future requirements out of the findings.
