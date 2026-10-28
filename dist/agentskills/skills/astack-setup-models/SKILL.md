---
name: "astack-setup-models"
description: "Configure astack models and reasoning budgets by role. Use for /astack-setup-models, model selection, or budget changes."
license: "MIT"
metadata:
  astack-version: "0.1.0"
  source: "astack"
---

# Set up models

Write the user rule `${CLAUDE_CONFIG_DIR:-~/.claude}/rules/astack-models.md`.
Claude Code loads it in every session.
Its role values override the astack skill defaults.

## Accepted values

- A Claude alias: `opus`, `sonnet`, `haiku`, or `fable`.
  The Agent call sets that `model`.
- `inherit-parent` or `auto`.
  The Agent call omits `model` and uses the parent chat model.
- An external seat: `codex`, `codex:<model>`, or `cursor-agent:<model>`.
  Follow `../astack-arena/references/external-seats.md` for that CLI.
  Bare `codex` uses its configured default model.

External seats are valid only for `arena runners`, `architect runners`, `interrogate reviewers`, and `arena cross-judge pool`.
Every other role runs as a Claude subagent with the session's tools.
The `why` and `reflect` roles need MCP access.
Code roles need the astack agents.

## 1. Detect available models

Read the Agent tool's `model` enum for the Claude models available in this session.
Use that enum as the source.

Check each external CLI and record it only after a working run:

- Run `command -v codex`.
  Check login with `codex exec -s read-only --skip-git-repo-check "Reply OK"`.
  Read the default from the `model` line in `~/.codex/config.toml`.
- Run `command -v cursor-agent`.
  Check login with `cursor-agent status` and list models with `cursor-agent models`.

If detection cannot find a requested model, ask the user for its name.
Never write an external value without a successful run.
`inherit-parent` and `auto` are always valid.

## 2. Read current choices

Start from the default role map in step 5.
If the rule already exists, read its `# budget` line and role values as the current choices.
Drop a role absent from the step 5 map, such as retired `how critics`.
Mark a value outside the accepted forms as needing a choice.
A model slug from another tool is not a Claude alias.

## 3. Choose the budget and roles

### Ask for the budget

Prefer AskUserQuestion over free text.
Show the current budget if the rule records one.
Without a rule, explain that `large` matches the skill defaults.
Offer these exact labels:

- `unlimited — max reasoning`
- `large — xhigh reasoning`
- `medium — high reasoning`
- `small — medium reasoning`

### Apply the budget

Build the working table from skill defaults.
On a later run, keep role overrides, including values, lists, `inherit-parent`, and `auto`.
The budget sets target effort to `max`, `xhigh`, `high`, or `medium`.

Claude and `codex` values contain no effort token, so their values stay unchanged.
Pass target effort through the Agent call's `effort` for a Claude seat.
Pass `-c model_reasoning_effort=<level>` for a codex seat.

For a `cursor-agent:<model>` slug with an effort suffix, replace that token with the target.
The token is last, or immediately before a trailing `fast`.
The ladder is `max` > `xhigh` > `high` > `medium` > `low`.
If the result is not listed, use that family's highest listed effort at or below the target.
If none fits, mark the role as needing a choice.

If step 1 found no working codex, replace each `codex` default with `sonnet`.

### Show the role map

Show every role and its value.
Mark values outside the detected set as needing a choice.
List every role that step 2 dropped.

Ask whether to accept the map or change specific roles.
Offer detected values, `inherit-parent`, and `auto`.
Explain that both aliases use the parent chat model.
Prefer AskUserQuestion.
It accepts at most four options and adds Other for the rest.

Panel roles use lists.
Each entry starts one seat, including alias entries, so list length sets the count.
`arena cross-judge pool` is a list too.
Arena chooses one entry from a different family than the parent when possible.
For a Claude parent, choose an available external seat.
`swarm workers` sets worker defaults unless a race or comparison assigns a model to an arm.

## 4. Validate choices

Require each Claude value to appear in the Agent tool's `model` enum.
Require each external value to have passed step 1.
`inherit-parent` and `auto` always pass.
If a choice is unavailable, stop and ask again.

## 5. Write the rule

Write plain Markdown without frontmatter so the rule loads in every session.
Include the selected `# budget` label and target effort.
Use the mode's exact role labels below.
Replace the whole file on each run so repeated runs stay idempotent.

```
# pstack model configuration. astack skills read these lines; nothing else does.
# One line per role. Delete a line to fall back to the skill default.
# `inherit-parent` or `auto` as a value: the role runs on the parent chat model (omit Agent `model`). Alias entries in a panel list still count toward its fan-out.
# External seats (codex, codex:<model>, cursor-agent:<model>) are valid only on the panel lines and the cross-judge pool.
# budget: large (xhigh)
feature, refactoring: sonnet
bug-fix: sonnet
perf-issue: sonnet
hillclimb: sonnet
judgment and prose: opus
hardest tasks: opus
how explorer: haiku
how explainer: opus
why investigators: sonnet
why synthesizer: opus
reflect tooling: sonnet
reflect judgment, divergent, synthesizer: opus
arena runners: opus, codex
arena cross-judge pool: codex, opus
swarm workers: sonnet
architect runners: opus, codex
interrogate reviewers: opus, codex
```

## 6. Confirm the result

Report that the rule was written and applies to new sessions.
A later run of this skill updates it.

If `CLAUDE_CODE_EFFORT_LEVEL` is set, Claude Code runs all subagents at that level.
The Agent tool then has no `effort` parameter.
The budget affects external seats only.
Report that limit and name the variable.
`echo $CLAUDE_CODE_EFFORT_LEVEL` shows its value.

## 7. Offer verification when useful

Check for a `.claude/skills/verify-*` skill or an existing real-app driver.
If none exists, offer `/astack-create-verification-skill` once.
Explain that it creates a local skill to drive the app as a user and prove changes.

On acceptance, read `../astack-create-verification-skill/SKILL.md` and follow it.
On refusal, continue without another offer.
