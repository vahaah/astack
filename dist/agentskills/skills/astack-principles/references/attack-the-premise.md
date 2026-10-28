# Attack the Premise

When two or more fixes share a premise and fail the same gate, question the premise before another fix.

## Why

Each failure under a shared premise is evidence about that premise.

## Procedure

- Write the premise down. It is the one sentence that every failed fix assumed.
- Take a census before the next fix. Count the imbalance per actor. The census shows which actors hold the imbalance, not how large it is. Write a script that you can rerun, as [Build the Lever](build-the-lever.md) describes.
- Read the skew. If the same few actors hold most of the imbalance on every run, something assigns them that role. Find what assigns the role. That assignment is the next "why" in [Fix Root Causes](fix-root-causes.md).
- Remove the asymmetry instead of compensating for it, as the [Laziness Protocol](laziness-protocol.md) says. Rotate the role between actors, randomize its assignment, or move it. Make sure no actor holds the role on every run. A return path, shared pool, batched hand-off, or periodic rebalance leaves the assignment in place and adds work on every run.

## Stop conditions

- Do not start the next fix before you record the premise and create the census.
- If the census is even across actors, the premise is not the cause. Look for the cause elsewhere. Keep the census as evidence.

[Redesign from First Principles](redesign-from-first-principles.md) rebuilds a design around a new requirement.
This principle questions a fact that the current design assumes.
