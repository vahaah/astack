---
name: "astack-no-comments"
description: "Use before opening or updating a PR, after added code comments, or to remove, audit or review comments. Run Comment Sicko, delete accepted failures and fix their causes. Offer constraint enforcement and report constraints that remain open."
license: "MIT"
metadata:
  astack-version: "0.1.0"
  source: "astack"
---

# No comments

Spawn Comment Sicko for a fresh review.
Act on the findings that you accept.

## Scope

Use the caller's files or diff.
Otherwise use the current diff against the base branch, including the working tree.
The default base is `main`.

Keep patterns are exact exceptions.
Collect caller patterns and `commentKeep` from the repo-root `.astack/profile.json`.
Pass them to Sicko as extra keep clauses.
A comment survives when one of its lines matches a pattern, with or without its comment marker.
In step 2, that match supplies the exact exception and scoped proof.

## Steps

1. Spawn Agent with `subagent_type: "astack-comment-judge"`. Pass the scope and keep patterns without restating the judge's rules. Match effort to the job with the Subagents section of **mode** at `../astack-mode/SKILL.md`.
2. Inspect its report and diff. Reject application-code edits, scope escapes and exception-protected deletions. Reject wrong `MUST KILL` reasons and flags against kept intentional code. Keep reshape flags for surprising behavior in our own code actionable. Do not restore those comments. A keep needs proof that it concerns something we cannot change. Audit scoped lint and TypeScript suppressions that the report missed. Correctness and safety suppressions remain actionable `MUST KILL`s. Restore a deletion only with an exact exception and scoped proof. Before accepting a weakly supported `IMPORTANT` or `do not remove` verdict, read `../astack-how/SKILL.md` or `../astack-why/SKILL.md`. Follow it on the symbol. Never restore an ambiguous kill. Delete a refuted or still-ambiguous keep. Revert and rerun one rejected report with the failure named. Reject a second failure, report it open, and fail `/astack-no-comments`.
3. Fix trivial accepted flags by deleting a dead path, dropping a parameter or using the real API. If a fix needs design work, read `../astack-architect/SKILL.md`. Follow it once for the accepted set and surrounding code. Stop at the sketch. Architect designs the shape, and step 4 implements it.
4. Implement the smallest root-cause fix inside scope. Remove every named workaround. If the cause lies outside scope, make the smallest in-scope fix and report the rest open. Read `../astack-principles/SKILL.md` and `../astack-principles/references/fix-root-causes.md` for intent only. Neither grants scope expansion or fixes outside the fence. Never add symptom guards.
5. Constraint comments include `do not remove`, `do not change wording` and `talk to X before changing`. Keep comments about things we cannot change. Offer the cheapest in-scope type, runtime check, test or CI lint. Ask for approval with AskUserQuestion and wait. Unattended and eval runs require caller pre-approval. After approval, encode the constraint before deleting its comment. Otherwise delete the comment, report the constraint open, and sketch any out-of-scope work.
6. Report the deletion count, restored comments, reruns, the architect sketch and fixes. Include encoding offers, completed encodings, unenforced constraints and other open work.
