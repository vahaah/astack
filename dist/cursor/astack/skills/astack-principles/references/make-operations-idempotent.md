# Make Operations Idempotent

Make each operation reach the correct state, however often it runs and wherever it starts.
For each operation that changes state, ask the questions below.

## Why

Commands, lifecycle steps and loops must survive crashes and retries.
When partial state changes the result of the next run, each restart becomes a debug session.

## Procedure

- Make startup converge. Find the state that exists, remove stale artifacts and adopt live sessions.
- Clean up by content equivalence, not by creation order.
- Make scheduling idempotent. Restart failed work cleanly, and make new input after each cycle.
- Give each loop that retries the limit of `astack-coding-rules`.

## Questions

1. What happens when this runs twice in a row?
2. What happens when the last run stopped at each point?
3. Does a new run reach the same end state?

When the answer depends on the state that the last run left, add a reconciliation step.
