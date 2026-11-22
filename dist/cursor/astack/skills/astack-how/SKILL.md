---
name: "astack-how"
description: "Explain how code works, its architecture, its owners, or where a change belongs. Use for walkthroughs and teaching requests. Use why for design reasons."
disable-model-invocation: true
---

# How

Explore the codebase to answer a "how does X work?" question.
For an ambiguous scope, state your interpretation and start.
The user can redirect it.

## 1. Explain

Start one read-only Agent subagent with `subagent_type: general-purpose`.
It explores and explains in one pass.
Read the `judgment and prose` role line from `astack-models.md`, and set `model` to its value.
With no line, or for `auto` or `inherit-parent`, omit `model`.
If the Agent tool refuses the value, omit `model` and report that fallback.

Give the subagent the user's question and this brief:

> Write an architectural explanation for a senior engineer who is new to this area.
> Explore the codebase, and do not edit a file.
> After one read, the engineer must have a mental model that lets them work in this area with confidence.
> Use the headings `Overview`, `Key Concepts`, `How It Works`, `Where Things Live`, and `Gotchas`.
> Omit a heading that does not apply.
> In `How It Works`, follow the trigger, the data flow, and the decision points in prose.
> Name the files and functions so the reader can find them.
> Add a diagram only when it shows a relationship faster than prose.

With no Agent tool, do the exploration and the explanation yourself.

## 2. Teach

A request to teach also asks why the code has its shape.
Then also follow `why` on the same target.
Read the file that `astack skill-path astack:why` prints.
Keep `why` narrow, such as git and one or two named sources, unless the reasons are the question.
Weave its reasons into each heading.
Keep its confidence words, because its uncertainty is part of the evidence.

## 3. Present

Present the output of the subagent.
Make light edits for clarity or for the context of the conversation.
Do not rewrite it substantially.
