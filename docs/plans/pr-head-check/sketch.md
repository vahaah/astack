# PR head checks use one command

`astack check pr-head [--pr <n>]` replaces the manual engine procedure.
It runs at the preflight, before each gate run, and after a push.
The existing PR selection and checkout procedure stays in the skill.

## Contract

Run these operations in order, with an early return on each failure:

1. `gh pr view [<n>] --json number,headRefOid`.
2. `git fetch origin <headRefOid>`.
3. `git rev-parse HEAD`.
4. `git merge-base --is-ancestor <headRefOid> HEAD`.
5. `git log --oneline <headRefOid>..HEAD`.

Parse external data at the process edge.
Accept a positive PR number and a valid commit object ID.
Pass process arguments as an array.
Read state again at every call.
The fetch writes Git objects and refs, including `FETCH_HEAD`.
The explicit-PR preflight adds one fresh read after the existing selection read.

| Result | Exit | Last-line prefix |
|---|---|---|
| HEAD equals or descends from PR_HEAD | 0 | `ok:` |
| No selector, gh exits 1, and stderr contains the current no-PR diagnostic with any case | 3 | `no_pr:` |
| A process failure, malformed output, a remote-ahead head, or diverged history | 1 | `stop:` |
| Invalid CLI arguments | 2 | No accepted prefix |

Only the current-branch path can return `no_pr:`.
The exact diagnostic is `no pull requests found for branch`.
An empty response, a login failure, or another not-found message stops the run.
An explicit selector always stops on a GitHub lookup failure.
Both an ancestry result of 1 and an ancestry error stop the run.
Preserve the original stderr from each failed process.

On success, stdout names `HEAD` and `PR_HEAD` and prints the complete `UNPUSHED` list.
An empty list is explicit.
Print the trusted result prefix last, after any commit subjects.
Every caller accepts only the specified pair of exit code and prefix.
Exit 0 without `ok:` stops the caller.
This rule makes sure a launcher with no runtime cannot pass a check.

## Structure

Candidate A adds one check command with the existing Command, Io, argument parser, and Result patterns.
It runs effects in order with early returns.
Small local functions parse data and format results.
Only the command export is public.
It adds no reader interface or record of optional facts from later operations.

Candidate B adds a single-pass mode to `watch-pr`.
It can preserve failure rules if it bypasses retries.
It expands the watcher interface and puts Git history checks in the polling path.

Candidate A has the smaller interface and follows the existing check commands.
Both candidates have repository precedent and need no new framework.

## Callers and fallback

Move the head procedure and decision step in `astack:pr-review-hardening`.
Move the head procedure in its gate reference.
The stub uses the command when `command -v astack` succeeds.
Otherwise it keeps the complete manual procedure at every current checkpoint.
Update the consistency tests with those callers in the same step.

Keep the explicit-PR selection and checkout rules.
Use `gh` for PR lookup.
The CLI never reads or stores the credentials of `gh`.
Clarify that existing PR-read exception in `docs/design.md`.

## Acceptance seam

Run the CLI from `tests/astack/pr-head.test.ts` with a real temporary repository and a bare origin.
Use a fake `gh` on PATH to control the external API result.
Assert literal stdout, stderr, exit codes, process arguments, and no later operation after a failure.

Cover these classes and their distinct failure points:

- Equal heads and a local descendant with the exact unpushed commits.
- Remote-ahead and diverged histories.
- The no-PR result on the current branch and the explicit-PR error.
- Other GitHub errors, spawn failures, and malformed JSON or fields.
- Failures in fetch, rev-parse, ancestry, and log.
- Invalid arguments and a changed PR head on a later invocation.
- Missing runtime output and mismatched code-prefix pairs at each caller.
- CLI availability and absence in the stub fallback.

Use a narrow fixture for a Git failure only when a real repository cannot produce that failure reliably.
Keep the success and history cases on real Git.

## Measurements

Record the manual path before implementation.
Measure both paths with the same inputs and environment.
Report process duration and observed model tool calls separately.
Include the extra explicit-PR lookup.

Source step counts are structural evidence, not observed model call counts.
No measured complete PR time or token baseline exists yet.
Use actual provider counters for tokens across the parent, children, and retries.
Keep cached input counts separate when the provider reports them.
Report absent counters as unavailable.
Only complete matched tasks can establish complete PR time and token savings.
