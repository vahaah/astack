---
name: "astack-deslop"
description: "Remove AI-generated slop from the diff of the current branch against its base branch. Examples are needless defensive code, type escapes, deep nesting and code that ignores local conventions. Comments go to /astack-no-comments. Use after an agent writes code, before review, or when asked to clean up a branch."
license: "MIT"
metadata:
  astack-version: "0.1.0"
  source: "astack, adapted from cursor-team-kit"
---

# Deslop

Remove slop introduced by this branch.
Read its diff against the base branch.
Change only lines that the branch added or changed.

## Find the base branch

1. Use the branch named in the user's request when present.
2. Otherwise use the remote default. Run `git symbolic-ref --quiet --short refs/remotes/origin/HEAD`. It prints `origin/<name>`. Remove the `origin/` prefix.
3. Otherwise use `main` when `git rev-parse --verify --quiet origin/main` succeeds, then `master`.
4. If no candidate exists, stop and ask which branch to use.

Run `git fetch origin <base>`.
A local base branch can be stale.
Read the diff with `git diff origin/<base>...HEAD`.
For uncommitted changes, also read `git diff HEAD`.

## Remove these

- Remove defensive checks and `try`/`catch` blocks that do not fit a trusted code path. Examples are checks for type-guaranteed values and catches that hide errors from callers.
- Remove `any` casts, double casts through `unknown`, and non-null assertions added only to silence the compiler. Fix the type instead.
- Flatten deep nesting where early returns suffice.
- Match the file's code conventions. Remove helpers that duplicate existing ones and unrelated error, naming or import styles.

## Leave comments to no-comments

Do not judge comments here or copy the surrounding comment style.
Invoke `astack-no-comments` for the same diff.
Pass repo keep patterns as exact exceptions.
`../astack-pr-review-hardening/references/comments.md` defines those patterns.
The skill applies Comment Sicko's keep list and fixes accepted findings.

If `astack-no-comments` is unavailable, apply that file's keep list and repo patterns yourself.
Delete uncovered comments only on added or changed lines.

## Guardrails

- Preserve behavior except for a clear bug fix. Name each bug fix separately in the summary.
- Prefer small, focused edits to broad rewrites.
- Leave lines outside the branch's additions and changes untouched.
- After edits, run the documented typecheck and lint for the touched files.
- End with a summary of one to three sentences.
