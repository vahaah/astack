---
plan: shift-booking
tier: standard
status: active
home: repo
tracker: ABC-340
delegate: off
checkpoints: report
owner-gates: [production merge, hosted migration, money, legal, accounts, secrets, client messages, destructive resets]
execute: S1
reviewed: 2026-10-14
---

# Volunteers book their own shifts from the app

Volunteers ask coordinators to book shifts by phone. This plan moves booking into the app and the web portal with one rule set.

## Goal

Goal. A volunteer books an open shift from the app, and the coordinator sees it on the rota at once.
Decision. Do volunteers and coordinators share one rule set for every booking?
Done when. `bun run e2e shifts.scenario` passes on four devices twice in a row, and today it fails.

## Scope

- In. Shift booking from the app and the portal, the rota rules, reminders and the audit row.
- Out. Payments, and edits of a booked shift.

## Decisions

| # | Kind | Decision | Rejected | Door | Settled | Record |
|---|---|---|---|---|---|---|
| D1 | goal | All four aims count. Volunteers book their own shifts, coordinators stop booking by phone, the rota stays full, and the app shows the new flow. Quality wins a tie | Ship the phone flow only | two-way | user R1 | plan |
| D2 | goal | The decision this work drives is whether volunteers and coordinators share one rule set for bookings | Separate rules per client | two-way | user R1 | plan |
| D3 | decision | The shift list uses the same steps and wording on the web and in the app, and each platform keeps native controls in case 1 | A separate shift list per platform, which doubles the copy | two-way | user R1 | plan |
| D4 | rule | The server rejects a booking sheet booking off the active team and keeps the draft in case 2 | Trust the client check in the booking sheet | two-way | user R2 | plan |
| D5 | tech | One shared service owns the rota rules write, and the router calls it in the same transaction as the audit row for case 3 | A second write path for the rota rules | two-way | user R3 | plan |
| D6 | decision | The capacity check uses the same steps and wording on the web and in the app, and each platform keeps native controls in case 4 | A separate capacity check per platform, which doubles the copy | two-way | user R1 | plan |
| D7 | rule | The server rejects a reminder job booking off the active team and keeps the draft in case 5 | Trust the client check in the reminder job | two-way | user R2 | plan |
| D8 | tech | One shared service owns the audit row write, and the router calls it in the same transaction as the audit row for case 6 | A second write path for the audit row | two-way | user R3 | plan |
| D9 | decision | The offline banner uses the same steps and wording on the web and in the app, and each platform keeps native controls in case 7 | A separate offline banner per platform, which doubles the copy | two-way | user R1 | plan |
| D10 | rule | The server rejects a team switch booking off the active team and keeps the draft in case 8 | Trust the client check in the team switch | two-way | user R2 | plan |
| D11 | tech | One shared service owns the tablet split view write, and the router calls it in the same transaction as the audit row for case 9 | A second write path for the tablet split view | two-way | user R3 | plan |
| D12 | decision | The location hint uses the same steps and wording on the web and in the app, and each platform keeps native controls in case 10 | A separate location hint per platform, which doubles the copy | two-way | user R1 | plan |
| D13 | rule | The server rejects a release config booking off the active team and keeps the draft in case 11 | Trust the client check in the release config | two-way | user R2 | plan |
| D14 | tech | One shared service owns the shift list write, and the router calls it in the same transaction as the audit row for case 12 | A second write path for the shift list | two-way | user R3 | plan |
| D15 | decision | The booking sheet uses the same steps and wording on the web and in the app, and each platform keeps native controls in case 13 | A separate booking sheet per platform, which doubles the copy | two-way | user R1 | plan |
| D16 | rule | The server rejects a rota rules booking off the active team and keeps the draft in case 14 | Trust the client check in the rota rules | two-way | user R2 | plan |
| D17 | tech | One shared service owns the capacity check write, and the router calls it in the same transaction as the audit row for case 15 | A second write path for the capacity check | two-way | user R3 | plan |
| D18 | decision | The reminder job uses the same steps and wording on the web and in the app, and each platform keeps native controls in case 16 | A separate reminder job per platform, which doubles the copy | two-way | user R1 | plan |
| D19 | rule | The server rejects a audit row booking off the active team and keeps the draft in case 17 | Trust the client check in the audit row | two-way | user R2 | plan |
| D20 | tech | One shared service owns the offline banner write, and the router calls it in the same transaction as the audit row for case 18 | A second write path for the offline banner | two-way | user R3 | plan |
| D21 | decision | The team switch uses the same steps and wording on the web and in the app, and each platform keeps native controls in case 19 | A separate team switch per platform, which doubles the copy | two-way | user R1 | plan |
| D22 | rule | The server rejects a tablet split view booking off the active team and keeps the draft in case 20 | Trust the client check in the tablet split view | two-way | user R2 | plan |
| D23 | tech | One shared service owns the location hint write, and the router calls it in the same transaction as the audit row for case 21 | A second write path for the location hint | two-way | user R3 | plan |
| D24 | decision | The release config uses the same steps and wording on the web and in the app, and each platform keeps native controls in case 22 | A separate release config per platform, which doubles the copy | two-way | user R1 | plan |
| D25 | rule | The server rejects a shift list booking off the active team and keeps the draft in case 23 | Trust the client check in the shift list | two-way | user R2 | plan |
| D26 | tech | One shared service owns the booking sheet write, and the router calls it in the same transaction as the audit row for case 24 | A second write path for the booking sheet | two-way | user R3 | plan |
| D27 | decision | The rota rules uses the same steps and wording on the web and in the app, and each platform keeps native controls in case 25 | A separate rota rules per platform, which doubles the copy | two-way | user R1 | plan |
| D28 | rule | The server rejects a capacity check booking off the active team and keeps the draft in case 26 | Trust the client check in the capacity check | two-way | user R2 | plan |
| D29 | tech | One shared service owns the reminder job write, and the router calls it in the same transaction as the audit row for case 27 | A second write path for the reminder job | two-way | user R3 | plan |
| D30 | decision | The audit row uses the same steps and wording on the web and in the app, and each platform keeps native controls in case 28 | A separate audit row per platform, which doubles the copy | two-way | user R1 | plan |
| D31 | rule | The server rejects a offline banner booking off the active team and keeps the draft in case 29 | Trust the client check in the offline banner | two-way | user R2 | plan |

