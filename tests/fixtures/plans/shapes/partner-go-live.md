---
plan: partner-go-live
tier: standard
status: active
home: repo
tracker: ABC-330, ABC-331, ABC-357
delegate: on
checkpoints: report
owner-gates: [production merge, hosted migration, money, legal, accounts, secrets, client messages, destructive resets]
execute: S1
reviewed: 2026-10-14
---

# The partner sync goes live in one PR

The partner switched the sync off because it lost fields and repeated work. One PR fixes every cause, and anything that is not green is cut.

## Goal

Goal. The partner turns the sync on again, and 48 hours pass with no lost field.
Decision. Is the sync safe to turn on for the partner production account?
Done when. `bun run sync:dry-run --partner test` reports 0 lost fields, and today it reports 14.

## Scope

- In. Order, stock and price sync, the retry queue, the preview tools and the alerts.
- Out. File upload to the partner drive, and a store release of the app.

## Decisions

| # | Kind | Decision | Rejected | Door | Settled | Record |
|---|---|---|---|---|---|---|
| D1 | goal | The order sync keeps one owner per record and writes only the fields it owns, so a partner edit never loses data in case 1 | Overwrite every field of the order sync | two-way | user R1 | plan |
| D2 | goal | The stock sync keeps one owner per record and writes only the fields it owns, so a partner edit never loses data in case 2 | Overwrite every field of the stock sync | two-way | user R2 | plan |
| D3 | tech | The price sync keeps one owner per record and writes only the fields it owns, so a partner edit never loses data in case 3 | Overwrite every field of the price sync | two-way | user R3 | plan |
| D4 | decision | The partner login keeps one owner per record and writes only the fields it owns, so a partner edit never loses data in case 4 | Overwrite every field of the partner login | two-way | user R4 | plan |
| D5 | rule | The retry queue keeps one owner per record and writes only the fields it owns, so a partner edit never loses data in case 5 | Overwrite every field of the retry queue | two-way | user R1 | plan |
| D6 | tech | The dry-run preview keeps one owner per record and writes only the fields it owns, so a partner edit never loses data in case 6 | Overwrite every field of the dry-run preview | two-way | user R2 | plan |
| D7 | decision | The mapping table keeps one owner per record and writes only the fields it owns, so a partner edit never loses data in case 7 | Overwrite every field of the mapping table | two-way | user R3 | plan |
| D8 | rule | The alert rules keeps one owner per record and writes only the fields it owns, so a partner edit never loses data in case 8 | Overwrite every field of the alert rules | two-way | user R4 | plan |
| D9 | tech | The health page keeps one owner per record and writes only the fields it owns, so a partner edit never loses data in case 9 | Overwrite every field of the health page | two-way | user R1 | plan |
| D10 | decision | The write-back keeps one owner per record and writes only the fields it owns, so a partner edit never loses data in case 10 | Overwrite every field of the write-back | two-way | user R2 | plan |
| D11 | rule | The replay tool keeps one owner per record and writes only the fields it owns, so a partner edit never loses data in case 11 | Overwrite every field of the replay tool | two-way | user R3 | plan |
| D12 | tech | The cut-over guard keeps one owner per record and writes only the fields it owns, so a partner edit never loses data in case 12 | Overwrite every field of the cut-over guard | two-way | user R4 | plan |
| D13 | decision | The order sync keeps one owner per record and writes only the fields it owns, so a partner edit never loses data in case 13 | Overwrite every field of the order sync | two-way | user R1 | plan |
| D14 | rule | The stock sync keeps one owner per record and writes only the fields it owns, so a partner edit never loses data in case 14 | Overwrite every field of the stock sync | two-way | user R2 | plan |
| D15 | tech | The price sync keeps one owner per record and writes only the fields it owns, so a partner edit never loses data in case 15 | Overwrite every field of the price sync | two-way | user R3 | plan |
| D16 | decision | The partner login keeps one owner per record and writes only the fields it owns, so a partner edit never loses data in case 16 | Overwrite every field of the partner login | two-way | user R4 | plan |
| D17 | rule | The retry queue keeps one owner per record and writes only the fields it owns, so a partner edit never loses data in case 17 | Overwrite every field of the retry queue | two-way | user R1 | plan |
| D18 | tech | The dry-run preview keeps one owner per record and writes only the fields it owns, so a partner edit never loses data in case 18 | Overwrite every field of the dry-run preview | two-way | user R2 | plan |
| D19 | decision | The mapping table keeps one owner per record and writes only the fields it owns, so a partner edit never loses data in case 19 | Overwrite every field of the mapping table | two-way | user R3 | plan |
| D20 | rule | The alert rules keeps one owner per record and writes only the fields it owns, so a partner edit never loses data in case 20 | Overwrite every field of the alert rules | two-way | user R4 | plan |
| D21 | tech | The health page keeps one owner per record and writes only the fields it owns, so a partner edit never loses data in case 21 | Overwrite every field of the health page | two-way | user R1 | plan |
| D22 | decision | The write-back keeps one owner per record and writes only the fields it owns, so a partner edit never loses data in case 22 | Overwrite every field of the write-back | two-way | user R2 | plan |
| D23 | rule | The replay tool keeps one owner per record and writes only the fields it owns, so a partner edit never loses data in case 23 | Overwrite every field of the replay tool | two-way | user R3 | plan |

