# Skill mechanics

This reference adds skill-specific rules to [writing-for-agents](SKILL.md).
It covers frontmatter, invocation choices and router skills.
Use `SKILL.md` for the general writing rules.

## Invocation

Choose model invocation or user invocation according to the two load budgets.

A model-invoked skill keeps a `description` that lets the agent discover it independently.
Other skills can invoke it too.
The user can still type its name.
Model invocation adds agent discovery without removing user access.

Its description is an always-loaded context pointer.
That costs permanent context load in exchange for discovery.
A model-invoked reference skill can provide one shared reference for several skills.
To select this form, omit `disable-model-invocation`.
Write a model-facing description with the distinct trigger branches.
Apply the pointer rules from `SKILL.md` to that description.

A user-invoked skill permits invocation only when the human types its name.
Neither the agent nor another skill can invoke it independently.
It has zero context load but requires human recall.
To select this form, set `disable-model-invocation: true`.
Write its `description` as a one-line summary for the human.
Remove discovery trigger lists from that summary.

Choose model invocation only when the agent or another skill must reach the skill independently.
If the skill is used only by explicit invocation, choose user invocation.

When two user-invoked skills need shared reference, put it in a plain file outside the skill system.
Neither skill can invoke the other.
Both can point to the shared file.

## Split by invocation

`SKILL.md` covers splits by sequence.
Split a model-invoked skill when a distinct leading word needs its own independent trigger.
Use a trigger word that appears in actual prompts.
A split is also justified when another skill must invoke the new skill.
The independent access must justify the permanent context load of another description.

## Router skills

A router skill reduces the human recall needed for many user-invoked skills.
Make the router user-invoked.
List the other skills and when to select each.
The human then remembers one entry point.
The router can suggest a user-invoked skill but cannot invoke it.
Only the human can start those skills.
