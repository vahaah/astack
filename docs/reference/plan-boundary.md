# Plan boundary and plan tool requirements

[ADR 0020](../adr/0020-plan-tools-share-one-adr-reader.md) governs the ADR heading reader, the session boundary and the graduated row.
The [model](../../formal/PlanBoundary.tla) examines the boundary and the graduated row over three sessions and two rows.

## Acceptance criteria

- [criterion:ADR-HEADING] check-plan and change proof read one ADR decision heading form. A titled heading with a full stop or a long dash resolves. A fenced heading and a heading with no title do not resolve.
- [criterion:TRAIL-BATCH] `astack plan trail <plan> -` reads rows from stdin, with 5 cells split by tabs, and writes all rows or none. An unknown phase names the nearest phase. A row with another cell count names its line.
- [criterion:CWD-FREE] `plan trail`, `plan draft`, `plan delegate` and the session commands find the state folder from the plan path. This also works from a folder outside the repo and through a symlink. A plan path that gives an invalid slug writes no state. `session start` prints the branch, the record path and that it makes no worktree.
- [criterion:GRAD-ONCE] An owner row in the form `Graduated to ADR NNNN Dm` passes `check-plan --base` only when that heading resolves. A graduated row that is live again fails.
- [criterion:BOUNDARY-ONCE] A resume that finds the next session branch continues it and runs no second boundary. No plan text opens a PR that holds only plan edits.
- [criterion:SPAN-RUN] A code span starts only at a full backtick run and ends at a run of the same length. A double-backtick span hides its words from check-plan, the PR link reader and the comment classifier. A longer run with no match masks nothing.

## Claim boundary

The model covers three sessions, two decision rows and four heading forms.
It takes the push of a branch and the result of `git fetch` as true observations.
The skill text tells an agent what to do, so review and the boundary control examine that text.
The model does not cover the trail batch, the state folder or the code span function. The tests examine them.
