---
name: "astack-principles"
description: "Use this skill for engineering principles across core design, architecture, verification, delegation, and meta structure. Read the reference file of each principle that applies."
license: "MIT"
metadata:
  astack-version: "0.1.0"
  source: "astack, adapted from pstack"
---

# Principles

Read the reference file in full for each principle that applies. Each bullet names when the principle applies and links to its file under `references/`.

## Core

- [Laziness Protocol](references/laziness-protocol.md). Use when you refactor, size a diff, or want to add a layer or an abstraction. Delete dead code first, and ship the smallest change that fixes the problem.
- [Foundational Thinking](references/foundational-thinking.md). Use before you write logic. Define the core types and data structures, separate the scaffold from the feature, and list shared state across workers.
- [Redesign from First Principles](references/redesign-from-first-principles.md). Use when you put a new requirement into an existing design. Shape the design as if that requirement were there from the start.
- [Attack the Premise](references/attack-the-premise.md). Use when two or more fixes with the same premise fail the same gate. List which actors hold the imbalance, and question the premise before the next fix.
- [Subtract Before You Add](references/subtract-before-you-add.md). Use when you order an addition, a refactor, or a rewrite. Remove dead code first, then build on the smaller base.
- [Minimize Reader Load](references/minimize-reader-load.md). Use when you review or shape code that is hard to read. Count the layers and hidden state, remove single-caller wrappers, and shrink mutable state.
- [Outcome-Oriented Execution](references/outcome-oriented-execution.md). Use on a planned rewrite or migration with phase boundaries. Move to the target architecture, and do not keep temporary compatibility layers.
- [Experience First](references/experience-first.md). Use on a product, UX, or scope decision. Put the user experience ahead of implementation convenience.
- [Exhaust the Design Space](references/exhaust-the-design-space.md). Use on a new interaction or an architectural call with no clear prior art. Build two or three options and compare them before you choose one.
- [Build the Lever](references/build-the-lever.md). Use on non-trivial repetitive or mechanical work. Build the script, codemod, or generator that does the work and proves the result.

## Architecture

- [Model the Domain](references/model-the-domain.md). Use when code branches often or repeats a shape check across files. Put the domain rules in a state machine, a typed model, a table, or a boundary parser.
- [Boundary Discipline](references/boundary-discipline.md). Use when you wire validation, error handling, or a framework adapter. Validate at system boundaries, trust internal types, and keep core logic pure.
- [Type System Discipline](references/type-system-discipline.md). Use when you design types or function signatures. Make invalid states impossible to construct, brand distinct primitives, and parse external input at the boundary.
- [Make Operations Idempotent](references/make-operations-idempotent.md). Use when you design commands, lifecycle steps, or loops that can retry. Make repeated runs reach the same state.
- [Migrate Callers Then Delete Legacy APIs](references/migrate-callers-then-delete-legacy-apis.md). Use when you replace an internal API. Update all callers and remove the replaced API together.
- [Separate Before Serializing Shared State](references/separate-before-serializing-shared-state.md). Use when concurrent workers can write the same file, branch, key, or row. Give each worker its own state before you add a lock.

## Verification

- [Prove It Works](references/prove-it-works.md). Use before you call a task done. Check the real artifact and its output directly, never a proxy or a compile check alone.
- [Fix Root Causes](references/fix-root-causes.md). Use when you debug. Reproduce the failure first, trace the symptom to its root cause, and fix the cause.
- [Sequence Work into Verifiable Units](references/sequence-verifiable-units.md). Use on multi-step edits and when you order commits and PRs. Split work into small units, verify each unit before the next, and order commits so the sequence is easy to review.
- [Test Behavior, Not Implementation](references/test-behavior-not-implementation.md). Use when you write or change a test. Call the public interface and compare the result with a literal value.
- [Explain the Number](references/explain-the-number.md). Use before you report or act on a measurement. Name what bounds the number, and rule out other causes with evidence.

## Delegation

- [Guard the Context Window](references/guard-the-context-window.md). Use when outputs, files, or searches are large. Send bulk reads and sweeps to subagents, and return only concise notes to the parent session.
- [Never Block on the Human](references/never-block-on-the-human.md). Use on reversible work. Carry out the next reasonable step, show the result, and stop only at an owner gate.

## Meta

- [Encode Lessons in Structure](references/encode-lessons-in-structure.md). Use when the same instruction or mistake repeats. Turn the rule into a lint, a type, a test, or a script.
