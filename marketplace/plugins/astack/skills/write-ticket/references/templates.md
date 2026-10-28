# Ticket templates

Copy the appropriate template.
Replace guidance with ticket content.
Delete empty optional sections.
Keep required headings exactly as written, because the astack hook matches their words.

## Feature

Required headings: `Problem`, `Outcome`, `Acceptance criteria`, `Scope`, `Verification`.

```md
## Problem

Who is affected, by role, and what they cannot do today. Why it matters now: a deadline, a risk, a blocked team, or a count of affected records.

## Outcome

The end state in one or two sentences: what a user or operator can see or do once this ships.

## Acceptance criteria

- [ ] Given <state>, when <action>, then <observable result>.
- [ ] One line per criterion. A test, a walk-through as a named role, or a query can check each one.

## Scope

In:
- What this ticket covers.

Out:
- What it deliberately leaves alone, with a link to the ticket that covers it if one exists.

## Constraints

Optional. Only limits the implementer cannot discover alone: another team's contract, a legal requirement, a fixed external API. Everything else is the implementer's choice.

## Verification

How you prove the work is done, and who checks it: the test or suite, the role to sign in as, the preview URL and screenshots, or the metric to watch after deploy.

## Links

Optional. Parent, spec, design, ADR, related issues.
```

## Bug

Required headings: `Summary`, `Environment`, `Steps to reproduce`, `Expected`, `Actual`, `Acceptance criteria`.

```md
## Summary

One sentence: what breaks, for which role, and how often.

## Environment

Production, staging or preview. Web, mobile or API. App version or commit. Tenant or team ID, never a name.

## Steps to reproduce

1. Start state, including the data used.
2. Each action, one per line.
3. The step where it goes wrong.

## Expected

What should happen at the last step.

## Actual

What happens instead. Paste the error text. Link the log entry, error-tracker issue or video.

## Impact

Optional. Teams or records affected, the workaround, and since when.

## Acceptance criteria

- [ ] A regression test, or a script named on this line where no cheap seam exists, reruns these steps as <role> in <environment>. It fails before the fix and passes after it.
- [ ] Any further observable result the fix must produce.

## Repair

Optional. Steps to repair records the bug already damaged.

## Links

Optional. Related issues, the PR that introduced it, the error-tracker issue.
```

## Umbrella

Use an umbrella when one outcome needs several PRs.
It keeps the feature headings and adds `Sub-issues`.

```md
## Problem

Who is affected and why it matters now.

## Outcome

The end state once every sub-issue ships.

## Acceptance criteria

- [ ] Every sub-issue is done.
- [ ] The end-to-end check under Verification passes.

## Scope

In:
- The slices listed under Sub-issues.

Out:
- What the whole effort leaves alone.

## Verification

The end-to-end check that proves the outcome, and who runs it.

## Sub-issues

- <KEY-1> Slice title. Blocked by: none.
- <KEY-2> Slice title. Blocked by: <KEY-1>.
```

Give each child its own feature or bug ticket with `parentId` set to the umbrella.
Linear shows those children natively.
The `## Sub-issues` list is therefore a summary.
Keep it aligned with the tracker or remove it once the children exist.

## Map

Use a map when a programme still needs decisions before one plan can describe it.
`/astack:plan` renders it from the programme index with `astack plan-ticket <index> umbrella`.
Apply `wayfinder:map`.
Never apply `ready-for-agent`.

```md
## Problem

Why the effort needs a map: what stands between here and the destination.

## Outcome

The destination, in one or two lines.

## Acceptance criteria

- [ ] No open child ticket remains.
- [ ] Not yet specified is empty.
- [ ] The user approves the plan or spec built from this map.

## Scope

In:
- The destination and every decision on the way to it.

Out:
- Each ruled-out item, one line each, linking its closed ticket.

## Verification

The user reads the plan or spec built from this map and approves it.

## Notes

Skills every session consults, and standing preferences for this effort. When `/astack:plan` charted the map: decisions are indexed in the plan, `/astack:plan <slug>` resolves the tickets, and nothing on the map grants execution.

## Decisions so far

One line per closed decision ticket, or one line that links the plan's Decisions table.

## Not yet specified

Questions nobody can phrase precisely yet.
```

