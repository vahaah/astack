# Authoring or modifying a skill

You own the skill's voice.
These rules also cover `AGENTS.md`, `CLAUDE.md` and other documents that agents read.

1. Use Anthropic's `skill-creator` skill, or `plugin-dev:skill-development` for a plugin skill.
2. Validate the skill. Make sure its frontmatter has `name` and `description`. Make sure referenced files exist and links between skills resolve. For a plugin, also run `claude plugin validate <plugin dir> --strict`.
3. Add test cases for structural changes. Skip tests for subjective changes.
4. Run Create PR steps 1 to 8 (`references/create-pr.md`).

When in doubt, delete.
Keep only prose that changes a decision.
Tell the agent what to do without a reason unless the rule needs an explanation to be clear.
Match the tone to the scope.
Point at structural sources, such as types, READMEs, and config.
Follow [Encode Lessons in Structure](../../principles/references/encode-lessons-in-structure.md).
Delegate to other skills by path instead of repeating their rules.
Propose a new skill when you repeatedly use a workflow that no skill captures.

## Context pointers

A context pointer names material outside the context and tells when to read it.
Skill descriptions and `AGENTS.md` lines are pointers.
When the agent misses material, first sharpen its pointer.
Inline the material only when that fails.

- Put the leading word first.
- Give each branch one trigger.
- Merge the synonyms of one branch.
- Remove words that repeat the body.

An always-loaded pointer costs tokens on each turn, so prune it more strictly than the body.

## The two loads

Context load is the cost of material that loads on each turn, such as instruction lines and skill descriptions.
Cognitive load is the effort of a person who must remember which documents exist and when to use them.
Material behind a pointer costs only its pointer.
Material with no pointer depends on human recall.
Keep cognitive load where human judgment matters, and remove it elsewhere.

## Information hierarchy

A document holds steps, reference, or both.
Place each item by how soon the agent needs it:

1. In-file steps give the primary actions in order.
2. In-file reference supports a lookup during the work.
3. Disclosed reference lives in another file behind a pointer, and loads only for its branch.

Keep material inline when each branch needs it.
Disclose material that only some branches need.
Put the definition, rules and caveats of one concept under one heading.
Keep each meaning whole, in one place.
When a document is too long, disclose reference or split it by branch or sequence.

## Completion criteria

End each step with a completion criterion.
Make it clear enough that the agent can tell complete work from incomplete work.
Its demand sets the work. "Every modified model accounted for" asks for more than "produce a change list".

When later steps make the agent rush despite a precise criterion, split the sequence.
Split across a real context boundary, such as a subagent hand-off.
A split adds context load or cognitive load, so split only when the gain is larger.

## Leading words

A leading word names a compact concept, such as "tracer bullets", or "red" for a check that fails for the defect.
Repeat the word, not its definition.
Prefer a word that the model already knows.
Use a leading word only when it saves tokens and makes the trigger more precise.
Prefer a positive target to a prohibition.
Pair a necessary prohibition with the intended action.

## Pruning

Do not copy a cheap fact that the environment holds, such as `package.json`, config or `--help` output.
Document conventions, reasons and traps that config cannot show.
Remove stale claims and lines that do not serve the task.
Delete an instruction that does not change the default behavior of the model.
When people disagree about that default, run the document.

## Invocation

A model-invoked skill has a description with its trigger branches, so the agent and other skills can reach it.
That description costs context load on each turn.
A user-invoked skill sets `disable-model-invocation: true`, and only a person can start it.
Its description is a one-line summary for that person.
Choose model invocation only when the agent or another skill must reach the skill.

Two user-invoked skills share reference through a plain file outside the skill system.
A user-invoked router skill lists the other user-invoked skills and when to use each.
Split a model-invoked skill only when a distinct leading word or another skill needs its own trigger.

## Reply

Summarize the skill, key design decisions, and validation notes.
