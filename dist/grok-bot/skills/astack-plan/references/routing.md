# Routing: who settles each question

Classify every open question before it reaches the owner.
`astack-mode` requires this check before you ask about a fork.
Grilling makes facts your job and decisions the owner's.

| Kind | Test | Settled by | Thread |
|---|---|---|---|
| Fact | Reading the repo, the tracker, the docs or a running system answers it | `astack-how`, `astack-why`, `astack-recall`, `astack-research`, read-only explorers | subagent |
| Empirical fork | Running something answers it | `astack-mode` with `playbooks/prototype.md`, or `astack-prototype` when a person must judge the result | subagent, or main when the owner must see it |
| Design fork | Two or more viable shapes, judged on structure | `astack-architect` phases A and B, which read `astack-arena` by path | subagent, then the owner ratifies |
| Agent call | Reversible and cheap, with no product or risk preference riding on it | You decide, write a `default` row, and put it on the next veto list | main |
| Human call | Product, priority, scope, risk appetite, a deadline, or a one-way door with no dominating option | an `astack-grilling` round | main only |

## Break ties

- Split a question that mixes kinds.
  Find the fact first.
  Ask about the remaining decision.
- A one-way door is never an agent call.
  When evidence dominates, set the row to `evidence`.
  The owner ratifies it.
  When nothing dominates, it is a human call.
- When you cannot tell an agent call from a human call, it is a human call.
- Resolve an empirical fork by running the check, even when it is quicker to ask.
  Run `astack skill-path astack:principles references/never-block-on-the-human.md` for this rule.
  Read the path it prints.
- Knowledge that only a third party holds is a human call about who to ask. Suggest the owner runs `/astack-to-questionnaire`.

## What reaches the owner

Only human calls, design ratifications and the veto list reach the owner.
Every recommendation names its evidence, its principle and the rejected option.
Word each question so that yes accepts the recommendation.
Never ask the owner for a fact that you can look up.

A design ratification shows the chosen shape in at most 15 lines.
It names the strongest rejected candidate and gives the rejection reason in one line.
It links the sketch branch and the arena synthesis.

The veto list holds every agent call written since the last round.
One answer accepts the whole list.
A vetoed item becomes a human call in the next round.
Supersede its row.

## Check the answers

After each round, send one read-only subagent to test each factual claim in the answers.
It reads the code, the tracker and the docs.
Use `astack-explorer` on `sonnet` when that agent is available.
Otherwise use a `general-purpose` agent told to change nothing.
When an answer contradicts the code, ask about it in the next round with the evidence.
Never overrule the owner silently.
Never keep a decision whose premise the code disproves.

## Brief a fact-finding subagent

Give each subagent one question, the paths or subsystem to start from, and the S0 destination.
Ask for pointers and a one-line answer.
A pointer is a file path with a symbol, a command with its output, a ticket key or a commit link.
Ask it to name what it could not find.
Put its result in the facts brief.
Do not paste its full output into the main thread.
