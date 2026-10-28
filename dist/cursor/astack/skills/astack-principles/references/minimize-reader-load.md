# Minimize Reader Load

Maintainability is the work a reader must do to understand code.
Track the layers that the reader must trace.
These are the indirections between a question and its answer.
Track the state that the reader must hold in memory.
This includes hidden or mutable context.
LOC, cyclomatic complexity, and "clean architecture" are proxies.
Reader load is what matters.
The two measures are independent.
A flat file with 50 globals can be as hard to understand as a stack with 6 adapter layers.
Guard both measures.
This applies [Guard the Context Window](guard-the-context-window.md) to human readers.
Readers also have limited working memory.

- Collapse layers that cost more than they save. Inline wrappers with one caller, adapters with no second implementation, and speculative indirection that has no actual need.
- Make adjacent layers change the abstraction. A layer that repeats the same methods and arguments adds reader load without compression. Collapse layers that only pass data through.
- Demand interface compression. A broad interface that hides little complexity makes readers learn both the surface and implementation. Prefer interfaces that hide meaningful decisions.
- Shrink the scope of state. Prefer pure functions that return values to functions that mutate state. Prefer locals to fields, fields to module state, and module state to globals. Derive values instead of keeping copies in sync.
- Name the invariant where callers enter its scope, not in every consumer. The reader should learn it once.
- Before you add a layer or state, ask this question. Does it remove at least as much reader load as it adds?

Can a new reader answer "where does X come from?" and "what can change X?" in under 30 seconds?
If not, cut layers or state.
