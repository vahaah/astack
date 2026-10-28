# Authoring or modifying a skill

You own the skill's voice.

1. Use Anthropic's `skill-creator` skill, or `plugin-dev:skill-development` for a plugin skill.
2. Validate the skill. Make sure its frontmatter has `name` and `description`. Make sure referenced files exist and links between skills resolve. For a plugin, also run `claude plugin validate <plugin dir> --strict`.
3. Add test cases for structural changes. Skip tests for subjective changes.
4. Run Opening a PR.

When in doubt, delete.
Keep only prose that changes a decision.
Tell the agent what to do without a reason unless the rule needs an explanation to be clear.
Match the tone to the scope.
Point at structural sources, such as types, READMEs, and config.
Follow [Encode Lessons in Structure](../../principles/references/encode-lessons-in-structure.md).
Delegate to other skills by path instead of repeating their rules.
Propose a new skill when you repeatedly use a workflow that no skill captures.

## Reply

Summarize the skill, key design decisions, and validation notes.
