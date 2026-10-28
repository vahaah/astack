---
name: prototype
description: "Build a temporary prototype to answer a design question. Use to judge a state model, business logic or alternative UI designs."
metadata:
  origin: mattpocock-skills
---

# Prototype

A prototype is temporary code that answers one design question.
Choose its shape from that question.

## Pick a branch

Find the question in the user request and surrounding code.
Ask the user when available if it remains unclear.

- For "Does this logic or state model feel right?", follow [LOGIC.md](LOGIC.md). Build one shareable HTML file with free-play buttons and tabbed walkthroughs. It lets a non-developer exercise difficult state-machine cases.
- For "What should this look like?", follow [UI.md](UI.md). Build structurally different variants on one route. Switch through a URL search parameter and floating bottom bar.

The branches produce different artifacts, so choose before building.
If the user is unavailable and the question remains ambiguous, use the surrounding code.
Prefer logic for a backend module and UI for a page or component.
State that assumption at the top of the prototype.

## Rules that apply to both

1. Mark the code as a prototype from the start. Place it near its intended module or page so the context is clear. Give it a name that distinguishes it from production code. Follow existing routing conventions for temporary UI routes.
2. Make it straightforward to run. A UI prototype uses one task-runner command, such as `pnpm <name>`, `python <path>` or `bun <path>`. A logic demo opens through a double-click on its HTML file.
3. Keep state in memory by default. Persistence can be the question under test, but must not become an incidental dependency. If the question needs a database, use a scratch database or local file named "PROTOTYPE, wipe me".
4. Skip polish, tests, abstractions and error handling beyond what execution needs. Learn from the prototype before building production quality.
5. Show the full relevant state after every logic action or UI variant switch.
6. After validation, put the decision into real code. Preserve the prototype as a primary source on a temporary `prototype/<name>` branch outside main. Link that branch from the implementation issue. Record the verdict and its question in the issue or a commit. Main keeps only the validated decision.
