---
plan: hot-file-clash
tier: standard
status: draft
home: repo
tracker: none
delegate: off
checkpoints: report
execute: none
reviewed: 2026-10-16
---

# Two parallel steps edit one hot file

## Goal

Goal. The router serves two new routes.
Decision. Do both routes ship in one PR?
Done when. `bun test routes` passes, and today 2 of 4 checks fail.

## Scope

- In. Two routes.
- Out. The client.

## Decisions

None.

## Sessions

### S1 One PR adds both routes

State. now
Depends on. None.
Exit.
- Given each new route, when a client calls it, then it returns 200.
Proof. `bun test routes`

| # | Step | Wave | Lane | Files | Covers | Exit | Proof | Checkpoint |
|---|---|---|---|---|---|---|---|---|
| 1 | Add the list route | W1 | a | src/router.ts | | The list route returns 200 | `bun test routes/list` | report |
| 2 | Add the detail route | W1 | b | src/router.ts#detail | | The detail route returns 200 | `bun test routes/detail` | report |

## Unresolved questions

None.
