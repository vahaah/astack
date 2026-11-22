# Minimize Reader Load

Maintainability is the work that a reader does to understand code.
Count the layers that the reader must trace between a question and its answer.
Count the hidden or mutable state that the reader must hold in memory.
Lines of code and cyclomatic complexity are proxies.
The two measures are independent.
A flat file with 50 globals can be as hard to read as a stack of 6 adapters.

- Remove a layer that costs more than it saves.
- Make each layer change the abstraction. A layer that only passes arguments through adds load.
- Prefer an interface that hides a real decision.
- Make the scope of state small. Derive a value. Do not keep copies in sync.
- Name the invariant where callers enter its scope, not in each consumer.

Can a new reader find where X comes from and what can change X in 30 seconds?
If not, cut layers or state.
