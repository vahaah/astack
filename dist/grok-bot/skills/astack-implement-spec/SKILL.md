---
name: "astack-implement-spec"
description: "Implement the output of /astack-to-spec and /astack-to-tickets."
disable-model-invocation: true
metadata:
  astack-version: "0.1.0"
---

# Implement a spec

Read the supplied spec and its implementation tickets.
If the tracker is unspecified, tell the user to run `/astack-setup`.

Implement the entire spec on one integration branch.
Leave every ticket open until that branch merges.
Tracker completion must follow the code landing.

Treat the tickets as a task graph with blocking relationships.
The frontier contains tickets whose prerequisites are complete.

Use brief messages between agents.
Pass context pointers to the spec, tickets, research notes and earlier commits.
Do not duplicate information available through those pointers.

Where possible, run implementers in the background.
Use `Agent` with `isolation: "worktree"` and `run_in_background: true` for each implementer.
When `astack-coding-rules` is available, require each implementer to load it before its first edit.

Run this skill from the main session or a first-level subagent.
Implementers and reviewers run one level below it.
Agents at the third level have no Agent tool.

Worktrees receive tracked files only.
Commit ignored tickets or required fixtures first, or pass their text to each implementer.

## Steps

1. Read the spec and tickets. Identify their task graph.

2. Optionally delegate exploration of relevant code or external documentation. Use an agent that can save files, such as `subagent_type: "astack-researcher"`. Save Markdown notes outside the repo where later agents can read them. This separates research from implementation work.

3. Create the integration branch.

4. Assign each ticket to an implementer with its own branch and worktree. Each implementer must:
   - Confirm that its worktree starts from the integration branch.
   - Reset onto the integration branch if its worktree uses another base.
   - Load `astack-tdd` to build the ticket.
   - Merge the integration branch tip into its branch before reporting completion.

5. When an implementer finishes, use a merger subagent to merge its work into the integration branch.

6. Start more implementers when a merge makes new tickets available. Derive the frontier from merged integration work. Do not use the tracker's blocked-by counts, because tickets remain open until the integration branch merges.

7. After all tickets are complete, run `/astack-deslop` against the default branch when available. It also runs `/astack-no-comments`. Commit its edits. If deslop is unavailable, audit comments across the whole diff. Use `/astack-no-comments`, an equivalent available skill, or a manual keep-clause audit. Run lint, typecheck, tests and any doc checks. Then load `astack-code-review` to review the integration branch.

8. Use one implementer to fix review findings. Put each fix in its own commit. When available, follow `astack-coding-guide` step 5 for fix-or-file decisions. Audit comments added by fix commits with `/astack-no-comments` when available. Otherwise use an equivalent skill or a manual keep-clause audit. Run the gates again.

9. Open one PR when the tracker closes work through PRs or the user requests one. Write `Part of <spec>, <ticket>, ...` on its first line. Use draft status only when the repo opens drafts first. Otherwise open a ready PR. Use the repo's PR template. Without one, use `astack-write-docs` when available. Otherwise use `## Why`, `## What changes`, `## Verification` and `## Risk and rollback`. Put the latest gate counts in Verification. Explain why one PR serves all the tickets. Leave every ticket open until the PR merges. Close each ticket manually after merge. Never put a ticket key after a closing word, because the astack hook refuses it. If no PR is needed, report the integration branch. Explain how the tracker closes each ticket after that branch merges.

10. Clean up every implementer worktree.

When a PR exists and `astack-coding-guide` is available, end with the PR link and the actions from steps 7 to 9.
Those actions cover hardening, merge and `/astack-plan <slug>` after a merge completes a plan session.
