---
name: writing-for-agents
description: Write documents that agents read. Use for skills, AGENTS.md, CLAUDE.md and documents reached through context pointers.
metadata:
  origin: mattpocock-skills
---

# Writing for agents

Use this reference for documents that agents read.
Examples include skills, `AGENTS.md`, `CLAUDE.md` and documents reached through pointers.
Their packaging differs, but the writing rules are the same.
The aim is a repeatable process across runs, even when the outputs differ.

For a skill, also read [SKILL-MECHANICS.md](SKILL-MECHANICS.md).
It covers frontmatter, invocation choices and router skills.

## Context pointers

A context pointer names material outside the current context and states when to read it.
A skill description is a context pointer.
So is an `AGENTS.md` line that names another document.
The pointer's wording determines when and how reliably the agent reaches that material.

If required material is missed, first sharpen its pointer.
Inline the material only when a clearer pointer still fails.

Each pointer must identify the material and the distinct branches that need it.
A branch is one case the document handles.
Every word of an always-loaded pointer costs tokens and attention on every turn.
Prune that text more strictly than the document body.

- Put the leading word first, where it can trigger the lookup.
- Give each branch one trigger. Combine synonyms that name the same branch.
- Remove identity information already stated by the body.

## The two loads

Every document and pointer spends one of two budgets.

Context load is the cost of material loaded on every turn.
Examples include instruction-file lines and skill descriptions.
They use the agent's tokens and attention even when no trigger applies.

Cognitive load is the human effort required to remember which documents exist and when to use them.
The human acts as the index.
Keep that burden where human judgment matters.
Remove it where human judgment adds no value.
Do not minimize it at the expense of human agency.

Material reached through a pointer avoids permanent context load apart from the pointer itself.
Material with no pointer depends entirely on human recall.

## Information hierarchy

Documents contain steps, reference material, or both.
Steps define ordered actions.
Reference material provides definitions, rules and facts for lookup.
A recipe can contain only steps.
A review rule set, or this skill, can contain only reference material.

Place each item according to how immediately the agent needs it:

1. In-file steps state the primary actions in order.
2. In-file reference supports lookup during the work. A flat set of peer rules can be the correct structure.
3. Disclosed reference lives in another file behind a context pointer. It loads only for its relevant branch.

A disclosed file can be a sibling or an external reference that other documents also use.
Too much inline material hides the immediate work.
Too much disclosure hides material the agent actually needs.
Choose the level from the branch that needs the information.

Progressive disclosure moves material into a separate reference behind a pointer.
Its main purpose is to protect the information hierarchy, rather than only reduce tokens.
Keep material inline when every branch needs it.
Disclose material needed by only some branches.
In a procedure, misplaced inline reference can hide the steps and make runs less consistent.

Co-location groups a concept's definition, rules and caveats under one heading.
The hierarchy determines the information's level.
Co-location determines which related information appears together at that level.
A reader should receive the relevant neighboring rules when they read one part.
Duplication repeats a meaning in several places.
Scattering divides one meaning across several places.
Avoid both.

Sprawl means a document is too long even when each line remains useful and unique.
Extra length divides attention and increases maintenance work.
Disclose reference behind pointers.
Split by branch or sequence so each path contains only its required material.

## Steps and completion criteria

End each step with a completion criterion that identifies when the work is complete.
A useful criterion has clarity and demand.

Clarity means the agent can distinguish complete work from incomplete work.
A vague criterion such as "understanding reached" can permit premature completion.
Visible later steps can draw attention away from unfinished work.
First make the criterion precise, because that is a small local change.
If precision is impossible and observed runs still rush, hide later steps by splitting the sequence.
The split must cross a real context boundary, such as a handoff or subagent dispatch.
An inline call leaves later steps visible and does not solve that problem.

Demand means how much work the criterion requires.
"Every modified model accounted for" requires broader inspection than "produce a change list".
Demand also determines the legwork implied by the instruction.
That effect applies beyond steps.
"Every rule applied" sets an exhaustive requirement for a flat reference, just as "every step complete" does for a procedure.
Use criteria that are both checkable and exhaustive.

## When to split

A split increases context load or cognitive load.
Split only when its benefit justifies that cost.

Split by sequence when visible later steps cause the agent to rush the current step.
Hiding those steps can increase the work spent on the current task.
The reverse also applies.
Combining sequences exposes later work and can encourage premature completion.

For a split by invocation, use [SKILL-MECHANICS.md](SKILL-MECHANICS.md).

## Leading words

A leading word names a compact concept the model can use during execution.
Examples include "lesson", "fog of war" and "tracer bullets".
Repeat the word rather than its whole definition.
Its repeated use can connect rules across a document with few tokens.

Prefer an existing word that the model already knows.
A new word can work when defined clearly, but its definition uses tokens that a known word can save.

In a document body, the word can trigger consistent behavior and focus attention on a class of rules.
In a pointer, shared words across prompts, documents and code can make the relevant lookup more reliable.

Look for repeated multi-part phrases that one established term can replace.
Examples include these replacements:

- "fast, deterministic, low-overhead" can become "tight", as in a tight loop.
- "a loop you believe in" can become "red" when the check visibly fails for the defect.

A leading word must reduce tokens and make the trigger more precise.
Look for restatements that it can replace.

Negation can activate the unwanted behavior more strongly than the prohibition modifies it.
The instruction "Do not think of an elephant" still introduces the elephant into context.
Prefer a positive target such as "write one-line comments".
Keep a prohibition only when a hard guard cannot be stated positively.
Pair that prohibition with the intended action.

## Pruning

Keep each meaning in one authoritative place.
Duplicate meanings cost maintenance and tokens.
They can also make one rule appear more prominent than its real importance.
A leading word deliberately repeats a token rather than duplicating its definition.

Treat the environment as a source of truth.
Examples include `package.json` scripts, configuration files, the directory layout and `--help` output.
A document that repeats an inexpensive lookup is a cache that can become stale.
Cache a fact only when the lookup is expensive.
Document unwritten conventions, decision reasons and traps that configuration cannot show.
Leave a one-file or one-command lookup in the environment.

Check every line for relevance to the document's task.
Remove unrelated exposition.
Disclose material that belongs to another branch.
Remove claims made stale by changes in behavior or the environment.
Shorter documents cost less to keep relevant.
Without pruning, additions accumulate while useful rules become harder to find.

Find instructions that do not change the model's default behavior.
Assess that default for the actual model, rather than a human reader.
When people disagree about the default, run the document to settle the question.
Delete an instruction that adds no behavior instead of only shortening it.
Apply the same test to leading words.
If "be thorough" does not change the default, use a stronger effective word such as "relentless".
Keep the technique and improve the word before choosing another technique.
