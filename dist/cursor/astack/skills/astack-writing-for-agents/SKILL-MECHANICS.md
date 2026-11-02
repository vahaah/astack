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
It removes agent discovery and requires human recall.
To select this form, set `disable-model-invocation: true`.
Write its `description` as a one-line summary for the human.
Remove discovery trigger lists from that summary.

Its context cost depends on the host:

- In Claude Code, `disable-model-invocation: true` keeps the description out of context until the human invokes the skill. The body then enters the conversation.
- In Codex, `allow_implicit_invocation: false` stops implicit invocation. The Codex documentation does not promise that the metadata leaves the catalog.
- Both hosts budget the catalog of descriptions. Claude Code can drop the descriptions of the skills that a session invokes least, when the listing is crowded. A source character count does not show what the model receives.
- `skillOverrides` does not control the skills of a plugin.

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