## Decision

Use a decision for one question the programme must settle.
Make it a child of the map.
Give it exactly one `wayfinder:<type>` label.
Leave the type out of the body, because the label defines it.

```md
## Problem

The question, and the team, phase or milestone that its answer blocks.

## Outcome

The form of the answer, such as a chosen option, a measured number or a ratified sketch, and where the answer is recorded.

## Acceptance criteria

- [ ] The answer is posted as a resolution comment.
- [ ] The plan's Decisions table, or the map's Decisions so far, cites this ticket.

## Scope

In:
- This question.

Out:
- The build work the answer unblocks, and every sibling question on the map.

## Verification

Who or what confirms the answer: the user in a live session, primary-source citations for research, or the prototype branch and its observed result.
```

## Tickets from astack skills

The engineering skills add their own sections under the shared headings.

| Heading | Spec from `astack:to-spec` | Slice from `astack:to-tickets` |
|---|---|---|
| Problem | The user's problem | Why the slice matters, with `Part of <spec>` on the first line |
| Outcome | The solution as the user experiences it | The result to build |
| Acceptance criteria | At most seven end-to-end checks | Slice criteria that each fail at the base commit |
| Scope | Included and excluded work | This slice, with sibling slices excluded by name |
| Verification | Testing decisions and agreed seams | The seam and its command or demonstration |
| Extra sections | User stories, implementation decisions and further notes | Constraints only for limits the implementer cannot discover |

`astack:triage` posts an agent brief as a comment on an existing issue.
It keeps its own `##` headings.
This rubric does not score that comment.

## Review finding

Use a feature or bug child under the reviewed ticket for each finding.
Under `## Problem` or `## Summary`, add one line linking the PR that exposed it.
Do not cite the review round.

## Example feature

Title: `Workspace admins can export members as CSV`

```md
## Problem

Workspace admins on the Team plan must copy member lists by hand for quarterly access reviews. Each review takes about an hour for a 200-member workspace, and three admins asked for an export this month.

## Outcome

An admin downloads every member of their workspace as a CSV file from the Members page.

## Acceptance criteria

- [ ] Given an admin on the Members page, when they choose Export, then a CSV downloads with one row per member and the columns name, role, status and joined date.
- [ ] Given a member whose name contains a comma, when an admin opens the CSV in a spreadsheet, then the name stays in one cell.
- [ ] Given a user who is not an admin, when they open the Members page, then the page shows no Export control and the export endpoint returns 403.

## Scope

In:
- Members of the current workspace.

Out:
- Scheduled or emailed exports.
- Guests and pending invites, tracked in a separate ticket.

## Verification

An end-to-end test signs in as an admin and as a member and checks both results. The PR shows the downloaded file opened in a spreadsheet.
```

## Example bug

Title: `CSV export drops rows whose name contains a comma`

```md
## Summary

When a workspace admin exports members, every member whose name contains a comma is missing from the file. It happens on every export.

## Environment

Production, web app, release 4.12.0, workspace 4821.

## Steps to reproduce

1. In a workspace with a test member named "Test, Comma", sign in as an admin.
2. Open Members and choose Export.
3. Open the downloaded file.

## Expected

The file has one row per member, including "Test, Comma".

## Actual

The row for "Test, Comma" is missing. The file has 199 rows for 200 members. The app shows no error and logs nothing.

## Acceptance criteria

- [ ] A regression test that signs in as an admin and exports a test member named "Test, Comma" fails before the fix and passes after it.
- [ ] Names with quotes and line breaks also survive the export.
```
