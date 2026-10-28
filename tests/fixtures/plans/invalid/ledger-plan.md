---
plan: ledger-plan
tier: standard
status: active
home: repo
tracker: ABC-1
delegate: off
checkpoints: report
execute: S1
reviewed: 2026-10-16
---

# A plan used as a diary

## Goal

Goal. The import accepts large files.
Decision. Can support stop the manual import?
Done when. `bun test import` passes, and today it fails.

## Scope

- In. The import.
- Out. The export.

## Decisions

| # | Kind | Decision | Rejected | Door | Settled | Record |
|---|---|---|---|---|---|---|
| D1 | tech | The import streams the file | Load it in memory | two-way | default | plan |

## Sessions

### S1 One PR streams the import

State. now
Depends on. S2.
Exit.
- Given a 1 GB file, when support imports it, then it finishes.
Proof. `bun test import`

| # | Step | Wave | Lane | Files | Covers | Exit | Proof | Checkpoint |
|---|---|---|---|---|---|---|---|---|
| 1 | Stream the parser | W1 | a | src/import.ts | D9 | The parser streams | `bun test import` | approve |

### S2 Large files run as jobs

State. later

## Progress

- [x] Parser streams.
Status: in progress since the last sync on 2026-10-01.

## Unresolved questions

None.
