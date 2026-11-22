# Word budget and zero-use cut requirements

[ADR 0013](../adr/0013-astack-keeps-a-part-only-on-measured-use.md) governs the keep rule, the word budget and the cut set.
The [model](../../formal/WordBudget.tla) examines the gate over two skills and three counts.

## Acceptance criteria

- [criterion:WB-cap] The budget gate fails when a skill or the total passes its cap, and when a skill has no cap. Each failure names the skill or the total.
- [criterion:WB-ratchet] A cap above its count passes with a note. `bun scripts/budget.ts --lower` sets each cap to its count, drops the cap of a gone skill and never raises a cap.
- [criterion:WB-cut] Each upstream skill name in the duplicate map names a shipped successor, so no cut skill stays a route target.
- [criterion:WB-validate] With no `claude` on PATH, `bun run validate` prints a labelled SKIP and exits 0. It never crashes and never prints a PASS for a check that did not run.

## Claim boundary

The model covers two skills, counts from 0 to 2 and the edit, check and lower steps.
It takes the word count of each skill tree as a true observation.
The gate does not see a PR, so a reviewer enforces the rule that a cap rises only while the total falls by more.
