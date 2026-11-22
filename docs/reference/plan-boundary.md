# Plan boundary and plan tool requirements

[ADR 0021](../adr/0021-plan-tools-share-one-adr-reader.md) governs the ADR heading reader, the session boundary and the graduated row.
The [model](../../formal/PlanBoundary.tla) examines the boundary and the graduated row over three sessions and two rows.

## Acceptance criteria

- [criterion:ADR-HEADING] check-plan and change proof read one ADR decision heading form. A titled heading with a full stop or a long dash resolves. A fenced heading and a heading with no title do not resolve.
- [criterion:TRAIL-BATCH] `astack plan trail <plan> -` reads rows from stdin, with 5 cells split by tabs, and writes all rows or none. An unknown phase names the nearest phase. A row with another cell count names its line.
- [criterion:CWD-FREE] `plan trail`, `plan draft`, `plan delegate` and the session commands find the state folder from the plan path, also from a folder outside the repo. `session start` prints the branch, the record path and that it makes no worktree.
- [criterion:GRAD-ONCE] An owner row in the form `Graduated to ADR NNNN Dm` passes `check-plan --base` only when that heading resolves. A graduated row that is live again fails.
- [criterion:BOUNDARY-ONCE] A resume that finds the next session branch continues it and runs no second boundary. No plan text opens a PR that holds only plan edits.

## Claim boundary

The model covers three sessions, two decision rows and four heading forms.
It takes the push of a branch and the result of `git fetch` as true observations.
The skill text tells an agent what to do, so review and the boundary control examine that text.
The model does not cover the trail batch or the state folder. The tests examine them.
