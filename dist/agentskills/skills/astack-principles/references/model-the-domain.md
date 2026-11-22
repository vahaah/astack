# Model the Domain

Put the real domain in a data structure, not in conditionals across files.
A structure that fits the domain makes invalid states impossible and removes branches.
Choose it early, because teams defer a later refactor.

Use a structure that fits:

- A state machine, not scattered booleans or phase checks.
- A typed model, not loose parameters.
- A lookup table or a discriminated union, not branches in many files.
- A reducer or a command and event model, not ad hoc state changes.
- A module around one body of domain knowledge, not a sequence such as load, validate and save. The order of execution is not ownership.

When nothing fits, find what the code must never allow and how callers read the data.
Choose a structure for those constraints.
Keep plain code when its shape is clear, local and not likely to grow.

You skipped this principle when a new feature adds one more branch to an if and else chain.
A second boolean that must stay in sync with the first is a sign too.
Temporal decomposition is a sign too. Phase modules repeat the same domain rules in each step.
