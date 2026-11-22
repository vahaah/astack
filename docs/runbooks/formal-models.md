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

The registry `formal/models.json` selects the models of each changed path.
A copied retry example does not establish a model relation.

## Register a model

Each entry of `formal/models.json` has `name`, `model`, `negative`, `records`, `covers` and `text`.
The `name` is the module name, and `model` and `negative` use the manifest shape.
`records` lists each file whose Formal claim names the model.
`covers` lists the code globs of the model, and `text` lists its skill text globs.
`failClosed` lists the globs where each file needs a model or an `unmodelled` entry.
Each `unmodelled` entry gives its path, its reason and a control.
`contractOnly` lists the globs that give R0.

A covered path, a model file or the registry gives R4.
An uncovered path under a fail-closed glob stops.
A contract-only path gives R0, and each other path gives R1.
`proof.minRung` in `.astack/profile.json` sets a floor from R0 to R4.
The higher floor of the diff base and the tree applies, so a change cannot lower its own floor.
Remove a model in two PRs. The first removes its registry entry, and the second removes its files.

## Run the gate

Java 17 or later must be available.
The checker downloads the pinned TLC release into the astack cache when it is absent.
It verifies the reviewed SHA-256 on every use.
A mismatch blocks admission.
The pin comes from the official v1.7.4 asset after its published SHA-1 was checked.

```sh
astack check proof
```

The checker prints the rung and the path or floor that set it.
Below R4 it starts no Java process.
At R4 it runs the manifest model first, then each other selected model.
Each model runs the positive model, exact named mutation, and unchanged positive model.
It requires complete tool output and matching restored state counts.
Syntax errors, wrong violations, warnings, incomplete states, stale inputs, and cleanup failures block admission.
A success needs exit 0 and a final line that starts with `ok: proof `.

In CI, pass the base branch, such as `astack check proof --base origin/main`.
The diff then starts at the merge base of that ref and HEAD.
The manifest base must be an ancestor of that merge base, so a merge to main keeps the proof valid.
Do not move the manifest base after a merge of main.
The [proof contract](../../marketplace/plugins/astack/skills/pr-review-hardening/references/proof-contract.md#base) gives the full base rule, and [ADR 0012](../adr/0012-change-proof-accepts-an-older-base.md) records it.

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
