# Review the spec

Review the plan before implementation.
Use the goal, decisions, acceptance criteria, and current system behavior.
Use a sketch only to test an assumption or name a concrete failure.
Keep code style and refactoring preferences out of this review.

## Find missing behavior

Check the paths that the happy path omits.
These include failed writes, partial migrations, rollback, retries, cancellation, concurrent updates, permissions, and recovery.
Apply a path only when the planned change can reach it.
Name the input, state, or event that makes each risk reachable.

Return one row for each missing contract:

| Criterion | Failure scenario | Required property | Verification |
|---|---|---|---|
| `RETRY-1` | A request keeps failing | Attempts stop at the configured limit | Run a test with every request rejected |

Give each property a stable criterion ID.
Put `[criterion:RETRY-1]` beside its acceptance criterion in the spec.
Name an exact test, probe, or command when one exists.
Otherwise define the input and expected result for its future test.
A future test is an obligation, never evidence of a passing run.

## Resolve each property

Add an accepted property to the spec and its verification contract.
Resolve product and risk choices with the owner.
Keep an unanswered owner choice open.
Do not turn it into an implementation requirement by assumption.
Reject a proposed property when no in-scope input or state can reach its failure.
Record that reason once.

Use one pass over the spec.
Recheck a changed property and the paths it affects.
Do not repeat the whole review when those changes add no behavior.
The review passes when every required property has a verification obligation and no owner choice remains open.
The historical gate ID stays `interrogate` so existing plans and trails remain readable.

## Check the links after implementation

Put `[control:retry-limit]` in the name of the test that checks `RETRY-1`.
Use the matrix format in [spec-links.md](../../pr-review-hardening/references/spec-links.md).
Run `astack check spec-drift <matrix.json>` before the existing test gates.
Keep shared and regression controls with an explicit reason.
Run the controls through the repo's existing gates.
Check a critical control by removing its implementation and seeing the control fail.
Links prove declared traceability only.

For a state machine or concurrency contract, read [formal-models.md](formal-models.md).