## Sessions

### S1 One PR lets volunteers book shifts

State. now
Ticket. ABC-340
Depends on. None.
Exit.
- Given an open shift, when a volunteer books it in the app, then the rota shows the booking within 5 s.
- Given a volunteer on another team, when they book, then the server rejects the booking and keeps the draft.
- Given four devices, when the scenario runs twice, then both runs pass on each device.
Proof. `bun run e2e shifts.scenario`
Baseline. 0 of 12 scenario checks pass on trunk.

| # | Step | Wave | Lane | Files | Covers | Exit | Proof | Checkpoint |
|---|---|---|---|---|---|---|---|---|
| 1 | Build the shift list on both platforms | W1 | a | src/shift-list/ | D3, D13 | The shift list test suite passes and a volunteer completes the shift list path on a phone | `bun test shift-list` | report |
| 2 | Build the booking sheet on both platforms | W1 | b | src/booking-sheet/ | D4, D14 | The booking sheet test suite passes and a volunteer completes the booking sheet path on a phone | `bun test booking-sheet` | report |
| 3 | Build the rota rules on both platforms | W1 | c | src/rota-rules/ | D5, D15 | The rota rules test suite passes and a volunteer completes the rota rules path on a phone | `bun test rota-rules` | report |
| 4 | Build the capacity check on both platforms | W1 | d | src/capacity-check/ | D6, D16 | The capacity check test suite passes and a volunteer completes the capacity check path on a phone | `bun test capacity-check` | report |
| 5 | Build the reminder job on both platforms | W2 | a | src/reminder-job/ | D7, D17 | The reminder job test suite passes and a volunteer completes the reminder job path on a phone | `bun test reminder-job` | report |
| 6 | Build the audit row on both platforms | W2 | b | src/audit-row/ | D8, D18 | The audit row test suite passes and a volunteer completes the audit row path on a phone | `bun test audit-row` | approve ui |
| 7 | Build the offline banner on both platforms | W2 | c | src/offline-banner/ | D9, D19 | The offline banner test suite passes and a volunteer completes the offline banner path on a phone | `bun test offline-banner` | approve ui |
| 8 | Build the team switch on both platforms | W2 | d | src/team-switch/ | D10, D20 | The team switch test suite passes and a volunteer completes the team switch path on a phone | `bun test team-switch` | report |
| 9 | Build the tablet split view on both platforms | W3 | a | src/tablet-split-view/ | D11, D21 | The tablet split view test suite passes and a volunteer completes the tablet split view path on a phone | `bun test tablet-split-view` | report |
| 10 | Build the location hint on both platforms | W3 | integrator | src/location-hint/ | D12, D22 | The location hint test suite passes and a volunteer completes the location hint path on a phone | `bun test location-hint` | report |

## How each step runs

- Mobile steps run the device matrix on a phone and a tablet in both orientations.
- Each step proves its key assertion by putting back the defect it guards, then removing it again.

## Proof

- `bun run e2e shifts.scenario` passes on the session branch.
- The device matrix passes twice in a row on each device.

## Unresolved questions

1. Turn on booking for every shift type at release? Recommended. No, because coordinators pick the types per team (principle experience-first). Rejected. All types on, which opens types no team staffs.
