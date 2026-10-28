---
plan: member-export
tier: standard
status: active
home: repo
tracker: ABC-120
delegate: off
checkpoints: report
owner-gates: [production merge, hosted migration, money, legal, accounts, secrets, client messages, destructive resets]
execute: S1
reviewed: 2026-10-16
terms: [Export, Workspace admin]
---

# Workspace admins export members as CSV

Admins copy member lists by hand for access reviews. After this plan they download one CSV from the Members page.

## Goal

Goal. A workspace admin downloads all members of a 200,000-member workspace as one CSV.
Decision. Is this workspace ready for its quarterly access review?
Done when. `bun scripts/export-bench.ts --rows 200000` prints under 30 s, and today it fails.

## Scope

- In. CSV export of members from the Members page.
- Out. Scheduled or emailed exports.

## Decisions

| # | Kind | Decision | Rejected | Door | Settled | Record |
|---|---|---|---|---|---|---|
| D1 | goal | The export serves the access review, so it lists every member and no guest | A guest column, which no review reads | two-way | user R1 | plan |
| D2 | tech | Exports stream rows to the response | Build in memory, 3 GB peak at 2M rows | one-way | user R2 | ADR 0012 D1 |
| D3 | rule | A member who is not an admin gets 403 from the export route | Hide the button only | two-way | user R2 | plan |
| D4 | decision | Exports over 100k rows run as jobs that email a link | Every export as a job, most are small | two-way | delegated | plan |

## Sessions

### S1 One PR streams member exports

State. now
Depends on. None.
Exit.
- Given a 200,000-member workspace, when an admin clicks Export, then one CSV with 200,000 rows downloads within 30 s.
- Given a member who is not an admin, when they call the export route, then it returns 403.
Proof. `bun test e2e/export`
Baseline. 0 of 2 export checks pass on trunk.

| # | Step | Wave | Lane | Files | Covers | Exit | Proof | Checkpoint |
|---|---|---|---|---|---|---|---|---|
| 1 | Remove the in-memory export path | W1 | a | src/export/buffer.ts | D2 | `buildExportBuffer` has no caller | `bun test export` | report |
| 2 | Guard the export route for admins | W1 | b | src/routes/export.ts#guard | D3 | A member call returns 403 | `bun test routes/export` | report |
| 3 | Stream rows to the response | W2 | a | src/routes/export.ts#handler | D2 | Peak memory stays under 300 MB at 90k rows | `bun scripts/export-bench.ts --rows 90000` | report |
| 4 | Add the Export button to the Members page | W2 | b | src/ui/members.tsx | D1 | An admin sees Export and a member does not | `bun test ui/members` | approve ui |

### S2 Large exports run as jobs

State. later
Depends on. S1.
Exit. A 2M-row export emails a link within 10 minutes.
Fog. Which queue runs the jobs, and how links expire.

## Proof

- `bun test e2e/export` passes on the session branch.
- `bun scripts/export-bench.ts --rows 200000` prints under 30 s.

## Unresolved questions

1. Keep the job threshold at 100k rows? Recommended. Yes, because the bench shows 300 MB at 90k rows (principle prove-it-works). Rejected. A 50k threshold, which sends most exports to the queue. Blocks. S2.
