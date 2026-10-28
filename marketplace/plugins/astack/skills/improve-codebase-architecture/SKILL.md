---
name: improve-codebase-architecture
description: "Find codebase deepening opportunities and present them in an HTML report. Then grill the candidate that the user chooses before planning implementation."
disable-model-invocation: true
---

# Improve Codebase Architecture

Find architectural friction and propose deepening opportunities.
These refactors turn shallow modules into deep modules to improve testability and agent navigation.
Use the project's domain model and the shared design vocabulary:

- Load `astack:codebase-design` with the Skill tool. Use Module, Interface, Depth, Seam, Adapter, Leverage and Locality as it defines them. Apply its deletion test, interface testing rule and two-adapter rule. Do not replace these terms with "component", "service", "API" or an unspecified "boundary".
- Use domain terms from `CONTEXT.md` to name seams. Respect decisions in `docs/adr/` instead of asking the same questions again.

## Process

### 1. Explore

Choose the scope before scanning.
Deepening has more value where future changes are likely.
Give recently changed code extra weight.
Use a module, subsystem or problem area that the user names.
Then skip scope inference.

Otherwise, read a substantial stretch of `git log --oneline`.
Find recurring files and areas, and inspect those first.
Widen the search when history has no clear concentration.

Read the domain glossary and relevant ADRs first.
Use `CONTEXT.md`, or `GLOSSARY.md` where the repo already uses that name.
Then spawn an Agent with `subagent_type: "astack:explorer"` to explore the codebase.
Use observed friction rather than a rigid checklist.
Look for these conditions:

- One concept requires tracing many small modules.
- An interface is nearly as complex as its implementation.
- Pure functions exist for tests, but real bugs occur in their callers without locality.
- Coupled modules expose details across seams.
- Code lacks tests or is hard to test through its interface.

Apply the deletion test to a suspected shallow module.
Ask whether its removal concentrates complexity or only moves it.
A concentration indicates a deepening opportunity.

### 2. Present candidates as an HTML report

Write one self-contained HTML file outside the repo.
Use `$TMPDIR`, with `/tmp` as fallback, or `%TEMP%` on Windows.
Write `<tmpdir>/architecture-review-<timestamp>.html` so each run has a new file.
Open it with `xdg-open <path>`, `open <path>` or `start <path>` for the host OS.
Give the user its absolute path.

Use Tailwind through its CDN for layout and styling.
Use Mermaid through its CDN for graphs, dependencies and sequences.
Use custom CSS or SVG for mass diagrams, cross-sections and collapse animations.
Choose the form that explains each structure.
Give every candidate a before-and-after visualization.
Both CDNs need network access.
Offline, the report has neither styles nor diagrams.

Each candidate card includes:

- Files and modules involved.
- The current architectural problem.
- A plain explanation of the proposed change.
- Benefits in locality, leverage and tests.
- Side-by-side custom diagrams of the shallow and deepened shapes.
- A recommendation badge of `Strong`, `Worth exploring` or `Speculative`.

End with "Top recommendation", naming the first candidate to tackle and why.
Use `CONTEXT.md` domain terms and `/astack:codebase-design` architecture terms.
For a defined Order concept, say "Order intake module" rather than "FooBarHandler" or "Order service".

Propose an ADR conflict only when real friction justifies reconsidering the decision.
Mark the conflict clearly in its card.
For example, name ADR-0007 and explain why reopening it is justified.
Do not list theoretical refactors that existing ADRs prohibit.
Follow [HTML-REPORT.md](HTML-REPORT.md) for the scaffold, diagrams and style.

Do not propose interfaces yet.
After writing the report, ask "Which of these would you like to explore?"

### 3. Grilling loop

After the user chooses a candidate, load `astack:grilling` with the Skill tool.
Explore constraints, dependencies, module shape, contents behind the seam and surviving tests with the user.
Load `astack:domain-modeling` as decisions settle.
Keep the domain model current during the conversation:

- Add a new module concept to `CONTEXT.md` when you name it. Create the file only when needed.
- Update a fuzzy term in `CONTEXT.md` as soon as the conversation resolves it.
- If the user rejects a candidate for a lasting reason, offer an ADR. Ask whether to record it so future reviews avoid the same proposal. Offer only when future readers need the reason. Skip temporary or self-evident reasons.
- For alternative interfaces, load `astack:codebase-design` and use its design-it-twice pattern.

When the chosen candidate is worth building, pass it to `/astack:plan` when that skill is available.
It designs the interface through `/astack:architect` and plans the change.
If plan is unavailable, suggest `/astack:to-spec` when available.
