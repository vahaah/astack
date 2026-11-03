# Optional formal models

Use a formal model when a state or concurrency property is hard to test through selected examples.
Examples include ownership, bounded retries, cancellation, and ordering across failed writes.
Use the smallest model that can find a counterexample.
Keep this path optional unless the owner or repo profile requires its gate.

## Define the contract

Name the states, transitions, actors, and allowed inputs.
State each safety invariant and liveness property separately.
Record the fairness assumptions and finite bounds.
Map each property to a criterion ID and an implementation test.
Explain which production behavior the model leaves out.

## Run the model

Use a tool that the repo already has when possible.
For TLA+, use a pinned TLC release and its required Java version.
Record the tool version, config, command, exit code, and explored states.
Run the checker on the unchanged model.
Plant a defect that violates one required property.
Run it again.
Make sure the checker reports that violation.
Restore the model before the normal checks.
Keep generated states and counterexample files outside the checkout.

Use one TLC worker for the small example and a fixed model config.
The repo's `examples/formal/RetryBudget.tla` and `.cfg` show a bounded retry model.
The repo's `docs/runbooks/formal-models.md` gives its commands.
Those example files are optional project material, not installed plugin dependencies.

## Check the implementation

A passing model establishes its properties only under its recorded assumptions and bounds.
It does not prove that the implementation matches the model.
Run a test for each mapped implementation transition and failure case.
Keep runtime checks and existing gates.
When a required model gate cannot run, report the missing tool or input.
Never replace its result with a prose review.
