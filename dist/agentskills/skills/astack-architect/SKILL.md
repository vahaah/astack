---
name: "astack-architect"
description: "Sketch types, signatures and module structure before implementation. Use for /astack-architect, \"architect this\", \"design this\", or substantial work that needs a design first. Compare model perspectives, then follow the chosen sketch during implementation."
license: "MIT"
metadata:
  astack-version: "0.1.0"
  source: "astack"
  disable-model-invocation: "true"
---

# Architect

Only the user can invoke the composed astack skills by name.
Read each SKILL.md at its given path and follow it from this thread.
Principle references live at `../astack-principles/references/<title>.md`.
Read each principle in full when you apply it.

Sketch types, function signatures, class shapes and module boundaries before implementation.
Use `not implemented` bodies and pseudocode.
Compare perspectives from several models.
Then implement the chosen sketch.

## Start

Before you start, open a task list with one entry for each phase:

1. Ground
2. Sketch
3. Agree
4. Implement
5. Scrap

## Phase A: Ground the problem

Read the **how** skill at `../astack-how/SKILL.md`.
Follow it on each relevant subsystem.
Produce its architectural explanation of every system that the new code touches.
A list of files does not meet this requirement.

If the design changes ownership or layering, read **why** at `../astack-why/SKILL.md`.
Follow it on the existing shape.
Use the rationale as a design constraint.

Skip Phase A only for greenfield work with no surrounding system to integrate.

## Phase B: Sketch

Read **arena** at `../astack-arena/SKILL.md`.
Follow it with the design-sketch task and the Phase A artifacts.
Give every runner `references/runner-prompt.md` as its prompt.
Fill in this skill's absolute path and the astack skills directory, `..`.

Use the `architect runners` line in `astack-models.md` instead of `arena runners`.
If the rule or line is missing, use `opus` and `codex`.
Follow arena Phase A for aliases, external runners and unknown entries.

Require at least two candidates with different structures before synthesis.
Do this even when the first candidate looks sufficient.
Apply **exhaust-the-design-space** to the whole shape rather than small fixes inside one shape.

Screen every candidate against [references/design-red-flags.md](references/design-red-flags.md) before synthesis.
Assume the next contributor sees only the files it opens.
It copies nearby examples and takes the shortest path that compiles.
Prefer a design where a locally correct change is also correct across the repo.

Compare viable candidates on interface depth.
Prefer more hidden complexity behind a smaller, simpler public interface.
A rich interface can concentrate capability and shorten call chains.

Arena returns one synthesized design package.
Put its decision in the rationale's "Synthesis decision" section.

## Phase C: Agree (opt-in)

By default, proceed directly to implementation with the synthesized design.
There is no human checkpoint.

Pause for sign-off only when the invoker explicitly requests a checkpoint.
Examples are "/astack-architect with checkpoint" and "stop and show me before implementing".
Then show the synthesized design to the user.

The synthesis can have its own commit with either route.
This follows the "scaffold first" mode of **foundational-thinking**.
Planned breakage within scope during implementation is allowed by **outcome-oriented-execution**.
For an adversarial review before implementation, read **interrogate** at `../astack-interrogate/SKILL.md`.
Follow it on the synthesized sketch.

If the user rejects the shape at a checkpoint or later, treat that feedback as Phase A evidence.
Repeat Phase A and Phase B before you write more code.

## Phase D: Implement against the sketch

Replace `not implemented` bodies with code.
Replace pseudocode with logic.
The synthesized sketch is the contract.
Report deviations rather than absorb them silently.
For an unexpected parameter, ask whether the sketch is wrong, a requirement is missing, or implementation exceeds the requirement.

## Phase E: Scrap when the architecture is wrong

Discard a sketch when implementation repeatedly needs workarounds that it cannot support.
Apply **redesign-from-first-principles** and **fix-root-causes** instead of adding fixes to the wrong design.

Look for a repeated pattern:

- The same workaround appears across unrelated code.
- Several unrelated edge cases need special branches.
- Types need `any`, casts, or optional fields that callers always set.
- Implementation needs a lock for state that the sketch treated as private.
- Callers must know the abstraction's internals.
- Two independent Phase D deviations have the same shape.

Use judgment.
A few edge cases do not prove that the architecture is wrong.
Some problems have complex data even with a sound design.

When you discard the sketch:

1. Follow **how** again on the code built so far.
2. Redesign with the new constraints as original assumptions, per **redesign-from-first-principles**.
3. Apply **subtract-before-you-add**. Make the new sketch smaller before you extend it.
4. Return to Phase B and follow arena again.

## Outputs

Write caller usage first.
Derive the type sketch from that usage.
For a small change, produce one file with new types and signatures.
For larger work, produce a module map and type definitions.
Include a rationale that follows `references/rationale-template.md`.
It includes the usage sketch and the synthesis decision.
