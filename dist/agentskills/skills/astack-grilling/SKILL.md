---
name: "astack-grilling"
description: "Interview the user about a plan, decision or idea. Use when the user asks to grill or test their reasoning."
license: "MIT"
metadata:
  astack-version: "0.1.0"
  source: "astack"
---

# Grilling

Interview the user until you reach a shared understanding.
Represent decisions as a design tree.
Each decision can create further decisions with their own prerequisites.

Work in rounds.
The frontier contains every decision whose prerequisites are settled.
Ask every question on the current frontier in one round.
Number each question.
Give your recommended answer with each one.
Wait for the answers before the next round.

Write each round in plain text with this format:

```text
Q1. <question title>. <question body, might be multiple paragraphs, including multiple choices>
Recommended. <your recommended answer>

---

Q2. <question title>. <question body, might be multiple paragraphs, including multiple choices>
Recommended. <your recommended answer>
```

Never use AskUserQuestion for a whole round.
It permits at most four questions, while a round includes the full frontier.
Word each question so "yes" accepts your recommendation.

After each round, update the tree from the answers.
Recompute the frontier.
Ask the next round.
A question that depends on another unanswered question belongs in a later round.

Find facts yourself.
For an environment fact, dispatch a read-only explorer with `Agent` and `subagent_type: "astack-explorer"`.
Do not ask the user for a fact you can inspect.
Treat an unfinished exploration as an unsettled prerequisite.
Ask the remaining independent frontier questions while the exploration runs.
Put decisions that belong to the user in the round.
Wait for their answers.

Classify each question before asking it:

- Send an inspectable fact to an explorer.
- Send an empirical choice to a prototype.
- Ask the user only for a decision that belongs to them.

Finish when the frontier is empty and every branch has been examined.
Leave no assumption unstated.
Wait for the user's confirmation of shared understanding before acting on the decisions.

## Grill me

Use this mode to refine a plan or design in chat.
Write no documents during the rounds.
Continue until the frontier is empty.

## Grill with docs

Use this mode when the user asks for documents during the interview.
Also use it for domain terms and lasting decisions that belong in the glossary and ADRs.

1. Load `astack-domain-modeling` before the first round.
2. Confirm that both skills are loaded before the first question.
3. For a plan that must survive this session, use `/astack-plan` to run this interview within its planning stage.
