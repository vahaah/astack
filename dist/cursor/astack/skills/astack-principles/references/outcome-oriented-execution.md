# Outcome-Oriented Execution

Optimize for the intended end state that you can verify.
Do not preserve smooth intermediate states at the cost of that goal.

## Why

Keeping every intermediate step fully stable can create temporary compatibility code that becomes lasting debt.
Reach the target architecture.
Prove correctness at explicit verification boundaries.

## Rules

- Give the integrity of the end state priority over stability during the transition.
- Allow intermediate breakage only when it is planned, scoped, and reversible.

## Limits

- Use this for planned rewrites and migrations with explicit phase boundaries.
- Declare where temporary breakage is acceptable.
- Keep useful checks for the areas you actively change during migration.
- Require full static and runtime verification when the plan finishes.
