---
name: "astack-tdd"
description: "Build features or fixes with failing tests at agreed seams. Use for test-first work, \"red-green-refactor\", or integration tests. Keep refactoring in review rather than the implementation loop."
metadata:
  astack-version: "0.1.0"
---

# Test-Driven Development

Use the red then green loop to build tests worth keeping.
Apply every section before and during each cycle.
These rules define useful tests, their seams, bad patterns and the loop itself.

Before code exploration, read the domain glossary when present.
Use `CONTEXT.md`, or `GLOSSARY.md` where the repo already uses that name.
Match its vocabulary in test names and interfaces.
Respect ADRs in the affected area.

## What a good test is

Test behavior through public interfaces.
Keep tests independent from internal structure so they survive a full implementation rewrite.
A name such as "user can checkout with valid cart" states a capability as a specification.
Use [tests.md](tests.md) for examples and [mocking.md](mocking.md) for mocking guidance.

## Seams: where tests go

A seam is the interface where a test observes behavior without accessing internals.
Put tests at seams rather than inside implementations.

Use only seams agreed before the test.
List proposed seams and confirm them with the user before writing tests.
For each seam, give one line on defects it catches and what it misses.
Ask "What's the public interface, and which seams should we test?"
This directs effort to critical paths and complex logic rather than every possible edge case.

In an unattended run, such as an implementer inside `/astack-implement-spec`, take seams from the specification or ticket.
Ask only when no seam is agreed and the user is available.

If the interface shape or seam placement is undecided, load `astack-codebase-design`.
Use its Module, Interface, Depth, Seam, Adapter, Leverage and Locality vocabulary.
Consult it as a reference rather than run it as a separate work session.

## Anti-patterns

- An implementation-coupled test mocks internal collaborators, calls private methods or verifies through a side channel. Direct database queries can bypass the tested interface. If behavior is unchanged but a refactor breaks the test, inspect that coupling.
- A tautological assertion computes its expectation the same way as production. Examples include `expect(add(a, b)).toBe(a + b)`, a manually derived equivalent snapshot, or a constant compared with itself. Use an independent known-good literal, worked example or specification as the expected result.
- Horizontal slicing writes all tests before all implementation. It commits to imagined structure before feedback from real behavior. Use vertical slices instead. Write one test, implement it, then use that result to choose the next test.

## Rules of the loop

- Write and run the failing test before the code. Add only enough implementation to pass. Do not anticipate future tests or features.
- Use one seam, one test and one minimal implementation in each cycle.
- Keep refactoring outside this loop. It belongs to review with `astack-code-review`, after the red and green implementation cycle.
