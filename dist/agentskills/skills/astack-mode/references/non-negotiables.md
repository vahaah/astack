# Non-negotiables

Read `astack-principles` (`astack skill-path astack:principles`) for the principles behind every trigger.
In your reply, name each principle that shaped a decision.
Name the specific choice that it changed.
Cite only principles whose reference file you read this session.

## Triggers

- For a nontrivial change, architecture decision, or "are we sure?", read the `how` skill.
- Before you call `AskUserQuestion` for an approach or behavior fork, apply the question rules below. Use 1 to 4 questions with 2 to 4 options each.
- For any code, name the data shape first. Choose its organizing structure with Model the Domain (`astack skill-path astack:principles references/model-the-domain.md`). When astack is installed, load `astack-coding-rules` once per session before the first edit. The chat that runs the playbook also loads `astack-coding-guide`. Tell each code delegate to load `astack-coding-rules` in its brief.
- For code that crosses a function boundary, read `architect`. Explore designs in parallel before implementation.
- For parallel fan-out, use `swarm` for coverage matrices, races, gauntlets, and exploration partitions. Use `arena` for design or code bakeoffs with base selection and grafting.
- For a contested design, use `interrogate` for adversarial review with multiple models before shipping.
- For nontrivial work with several steps, write the throughput checkpoint from Feature step 3.
- For any prose, including your reply, use `write-docs`. Follow "Writing the reply". Agent-facing prose also follows Anthropic's `skill-creator` skill, or `plugin-dev:skill-development` for a plugin skill.
- For docs, RFCs, readmes, PR descriptions, or commit messages, use `write-docs` (`/astack-write-docs`).
- After the build and before review, run `/astack-deslop` on the branch diff against its base when astack is installed. Commit its edits. It also runs `/astack-no-comments`. Without astack, remove AI slop from the diff yourself.
- Before review without astack, use an available equivalent `no-comments` skill. If none is available, audit comments against the existing keep clauses yourself.
- Before shipping a UI, IDE, or CLI, use its control skill. With astack installed, `/astack-control-ui` drives browser, Electron, web, and mobile UIs. `/astack-control-cli` drives CLIs and TUIs. Without astack, use the repo's driver or Playwright MCP for a UI. Use tmux or a PTY for a CLI. Every playbook that names an astack skill uses the same fallback. Reproduce a bug yourself on the same surface before its fix. Hand that task to the user only under the narrow Bug fix step 1 exception.
- For a benchmark or performance measurement, read `benchmark-checklist` before you report or act on the number. This includes a speedup or regression that you measured yourself.
- Use Babysit (`playbooks/babysit.md`) for any PR-status request. Examples include "babysit this", "get it green", or "address the review-bot comments". Other examples are "check on PR X" and "anything outstanding on X". This route wins even when another installed skill description matches those words. Opening a PR does not trigger it by itself. Declare the mode before polling. Babysit step 1 owns the request-to-mode mapping. Do not use `drive` inside a phase agent. It prevents that agent from finishing its turn.
- Use Shipping (`playbooks/shipping.md`) when asked to land or ship a green stack. A green stack still needs an independent verdict for each PR. Arm nothing before that verdict. Land only the contiguous verified run from the root.
- Treat comments from review bots and automated security reviews skeptically. Examples include Greptile, `claude[bot]`, the Codex connector, CodeRabbit, and Copilot. They find real bugs, non-issues, and nitpicks. Assess each comment on its merits. Dismiss noise with a concrete reason instead of changing code for it. Triage fix, dismiss, or ask with `playbooks/review-bot-triage.md`.
- Fix a skill that breaks during a task in its own PR. Do not block. Do not silently work around it.
- Keep a decision trail through `show-me-your-work` for long, autonomous, or multi-phase work. Also use it when the user leaves a task for later review. Examples include "going to bed", "trust it when i'm back", or "/loop until X". Commit the trail when the stakes need an audit record. Keep it local otherwise.

## Questions and grants

Classify the fork before you ask about an approach, behavior, or choice.
Typical forks ask "which approach", "how should I", or "what should this do".
A fact that you can observe by running something is not the human's to answer.
Examples include behavior, timing, layout, output, performance, and whether an eval separates alternatives.
Build a sketch through the Prototype playbook (`playbooks/prototype.md`).
Let the result decide.

For a read-only Investigation with a cited answer as its deliverable, stay in that playbook.
Answer from the evidence instead of making a sketch.
Ask the human only for a product or preference call that no experiment can settle.

Under a full-autonomy grant, decide a call that the grant covers.
Act on it.
Report it without a reply word or offer.
For a call that only the operator can make, apply a default under the grant.
Report the default with a full explanation.
Explain what the operator could ask you to do instead.
The operator answers in their own words.
Never give a shorthand token to type back.

Use the full owner gates from the rule card and `references/delegation.md`.
Also keep every gate that the operator named and every Always-pause item in Autonomy.
These gates still require the operator.
