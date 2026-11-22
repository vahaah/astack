# Foundational Thinking

Structural decisions keep future options open.
Decisions inside the code keep it simple.

## Data structures first

Choose the data shape before you write logic.
Define the core types early, and trace each access pattern.
Remove repeated structure, but do not make an abstraction for each repeated line.

## Concurrency

Before you share state, ask what happens when a different actor changes it at the same time.
If the answer is not "nothing", isolate the state.

## Scaffold first

Do first the work that helps each later phase, such as CI, lint, test tools and shared types.
Ask whether each later phase gets a benefit from it.