## Sessions

### S1 One PR makes the partner sync safe to turn on

State. now
Depends on. None.
Exit.
- Given the partner test account, when the dry run runs, then it reports 0 lost fields.
- Given a repeated order message, when the sync handles it twice, then it writes once.
- Given a red step, when the merge cut-off comes, then the step leaves the PR and nothing half-done merges.
Proof. `bun run sync:dry-run --partner test`
Baseline. 14 lost fields in the dry run on trunk.

| # | Step | Wave | Lane | Files | Covers | Exit | Proof | Checkpoint |
|---|---|---|---|---|---|---|---|---|
| 1 | Make the order sync safe for go-live | W0 | integrator | src/sync/router.ts#order-sync-1, tests/sync/order-sync-1.test.ts | D4 | The order sync test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/order-sync` | report |
| 2 | Make the stock sync safe for go-live | W0 | integrator | src/sync/queries.ts#stock-sync-2, tests/sync/stock-sync-2.test.ts | D5 | The stock sync test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/stock-sync` | report |
| 3 | Make the price sync safe for go-live | W1 | a | src/sync/router.ts#price-sync-3, tests/sync/price-sync-3.test.ts | D6 | The price sync test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/price-sync` | report |
| 4 | Make the partner login safe for go-live | W1 | b | src/sync/queries.ts#partner-login-4, tests/sync/partner-login-4.test.ts | D7 | The partner login test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/partner-login` | report |
| 5 | Make the retry queue safe for go-live | W1 | c | db/schema/partner.sql#retry-queue-5, tests/sync/retry-queue-5.test.ts | D8 | The retry queue test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/retry-queue` | report |
| 6 | Make the dry-run preview safe for go-live | W1 | d | src/sync/orders.ts#dry-run-preview-6, tests/sync/dry-run-preview-6.test.ts | D9 | The dry-run preview test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/dry-run-preview` | report |
| 7 | Make the mapping table safe for go-live | W1 | e | src/sync/stock.ts#mapping-table-7, tests/sync/mapping-table-7.test.ts | D10 | The mapping table test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/mapping-table` | report |
| 8 | Make the alert rules safe for go-live | W1 | f | src/sync/router.ts#alert-rules-8, tests/sync/alert-rules-8.test.ts | D11 | The alert rules test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/alert-rules` | report |
| 9 | Make the health page safe for go-live | W2 | a | src/sync/router.ts#health-page-9, tests/sync/health-page-9.test.ts | D12 | The health page test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/health-page` | report |
| 10 | Make the write-back safe for go-live | W2 | b | src/sync/queries.ts#write-back-10, tests/sync/write-back-10.test.ts | D13 | The write-back test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/write-back` | report |
| 11 | Make the replay tool safe for go-live | W2 | c | db/schema/partner.sql#replay-tool-11, tests/sync/replay-tool-11.test.ts | D14 | The replay tool test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/replay-tool` | report |
| 12 | Make the cut-over guard safe for go-live | W2 | d | src/sync/orders.ts#cut-over-guard-12, tests/sync/cut-over-guard-12.test.ts | D15 | The cut-over guard test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/cut-over-guard` | report |
| 13 | Make the order sync safe for go-live | W2 | e | src/sync/stock.ts#order-sync-13, tests/sync/order-sync-13.test.ts | D16 | The order sync test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/order-sync` | report |
| 14 | Make the stock sync safe for go-live | W2 | f | src/sync/router.ts#stock-sync-14, tests/sync/stock-sync-14.test.ts | D17 | The stock sync test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/stock-sync` | report |
| 15 | Make the price sync safe for go-live | W2 | g | src/sync/queries.ts#price-sync-15, tests/sync/price-sync-15.test.ts | D18 | The price sync test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/price-sync` | report |
| 16 | Make the partner login safe for go-live | W3 | a | src/sync/router.ts#partner-login-16, tests/sync/partner-login-16.test.ts | D19 | The partner login test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/partner-login` | report |
| 17 | Make the retry queue safe for go-live | W3 | b | src/sync/queries.ts#retry-queue-17, tests/sync/retry-queue-17.test.ts | D20 | The retry queue test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/retry-queue` | report |
| 18 | Make the dry-run preview safe for go-live | W3 | c | db/schema/partner.sql#dry-run-preview-18, tests/sync/dry-run-preview-18.test.ts | D21 | The dry-run preview test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/dry-run-preview` | report |
| 19 | Make the mapping table safe for go-live | W3 | d | src/sync/orders.ts#mapping-table-19, tests/sync/mapping-table-19.test.ts | D22 | The mapping table test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/mapping-table` | report |
| 20 | Make the alert rules safe for go-live | W3 | e | src/sync/stock.ts#alert-rules-20, tests/sync/alert-rules-20.test.ts | D3 | The alert rules test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/alert-rules` | report |
| 21 | Make the health page safe for go-live | W3 | f | src/sync/router.ts#health-page-21, tests/sync/health-page-21.test.ts | D4 | The health page test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/health-page` | report |
| 22 | Make the write-back safe for go-live | W3 | g | src/sync/queries.ts#write-back-22, tests/sync/write-back-22.test.ts | D5 | The write-back test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/write-back` | report |
| 23 | Make the replay tool safe for go-live | W3 | h | db/schema/partner.sql#replay-tool-23, tests/sync/replay-tool-23.test.ts | D6 | The replay tool test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/replay-tool` | report |
| 24 | Make the cut-over guard safe for go-live | W4 | a | src/sync/router.ts#cut-over-guard-24, tests/sync/cut-over-guard-24.test.ts | D7 | The cut-over guard test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/cut-over-guard` | report |
| 25 | Make the order sync safe for go-live | W4 | b | src/sync/queries.ts#order-sync-25, tests/sync/order-sync-25.test.ts | D8 | The order sync test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/order-sync` | report |
| 26 | Make the stock sync safe for go-live | W4 | c | db/schema/partner.sql#stock-sync-26, tests/sync/stock-sync-26.test.ts | D9 | The stock sync test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/stock-sync` | report |
| 27 | Make the price sync safe for go-live | W4 | d | src/sync/orders.ts#price-sync-27, tests/sync/price-sync-27.test.ts | D10 | The price sync test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/price-sync` | report |
| 28 | Make the partner login safe for go-live | W4 | e | src/sync/stock.ts#partner-login-28, tests/sync/partner-login-28.test.ts | D11 | The partner login test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/partner-login` | report |
| 29 | Make the retry queue safe for go-live | W4 | f | src/sync/router.ts#retry-queue-29, tests/sync/retry-queue-29.test.ts | D12 | The retry queue test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/retry-queue` | report |
| 30 | Make the dry-run preview safe for go-live | W4 | g | src/sync/queries.ts#dry-run-preview-30, tests/sync/dry-run-preview-30.test.ts | D13 | The dry-run preview test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/dry-run-preview` | report |
| 31 | Make the mapping table safe for go-live | W4 | h | db/schema/partner.sql#mapping-table-31, tests/sync/mapping-table-31.test.ts | D14 | The mapping table test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/mapping-table` | report |
| 32 | Make the alert rules safe for go-live | W4 | i | src/sync/orders.ts#alert-rules-32, tests/sync/alert-rules-32.test.ts | D15 | The alert rules test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/alert-rules` | report |
| 33 | Make the health page safe for go-live | W5 | a | src/sync/router.ts#health-page-33, tests/sync/health-page-33.test.ts | D16 | The health page test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/health-page` | report |
| 34 | Make the write-back safe for go-live | W5 | b | src/sync/queries.ts#write-back-34, tests/sync/write-back-34.test.ts | D17 | The write-back test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/write-back` | report |
| 35 | Make the replay tool safe for go-live | W5 | c | db/schema/partner.sql#replay-tool-35, tests/sync/replay-tool-35.test.ts | D18 | The replay tool test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/replay-tool` | report |
| 36 | Make the cut-over guard safe for go-live | W5 | d | src/sync/orders.ts#cut-over-guard-36, tests/sync/cut-over-guard-36.test.ts | D19 | The cut-over guard test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/cut-over-guard` | report |
| 37 | Make the order sync safe for go-live | W5 | e | src/sync/stock.ts#order-sync-37, tests/sync/order-sync-37.test.ts | D20 | The order sync test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/order-sync` | report |
| 38 | Make the stock sync safe for go-live | W5 | f | src/sync/router.ts#stock-sync-38, tests/sync/stock-sync-38.test.ts | D21 | The stock sync test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/stock-sync` | report |
| 39 | Make the price sync safe for go-live | W5 | g | src/sync/queries.ts#price-sync-39, tests/sync/price-sync-39.test.ts | D22 | The price sync test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/price-sync` | report |
| 40 | Make the partner login safe for go-live | W5 | h | db/schema/partner.sql#partner-login-40, tests/sync/partner-login-40.test.ts | D3 | The partner login test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/partner-login` | report |
| 41 | Make the retry queue safe for go-live | W6 | a | src/sync/router.ts#retry-queue-41, tests/sync/retry-queue-41.test.ts | D4 | The retry queue test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/retry-queue` | report |
| 42 | Make the dry-run preview safe for go-live | W6 | b | src/sync/queries.ts#dry-run-preview-42, tests/sync/dry-run-preview-42.test.ts | D5 | The dry-run preview test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/dry-run-preview` | report |
| 43 | Make the mapping table safe for go-live | W6 | c | db/schema/partner.sql#mapping-table-43, tests/sync/mapping-table-43.test.ts | D6 | The mapping table test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/mapping-table` | report |
| 44 | Make the alert rules safe for go-live | W6 | d | src/sync/orders.ts#alert-rules-44, tests/sync/alert-rules-44.test.ts | D7 | The alert rules test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/alert-rules` | report |
| 45 | Make the health page safe for go-live | W6 | e | src/sync/stock.ts#health-page-45, tests/sync/health-page-45.test.ts | D8 | The health page test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/health-page` | report |
| 46 | Make the write-back safe for go-live | W6 | f | src/sync/router.ts#write-back-46, tests/sync/write-back-46.test.ts | D9 | The write-back test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/write-back` | report |
| 47 | Make the replay tool safe for go-live | W7 | integrator | src/sync/router.ts#replay-tool-47, tests/sync/replay-tool-47.test.ts | D10 | The replay tool test passes, and a partner dry run shows no lost field or repeated write | `bun test sync/replay-tool` | approve one-way |

## How each step runs

- Step workers never apply migrations or run database tests. The integrator lane applies them in order on the one local database.
- One editor works on each hot-file region per wave. A step only adds to a hot file region.
- The owner gets one checkpoint per wave and one before the merge.

## Proof

- `bun run sync:dry-run --partner test` reports 0 lost fields.
- The full gates pass after each wave on the session branch.

## Unresolved questions

1. Keep the partner write-back in preview until the partner agrees? Recommended. Yes, because a real send cannot be undone (principle prove-it-works). Rejected. Send at once, which risks a duplicate order.
