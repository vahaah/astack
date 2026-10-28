---
name: "astack-how"
description: "Explain code behavior, architecture, ownership, or placement. Use for walkthroughs and teaching requests. Use why for design reasons."
disable-model-invocation: true
metadata:
  astack-version: "0.1.0"
---

# How

Explain how code works and where its responsibilities belong.
Give a senior engineer enough context to work in the subsystem without narrating every source line.
For a teaching request, read `references/teach.md` and combine the `how` and `why` results.

Use read-only Agent subagents with `subagent_type: general-purpose`.
Tell each one to read code and run read-only commands without edits.
Use the `how explorer` role from `astack-models.md`, with `haiku` as its default.
Use the `how explainer` role for each explainer, with `opus` as its default.

Set `model` to the configured role value.
Use the default when the rule or role line is missing.
For `auto` or `inherit-parent`, omit `model`.
If the Agent tool rejects a value, use the default and report the fallback.
Follow the effort rules in `../astack-mode/SKILL.md`.

A nested run adds another subagent level.
Claude Code permits three levels and gives no Agent tool to the third level.
Without that tool, do the explorer and explainer work yourself, in order.
Report that fallback.

## 1. Choose the scope

For an ambiguous question, state your interpretation and start exploration.
The user can redirect it.

For one module, one small helper, or one narrow question, use one explainer.
Build its prompt from `references/explainer-prompt.md` without the explorer-findings section.
It explores and explains in one pass.
Then go to step 4.

For several files, services, or a full architecture question, continue with step 2.
When uncertain, use the simple path.

## 2. Explore a complex scope

Split the question into 2 to 4 distinct angles.
Spawn all explorers in one message.
Fill `references/explorer-prompt.md` with the question and assigned angle for each one.

## 3. Combine the findings

Wait for every explorer's result.
Spawn one explainer with `references/explainer-prompt.md` and all explorer findings.

## 4. Present the explanation

Present the explainer's output.
Make light edits for clarity or conversation context.
Do not rewrite it substantially.

Use the template's applicable sections: `Overview`, `Key Concepts`, `How It Works`, `Where Things Live`, and `Gotchas`.
Omit a section when it does not apply.
