# Make Operations Idempotent

Make operations reach the correct state regardless of how often they run or where they start.
For every operation that changes state, ask what happens if it runs twice.
Also ask what happens if the previous run crashed halfway.

## Why

Commands, lifecycle operations, and processing loops must handle crashes, restarts, and retries.
If partial state changes the next run's outcome, every restart becomes a debugging session.

## Procedure

- Make startup converge. Find existing state. Clean stale artifacts. Adopt live sessions.
- Clean up by comparing content equivalence instead of creation order.
- Recover locks through PID-based detection of stale holders.
- Make scheduling idempotent. Restart failed work cleanly. Generate fresh input after each cycle.

## Questions

1. What happens if this runs twice in a row?
2. What happens if the previous run crashed at every possible point?
3. Does running it again reach the same end state?

An answer of "it depends on what state was left behind" means the operation needs a reconciliation step.
