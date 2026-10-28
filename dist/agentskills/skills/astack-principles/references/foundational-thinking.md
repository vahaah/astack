# Foundational Thinking

Structural decisions preserve future options.
Decisions within the code preserve simplicity.

## Data structures first

Choose the data shape before writing logic.
Define core types early.
Trace every access pattern.
Choose structures that match the dominant paths.

At code level, remove repeated structure instead of abstracting every repeated line.
Types and data models should converge.
Three similar statements still beat a premature abstraction.
Prefer explicit code to clever code.
Test behavior and edge cases, not line counts.

## Concurrency

Before sharing state, ask "what happens if another actor modifies this concurrently?"
If the answer is not "nothing", isolate the state.

## Scaffold first

Do work first when it helps every later phase.
Ask "does every subsequent phase benefit from this existing?"
CI, linting, test infrastructure, and shared types are scaffold.
Put setup before features and tests before fixes.
Keep commits small and focused on one purpose.

Each increment should deliver a coherent abstraction or deepen an existing one.
Do not scatter a new capability across callers as special-case coordination.

Subtract before building the scaffold.
Remove dead code first.
Then lay the foundations.
