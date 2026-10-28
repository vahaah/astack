---
name: "astack-implement"
description: "Implement work from a spec or a set of tickets."
license: "MIT"
metadata:
  astack-version: "0.1.0"
  source: "astack, adapted from mattpocock/skills"
  disable-model-invocation: "true"
---

# Implement

Implement the work in the user's spec or tickets.

If the user gives a ticket reference, fetch the ticket.
State its title before starting.
Ask when the reference is ambiguous.

Work on a feature branch.
If the current branch is the default branch, create a feature branch first.
When available, load `astack-coding-rules` before the first edit.
Follow its rules during implementation.

Use `astack-tdd` where possible at the agreed seams.
Run typechecks and individual test files regularly.
Run the full test suite once at the end of implementation.

When available, run `/astack-deslop` on the diff.
It also runs `/astack-no-comments`.
Commit the work to the current branch before review, because review reads commits only.
Run the repo's lint, typecheck and full test suite on that commit.
Run doc checks when the repo has them.

Load `astack-code-review` to review the work.
Put each required fix in a new commit.
When available, use `astack-coding-guide` step 5 to decide which findings to fix and which to file.

Before opening a PR, audit comments added by the review fixes.
Use `/astack-no-comments` when available.
If the deslop capability was unavailable, audit the whole diff.
If the comment skill is unavailable, use an equivalent skill or audit the comment keep clauses manually.
Run the gates again if review fixes or the comment audit changed code.
Put the latest gate counts in the PR's Verification.

Use the repo's PR template.
Without one, use `astack-write-docs` when available.
Without that skill, use `## Why`, `## What changes`, `## Verification` and `## Risk and rollback`.

Write `Part of <ticket>` on the first line of the PR body.
Never put a ticket key after a closing word such as `Closes` or `Fixes`.
That form lets the tracker close the ticket when the PR merges.

After opening the PR, comment on the ticket with the PR link and what it delivers.
Leave the ticket open.
Close it manually after the PR merges and meets every acceptance criterion.
Keep downstream tickets blocked until the code lands.

When `astack-coding-guide` is available, end with the PR link and the next actions from steps 7 to 9.
Those actions cover hardening, merge and `/astack-plan <slug>` after a merge completes a plan session.
