# Logic Prototype

Build one self-contained HTML demo that lets people drive a state model with buttons.
Use it for business logic, state transitions and data shapes that need concrete cases for judgment.
The file needs no installation and can be shared with designers, PMs and domain experts.
Use their domain language rather than code terms.

## When this is the right shape

Use this branch for questions such as:

- Does the state machine handle X followed by Y?
- Can the data model represent a particular case?
- Does the proposed API behave as callers expect?
- What happens when a person presses buttons and watches state change?

For appearance questions, use [UI.md](UI.md) instead.

## Process

### 1. State the question

Before code, state the model and question in one visible paragraph at the top of the demo.
Do not leave the explanation only in a comment.
The explicit question lets the user judge the answer now or when returning later.

### 2. Isolate the logic in a portable module

Put the logic that answers the question in one `<script>` block.
Make it a small, pure module that can move into the real codebase.
The surrounding page is temporary, while validated logic can survive it.
Choose the shape that fits the question:

- A reducer, `(state, action) => state`, fits discrete events and one state value.
- An explicit state machine fits questions about which actions are currently legal.
- Pure functions over a plain data type fit transformations without an implicit current state.
- A class or module with clear methods fits logic that owns ongoing internal state.

Do not choose a shape only because it is easiest to connect to a page.
Keep DOM access, `document` and button handlers out of the logic module.
The page calls the module, without calls back into the page.
This separation lets the validated reducer, machine or functions move into the real module independently.

### 3. Build the shareable HTML file

Use one file with inline HTML, CSS and JavaScript.
Use no framework, bundler or server.
The file must open by double-click and remain usable when shared by email.
Write labels for non-developers in domain language.
Explain actions and state in plain words.

Lay out these parts from top to bottom:

1. Show a title and one-line explanation of the question from step 1.
2. Render all relevant current state in labeled fields rather than raw JSON. Update it after every click. Highlight changes when that helps the reader.
3. Keep one free-play button for each action available at all times. Each click dispatches the action and renders state again.
4. Give each guided scenario its own tab. Describe its initial situation and what to watch. Put ordered action buttons below that description. Each step button performs its action and advances the walkthrough. Starting a walkthrough resets known initial state for repeatability.

Include a successful path, a difficult edge case and an attempted illegal action.
Prefer cases that are hard to judge without trying them.
Use clear typography, generous spacing and one accent color.
Use no animations or other effects that distract from state and actions.

### 4. Hand it over

Send the file to the user or open it for them.
They can try the walkthroughs and free-play controls when available.
Feedback about an impossible action or unexpected result reveals flaws in the idea.
Add actions and scenarios when the user needs them.

### 5. Capture the answer and the prototype

Record the answer and preserve the prototype as [SKILL.md](SKILL.md) directs.
Move the validated reducer, machine or functions into the real module.
Keep the HTML shell on the temporary branch as the primary source.
Its single-file format keeps that record runnable.

## Anti-patterns

- Do not add tests to the prototype.
- Do not connect it to a real database unless persistence is the explicit question. Otherwise use in-memory state.
- Do not add generality for possible future requirements. Answer one question.
- Do not mix the logic with DOM access or button handlers. Keep the page as a thin caller of the portable module.
- Do not add a framework, bundler or server. Preserve the single-file, double-click workflow.
- Do not ship the HTML shell to production. Keep only the validated logic module.
