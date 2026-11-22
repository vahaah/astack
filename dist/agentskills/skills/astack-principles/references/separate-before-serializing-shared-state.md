# Separate Before Serializing Shared State

Before actors share mutable state, ask whether they need the same mutable object.
If not, remove the sharing.
When they must share it, serialize access with lock files, sequential phases or one owner.
Instructions and conventions are not concurrency control.

## Why

Concurrent writes make races that are intermittent and hard to reproduce.

## Procedure

1. Find the shared mutable state, such as a file that two actors write or a branch that both push.
2. Remove the shared write target by default. Give each actor its own file, key, branch or state folder. Merge their facts when you read them. Two workers that write their own field in one `state.json` still share it.

You skipped this principle when you add a lock and the actors do not need one object.
