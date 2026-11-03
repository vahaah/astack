# Check required change proof

Every change requires a ChangeProof, including docs and configuration.
Read-only questions have no delivery change to prove.
The [proof contract](../../marketplace/plugins/astack/skills/pr-review-hardening/references/proof-contract.md) defines its records and supported inputs.
[ADR 0005](../adr/0005-every-change-carries-domain-and-formal-proof.md) records the mandate and its limits.
[ADR 0006](../adr/0006-internal-composition-records-follow-domain-effects.md) explains the category notation and function laws.

## Define the changed contract

Name its domain contexts, aggregate ownership, invariants, and current ADR decisions.
Map concrete functions or document transformations to selected model actions.
State the abstraction relation, assumptions, bounds, fairness, and exclusions.
Record typed objects, arrows, effects, equality, applicable laws, and witnesses.
The governing ADR explains the formal claim and category composition for that function group.
Keep models, configs, and implementation controls as executable files linked from it.

Use a change-specific model.
An editorial change can establish a preservation relation for extracted contract data.
A copied retry example does not establish that relation.

## Run the gate

Java 17 or later must be available.
The checker downloads the pinned TLC release into the astack cache when it is absent.
It verifies the reviewed SHA-256 on every use.
A mismatch blocks admission.
The pin comes from the official v1.7.4 asset after its published SHA-1 was checked.

```sh
astack check proof
```

The checker runs the positive model, exact named mutation, and unchanged positive model.
It requires complete tool output and matching restored state counts.
Syntax errors, wrong violations, warnings, incomplete states, stale inputs, and cleanup failures block admission.
A success needs exit 0 and a final line that starts with `ok: proof `.

Use an existing verified jar outside the checkout with `ASTACK_TLC_JAR` when needed.
`ASTACK_PROOF_TIMEOUT_MS` can lower the 60000 ms cap.
The proof command never admits a stored pass receipt.

## Internal record and handoff

```sh
astack check proof --summary
```

This command prints declared intent and an unverified status.
Use it in internal briefs with the assigned scope and permitted effects.
It runs no model and cannot satisfy the proof gate.
A handoff also needs actual commands, outcomes, the current input digest, and unfinished obligations.
The record does not disclose or establish private reasoning.

## Check implementation correspondence

Run the repo's normal tests, static checks, and document checks.
Use removal controls for critical behavior.
The model result covers only its finite abstraction and recorded assumptions.
People still assess domain meaning, abstraction suitability, and implementation correspondence.

## Retry tutorial

`examples/formal/RetryBudget.tla` and `.cfg` remain a small standalone tutorial.
The [TLA+ tool release](https://github.com/tlaplus/tlaplus/releases/tag/v1.7.4) provides the jar.
Copy the tutorial files into an owned temporary folder.
Run this command there:

```sh
java -XX:+UseParallelGC -cp <tla2tools.jar> tlc2.TLC -workers 1 -seed 1 -metadir state -config RetryBudget.cfg RetryBudget.tla
```

The config sets `MaxAttempts` to 3.
It checks state types, bounded attempts, and eventual completion under weak fairness.
Replace `attempts' = attempts + 1` with `attempts' = MaxAttempts + 1` in the temporary copy.
The same command must fail the `Bounded` invariant.
Restore the model before the final positive run.
Remove the owned temporary directory after you retain the evidence.
This tutorial is not the repository's admission proof.
