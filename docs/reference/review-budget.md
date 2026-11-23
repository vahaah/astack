# Review budget requirements

[ADR 0035](../adr/0035-each-pr-has-one-review-record-and-a-delta-review.md) governs the review record, the delta review, the rung-sized reviewer set and the converge iterations.
[The CI proof record](../../formal/ci-proof-records.md) states the mode `ci_mixed`, and `formal/CiProofRecords.tla` models it.

## Acceptance criteria

- [criterion:RV-record] A hardening stop adds its head with its decision and launches to the review record. The record keeps `baseSha` and `firstReviewedHead`, and the new head joins the end.
- [criterion:RV-store-atomic] A save writes a temporary file and renames it, so a failed save keeps the old record.
- [criterion:RV-delta] `astack review base` exits 0 with `delta:` when HEAD holds the last `stop_clean` head of the record. After a rebase or under a replace ref, it exits 3 with `full:`. An unreadable record exits 1.
- [criterion:RV-converge] `astack check hardening-profile` passes `converge: true` and `converge: false`, and it refuses a number.
- [criterion:RV-defer-hold] `stop_clean` needs 0 open deferred entries, and no merge follows `stop_converged`. A deferred entry stays open in each later run until an iteration reproduces it again and its failure does not occur.
- [criterion:RV-rung] With `select: applicable`, a run at R0 launches one agent, and R1 and up launch the applicable set.
- [criterion:RV-rung-floor] A run with 0 reviewer launches never ends in `stop_clean`, unless its review range is empty.
- [criterion:RV-ci-mixed] A PR that changes a workflow and `src/a.ts` with no tool change gets exit 3 and `ci_mixed:` from ci-pins. Each gate of that mode blocks, and a clean stop needs `ciReadBack: pass`.

## Claim boundary

The engine text tests read the rules of the hardening skill. They do not run an agent.
An agent can write a false clean head into the record, so the gates and the merge grant still apply.
