# Prototype

You own the design decision, not the code.
The prototype is a throwaway instrument.
Feature owns the real build.

This playbook reverses Laziness Protocol's smallest-change rule and the normal verification bar.
Choose speed over polish.
Code quality does not matter here.
Do not plan the prototype.
The rigor lies in choosing the right design cheaply.
Propose variations beyond the user's request.
Discard an approach and try another when useful.

When a person must judge the result, replace steps 3 to 5 with "Person-judged prototype" below.

1. Name the decision that the prototype must make. A visual decision can concern layout, interaction, or density. An empirical fork can concern behavior, timing, or approach. If there is no decision, route to Feature instead of building a prototype.
2. Gather references when the design space is open. Search for prior art. Summarize themes, palettes, and layouts in a moodboard. Let the user choose directions before the build. Skip this when the direction is already set.
3. Build in an isolated scratch directory, separate from production source. For a visual decision, use vanilla HTML/CSS/JS or the lightest stack that renders the idea. Use CDN dependencies and a dev server with hot reload. For behavior or timing, use the smallest script that exercises the question. Use no production framework, tests, or abstractions.
4. When comparing alternatives, put them behind one switcher, such as buttons or a keypress. Label each variant. This makes [Exhaust the Design Space](../../principles/references/exhaust-the-design-space.md) cheap.
5. Verify on the matching surface. For a visual decision, take a screenshot of each variant through the control skill. Drive its interaction. For behavior or timing, observe the result through timing logs, printed output, or the render. The observation is the test, not an assertion.
6. Present the alternatives, tradeoffs, and recommendation. Deliver the decision and prototype artifact, not code to ship. Give the chosen direction to Feature, or `architect` for its shape, before the real build.

## Person-judged prototype

Use this section when a person, such as the owner, judges the result.
Pick one branch from the question before you build.
When nobody can answer, pick logic for a backend module and UI for a page.
Write that assumption at the top of the prototype.

Logic answers whether a logic or state model is correct:

- Build one HTML file that opens with a double-click, with no framework or server.
- Write the question at the top.
- Keep the logic in one pure module with no DOM access, such as a reducer.
- Show all relevant state in labelled fields.
- Give each action a free-play button, and each scenario a tab of step buttons.
- Include a success path, a hard edge case and an illegal action, in the words of the domain.

UI answers how a page must look:

- Build 3 to 5 variants with different structures on one temporary route. Prefer an existing page.
- The URL parameter `?variant=` selects a variant. A fixed bottom bar and the `←` and `→` keys cycle the variants.
- Hide the bar in production.

Both branches follow these rules:

1. Mark the code as a prototype. Put it near its module or page, not in a scratch folder.
2. Make it run with one command, or with a double-click on its HTML file.
3. Keep state in memory. When the question needs persistence, use a scratch database named "PROTOTYPE, wipe me".
4. Skip polish, tests, abstractions and error paths.
5. Show the full relevant state after each action or variant switch.
6. Move the chosen design into real code. Keep the prototype on a `prototype/<name>` branch. Link that branch from the issue. Record the question and the verdict in the issue or a commit.

## Reply

Report the variants, evidence, tradeoffs, recommendation, and scratch path.
For a visual decision, include screenshots.
For behavior or timing, include the observed output or timing.
State plainly that the prototype is throwaway.
