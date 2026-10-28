---
plan: data-platform
tier: programme
status: active
home: repo
tracker: none
delegate: off
checkpoints: report
owner-gates: [production merge, hosted migration 3 per day, money, legal, accounts, secrets, client messages, destructive resets]
execute: none
reviewed: 2026-10-16
---

# Analysts query product events within one hour of capture

Product events reach the warehouse a day late. This programme moves them to a one-hour path.

## Goal

Goal. An analyst queries any product event in the warehouse within one hour of capture.
Decision. Can the growth team read a launch on the day it ships?
Done when. `bun scripts/event-lag.ts` prints a lag under 60 minutes for 7 days in a row.

## Scope

- In. Product events from the web and mobile apps.
- Out. Backfill of events older than 30 days.

## Lanes

- a. Ingest. Files. services/ingest/.
- b. Warehouse. Files. warehouse/.

## Decisions

| # | Kind | Decision | Rejected | Door | Settled | Record |
|---|---|---|---|---|---|---|
| D1 | tech | Events stream through one queue into the warehouse | A nightly batch, which is the lag we have | one-way | user R1 | ADR 0014 D1 |
| D2 | rule | The staging table keeps raw events for 30 days | Keep them forever, which nobody asked for | two-way | user R2 | plan |

## Milestones

### M1 Events land in staging within 10 minutes

State. now
Demo. An analyst sees a test event in the staging table 10 minutes after a click.
Proof. `bun scripts/event-lag.ts --table staging`
Depends on. None.
Target. 2026-11-20
Blocks.
- B01 Stream events into the staging table. Lane. a. Brief. B01.md.
- B02 Model the staging table. Lane. b. Brief. stub.

### M2 Analysts query events within one hour

State. later
Demo. An analyst queries a launch event in the warehouse one hour after capture.
Depends on. M1.
Fog. Which warehouse view the analysts use.

## Not yet specified

- How mobile clients batch events when they are offline.

## Unresolved questions

1. Keep the staging table in the warehouse project? Recommended. Yes, because the ingest service already has write access there (principle laziness-protocol). Rejected. A new project, which needs a second service account. Binds. B02. Decide by. M1.
