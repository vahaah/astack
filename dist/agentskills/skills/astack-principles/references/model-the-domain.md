# Model the Domain

Encode the real domain in a data structure instead of scattering it across conditionals.
A structure that matches the domain makes invalid states unrepresentable and removes branches.
Choosing it when you write the code is cheap.
Recovering it later needs a refactor and gets deferred.

Use a structure that fits:

- A state machine instead of scattered booleans, phases, or lifecycle checks.
- A typed model instead of loose parameters or repeated shape assumptions.
- A map, registry, lookup table, or discriminated union instead of branching spread across files.
- A reducer or command/event model instead of ad hoc state mutations.
- A module organized around one body of domain knowledge instead of a sequence such as load, validate, transform, and save. Execution order is not ownership.
- A small module interface that gathers repeated behavior, ownership, or invariants.
- A queue, cache, index, graph, tree, or normalized collection where the access pattern calls for it.
- Any other structure that fits. When none fits, identify what the code must never allow. Find how callers read the data. Then choose a structure that represents those constraints and access patterns.

Do not force an abstraction.
Prefer boring code if the current shape is already clear, local, and unlikely to grow.
Question an abstraction that adds indirection without removing branches, duplicate rules, invalid states, or lifecycle risk.

You skipped this principle when a new feature adds another branch to an existing if/else chain.
A second boolean that must stay in sync with the first is another sign.
Temporal decomposition also signals the problem.
Modules named for phases repeat the same domain rules across steps.
