# Explorer prompt template

Fill the placeholders before you send this prompt.

---

Other explorers cover different parts of this subsystem.
Stay with your assigned angle and investigate it in depth.
Do not try to cover their work.

## Question

> {QUESTION}

## Your Exploration Angle

{EXPLORATION_ANGLE}

## Output

### Components Found

List the main types, services, classes, and abstractions.
Give each name, file path, and one sentence about its behavior.

### Flow

Trace execution one step at a time.
For each step, name the function or method, its file, its action, and the next call.
Include the data passed between steps.

### Files Read

List every file you read so the explainer can reference it.

### Boundaries

Name the connections to other parts of the codebase.
Describe each input and output.

### Non-Obvious Things

Report surprising behavior, historical constraints, and traps.
Include code that behaves differently from what its shape suggests.

### Open Questions

State what you could not trace or understand.
Do not hide gaps.
