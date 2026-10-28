# Migrate Callers Then Delete Legacy APIs

After you choose a new API as the right design, migrate its callers in one refactor wave.
Remove the old API in that same wave instead of keeping a compatibility layer.

## Rules

- Do not keep legacy API paths only because internal callers still exist.
- Inventory the callers. Migrate them. Delete the old API immediately.
- Treat temporary adapters as exceptions. Set a time limit for them. Do not make them the default architecture.
- Update tests to assert the new contract. Delete tests that only protect implementation details from before the refactor.

## Conditions

Apply this principle when all of these conditions hold:

- No external users depend on backward compatibility.
- The project can absorb coordinated breaking changes.
- The new API is part of a simplification or refactor initiative.

Keeping both APIs creates two paths for the same work.
It slows cleanup and makes the codebase grow without removing old paths.
