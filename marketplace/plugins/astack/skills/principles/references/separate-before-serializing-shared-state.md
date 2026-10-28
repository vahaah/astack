# Separate Before Serializing Shared State

Before actors share mutable state, ask whether they need the same mutable object.
If not, remove the sharing.
When sharing is necessary, enforce serialization through lockfiles, sequential phases, or exclusive ownership.
Instructions and conventions are not concurrency control.

## Why

Concurrent writes create races that are intermittent, hard to reproduce, and expensive to debug.

## Procedure

1. Identify shared mutable state. Examples include files that both actors read and write, branches that both push to, and APIs that both define and consume.
2. Remove the shared write target by default. Ask whether the actors need one canonical object or publish independent facts. Give each actor its own file, key, branch, or state directory. Merge those facts only when reading or reporting them. Two workers writing their own `lastX` field in one `state.json` still share mutation. Separate `indexer-state.json` and `metrics-state.json` files do not.
3. Serialize access only when one shared write target is a real invariant. Use lockfiles, sequential phases, an actor with exclusive write authority, or atomic compare-and-swap. Treat "we need a lock" as a design smell to examine, not the default answer.
