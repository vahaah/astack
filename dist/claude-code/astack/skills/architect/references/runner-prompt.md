# Architect runner prompt

The orchestrator passes this file to every parallel Phase B runner.
It supplies the task, Phase A artifacts, isolated working directory and output path.
It also supplies absolute paths to architect's SKILL.md and the astack `skills/` directory.
Runners from another model family read skills through those paths.
Use a git worktree when available.
Otherwise use a separate directory for each runner under the sketch directory.
Keep candidates independent.

Produce one candidate design.
First read **architect** in full at the supplied path.
Follow that workflow.
A **<name>** principle is `principles/references/<name>.md` under the supplied astack skills directory.
Read each principle that you apply.
Return types, function signatures, a module map and a rationale.
Follow [rationale-template.md](rationale-template.md) for the rationale.

Apply these rules.
The orchestrator uses these axes to compare candidates and choose a base.

- Write caller usage first. Include README-style usage and two or three real call sites before types. Derive the sketch from them. Correct a conflicting sketch to match usage, rather than change usage to match the sketch.
- Start with data structures. Trace each dominant access pattern through the structure. If the design depends on adding a map, index or cache later, revise the structure now.
- Judge interface depth. Compare hidden capability with interface size. Prefer an interface that moves complexity into the callee, even with a harder implementation. Keep transport and wire types out of the public API. Parse them into domain types behind it.
- Examine shared state. If two actors can write it, ask what happens. Unless they have no effect on each other, default to separate state and merge at the read boundary. Apply **separate-before-serializing-shared-state**.
- Make module boundaries visible. Use `not implemented` errors for bodies and `// TODO` pseudocode for difficult logic. Use doc comments for intent and invariants. Types and signatures alone must show data flow from input to output.
- Encode invariants in types. Prefer types that prevent misuse, then runtime checks, then prose comments. Apply **encode-lessons-in-structure**.
- Validate at system edges and trust internal types, per **boundary-discipline**. Keep business logic in pure functions. Keep the shell thin.
- Keep one source of truth for each invariant. Derive other values instead of synchronizing copies.
- Make state transitions idempotent where applicable, per **make-operations-idempotent**. Examine a repeated operation and a crash partway through it.
- Keep call chains short. If a reader must trace more than three files, flatten the hierarchy. Apply **laziness-protocol** and **minimize-reader-load**.

Each runner uses a different model.
Produce the strongest design that your model can make.
Do not reduce its scope to anticipate the other candidates.
Differences help the orchestrator choose a base and useful additions.
An untested compromise would defeat that comparison.
