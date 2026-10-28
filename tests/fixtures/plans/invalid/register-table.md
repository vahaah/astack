---
plan: register-table
tier: standard
status: draft
home: repo
tracker: none
delegate: off
checkpoints: report
execute: none
reviewed: 2026-10-16
---

# A plan that keeps a defect register

## Goal

Goal. The export lists every member.
Decision. Is the export ready for the access review?
Done when. `bun test export` passes, and today it fails.

## Scope

- In. The export.
- Out. The import.

## Decisions

None.

## Sessions

### S1 One PR fixes the export

State. now
Depends on. None.
Exit.
- Given 10 members, when an admin exports, then the file has 10 rows.
Proof. `bun test export`

| # | Step | Wave | Lane | Files | Covers | Exit | Proof | Checkpoint |
|---|---|---|---|---|---|---|---|---|
| 1 | Fix the row count | W1 | a | src/export.ts | | The file has 10 rows | `bun test export` | report |

| Defect | Found in | Status |
|---|---|---|
| Header row repeats | step 1 | open |

## Unresolved questions

None.
