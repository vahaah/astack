# Check a bounded retry model

Use a model for a property whose state space or concurrency makes example tests insufficient.
Keep the model optional unless the repo requires it.
The [planning reference](../../marketplace/plugins/astack/skills/plan/references/formal-models.md) defines the evidence contract.

## Get the pinned checker

The [TLA+ tools](https://github.com/tlaplus/tlaplus) require Java 11 or later.
Get `tla2tools.jar` from the [v1.7.4 release](https://github.com/tlaplus/tlaplus/releases/tag/v1.7.4).
Keep the jar outside this checkout.
Check it against the release's published checksum before use.
This repo does not download or install the checker during its normal gates.

## Run the example

Copy `examples/formal/RetryBudget.tla` and `RetryBudget.cfg` into a temporary folder.
Run the command from that folder with the absolute jar path:

```sh
java -XX:+UseParallelGC -cp <tla2tools.jar> tlc2.TLC -workers 1 -seed 1 -cleanup -config RetryBudget.cfg RetryBudget.tla
```

The model permits a retry or completion while a request remains active.
It stops retries at `MaxAttempts`.
The config sets that bound to 3.
`TypeOK` checks the state types.
`Bounded` checks the attempt limit.
`EventuallyStops` requires an inactive state under the model's weak fairness assumption.
A passing run reports no error after it checks the complete finite state space.
Keep its state counts and command in the PR evidence.

## Check the negative control

In the temporary copy, replace `attempts' = attempts + 1` with `attempts' = MaxAttempts + 1`.
Run the same command.
It must fail with an invariant violation for `Bounded`.
Restore the original model.
Run the command again.
Remove the temporary folder after you save the evidence.

## Link the implementation

Map the model properties to implementation tests for retry limits, completion, and exhausted requests.
Run those tests through the repo's normal gates.
This example has no real requests, storage, clock, or network.
Its finite model and fairness assumptions do not establish production liveness.
A passing model does not prove that implementation code follows its transitions.
