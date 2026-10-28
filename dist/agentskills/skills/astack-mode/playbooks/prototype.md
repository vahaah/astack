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

1. Name the decision that the prototype must make. A visual decision can concern layout, interaction, or density. An empirical fork can concern behavior, timing, or approach. If there is no decision, route to Feature instead of building a prototype.
2. Gather references when the design space is open. Search for prior art. Summarize themes, palettes, and layouts in a moodboard. Let the user choose directions before the build. Skip this when the direction is already set.
3. Build in an isolated scratch directory, separate from production source. For a visual decision, use vanilla HTML/CSS/JS or the lightest stack that renders the idea. Use CDN dependencies and a dev server with hot reload. For behavior or timing, use the smallest script that exercises the question. Use no production framework, tests, or abstractions.
4. When comparing alternatives, put them behind one switcher, such as buttons or a keypress. Label each variant. This makes [Exhaust the Design Space](../../astack-principles/references/exhaust-the-design-space.md) cheap.
5. Verify on the matching surface. For a visual decision, take a screenshot of each variant through the control skill. Drive its interaction. For behavior or timing, observe the result through timing logs, printed output, or the render. The observation is the test, not an assertion.
6. Present the alternatives, tradeoffs, and recommendation. Deliver the decision and prototype artifact, not code to ship. Give the chosen direction to Feature, or `architect` for its shape, before the real build.

## Reply

Report the variants, evidence, tradeoffs, recommendation, and scratch path.
For a visual decision, include screenshots.
For behavior or timing, include the observed output or timing.
State plainly that the prototype is throwaway.
