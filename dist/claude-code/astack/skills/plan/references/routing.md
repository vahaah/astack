# Routing: who settles each question

Classify every open question before it reaches the owner. Facts are your job, and decisions are the owner's.

| Kind | Test | Settled by | Thread |
|---|---|---|---|
| Fact | Repo, tracker, docs or live system answers it | `astack:how`, `astack:why`, `astack:recall`, S1 research brief, explorers | subagent |
| Empirical fork | Running a check answers it | `astack:mode playbooks/prototype.md` ("Person-judged prototype" when a person judges) | subagent or main |
| Design fork | Viable shapes judged on structure | `astack:architect` phases A and B with `astack:arena` | subagent, owner ratifies |
| Agent call | Reversible and cheap, no product or risk preference | Decide, write `default` row, add to veto list | main |
| Human call | Product, priority, scope, risk, deadline or unforced one-way door | `astack:grilling` round | main only |

## Tie rules

- Split mixed questions: resolve facts first, then ask the decision.
- A one-way door is never an agent call. Dominating evidence sets `evidence` for ratification. Otherwise it is a human call.
- When unsure between agent and human call, pick human call.
- Run checks for empirical forks instead of asking (`astack skill-path astack:principles references/never-block-on-the-human.md`).
- Third-party knowledge is a human call about who to ask.

## Owner surface and verification

- Only human calls, design ratifications and the veto list reach the owner. Never ask for a lookup fact.
- Each recommendation names evidence, principle and rejected option so "yes" accepts it.
- Design ratification uses at most 15 lines naming strongest rejected candidate, reason, sketch branch and arena synthesis.
- After each round, one read-only subagent (`astack:explorer` on `sonnet`, else `general-purpose`) verifies factual claims against code, tracker and docs.
- Brief fact subagents with one question, starting paths and S0 destination. Return pointers and gaps only.
