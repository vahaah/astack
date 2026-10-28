# Code Quality Review

Apply this lens alongside the rubric.
Judge implementation quality, maintainability, abstractions and codebase health strictly.
Look beyond local cleanup for structural changes that preserve behavior while removing substantial complexity.

## Core Prompt

Use this baseline:

> Audit the current branch's code quality in depth.
> Rethink its structure while preserving behavior.
> Improve abstractions, modularity, brevity and legibility.
> Propose wider restructuring when a clear simplification justifies it.
> Verify the reasoning with care and thorough evidence.

## Dimensions

Apply each relevant dimension:

0. Search for substantial structural simplification. Look for a different shape that removes branches, helpers, modes, conditions or layers. Prefer deletion of complexity to its redistribution. Use the existing architecture more effectively where that can simplify the change.
1. Treat growth from below 1k lines to above 1k as a strong smell. Prefer helpers, subcomponents or modules where they create a better structure. Ask whether decomposition must precede the change. Waive the concern only for a compelling structural reason and a clearly organized result.
2. Challenge scattered special cases and ad hoc branches in existing code. Treat unrelated conditional additions as a design issue. Prefer a dedicated helper, state machine or module when it gives the logic a coherent home.
3. Seek a cleaner design even when behavior already works. Prefer changes that remove moving parts to those that spread the same complexity elsewhere.
4. Prefer direct, predictable code. Question brittle mechanisms and generic machinery that hides simple data assumptions. Flag thin abstractions, identity wrappers and pass-through helpers that add layers without clarity.
5. Review type and system-edge design when it affects maintainability. Question unnecessary optionality, `unknown`, `any` and heavy casting. Prefer explicit typed models to ad hoc objects. A silent fallback can hide an unclear invariant that needs an explicit model or validation point.
6. Keep logic in its canonical package, service or module. Reuse existing helpers. Flag feature logic in shared paths and implementation details exposed through APIs. Do not accept drift when a clear existing home fits.
7. Question needless serialization of independent work and non-atomic related updates. Prefer parallel work when independence permits it. Prefer atomic updates when separate writes can leave partial state. Flag obvious orchestration complexity without focusing on tiny optimizations.

## Output Expectations

Prioritize structural regressions and missed simplifications first.
Then report tangled branching.
Next report system-edge, type and file-size concerns.
Finish with smaller modularity and legibility issues.

## Approval Bar

Working behavior alone does not justify approval.
Treat these as presumptive blockers unless the author gives an adequate reason:

- A different structure can delete substantial incidental complexity that the PR retains.
- A file grows from below 1000 lines to above 1000.
- Ad hoc branches complicate an existing flow.
- Feature checks spread across shared code.
- An unnecessary abstraction, wrapper or cast-heavy contract adds complexity.
- Code duplicates a helper or puts logic outside a clear canonical home.

When the author cannot justify these choices, give explicit, actionable feedback for a cleaner decomposition.

## Review Tone

Be direct and serious about quality without being rude.
Do not reduce major maintainability problems to mild suggestions.
State when implementation adds complexity or misses a substantial simplification.
Do not offer a small rename when the actual defect is structural.
