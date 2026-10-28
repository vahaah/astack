# Fallbacks

`astack:plan` composes skills from the single astack plugin.
A client can omit a skill or lack a capability that the skill needs.
`astack skill-path` exits 1 when the skill or reference is unavailable.
The client can also report that a model-invocable skill is unavailable.
Tell the owner once which skill or capability is missing.
Name the steps that use these fallbacks.
Install or update astack to restore missing skills for the full stage.

## Missing design and research skills

| Step | Fallback |
|---|---|
| `astack:grilling` | Work the design tree in rounds. The frontier contains every decision whose prerequisites are settled. Ask the whole frontier each round. Give one recommended answer per question. Wait for the answers. Look up facts yourself. Stop when the frontier is empty and the owner confirms a shared understanding |
| `astack:domain-modeling` | Challenge each fuzzy or overloaded term. Write each resolved term to the glossary at once. Use `**Term**:`, a one- or two-sentence definition, and an `_Avoid_:` line with the rejected words. Offer an ADR only when the three tests hold |
| `astack:research` | A background `general-purpose` subagent answers from primary sources. It writes one cited file on a `research/<slug>-<topic>` branch |
| `astack:prototype` | Run `astack skill-path astack:mode playbooks/prototype.md`. Read the path it prints. Follow that playbook. Show the result to the owner in the main thread |
| `astack:codebase-design` | Use the design vocabulary in `astack:coding-rules`. It defines module, interface, public API, depth and the deletion test |
| `astack:explorer` | Use a `general-purpose` subagent told to read only and change nothing |
| `astack:to-tickets` rules | Use vertical slices that cross every layer and can be checked alone. Put prefactoring first. Use expand, migrate, contract for a wide refactor |
| `astack:wayfinder` rules | Use `programme.md`. It holds every charting rule that this skill needs |

## Missing analysis and principle skills

| Step | Fallback |
|---|---|
| `astack:in-your-own-words`, `astack:sharpen` | Restate the goal in one paragraph. Name the expert approach before round 1 |
| `astack:how` | A read-only subagent explains each touched subsystem. It returns entry points, data flow and owners as pointers |
| `astack:why` | A read-only subagent reads `git log -S`, blame, the linked tickets and ADRs. It returns what to preserve, change and avoid |
| `astack:recall` | Search the tracker and `git log` for earlier attempts at the same work |
| `astack:architect` | Two subagents each design the shape independently, with types and `not implemented` bodies. Compare them on interface depth. Ratify one with the owner |
| `astack:interrogate` | Two read-only reviewers on different models attack the plan and the sketch. Sort each finding into Act on, Consider, Noted or Dismissed |
| `astack:principles` and its references | Use the gate table in `stages.md` |
| `astack:show-me-your-work` | Use the trail rules in `template.md` |

The plan file, checker, trail, session CLI and tracker write plans belong to astack.
They never need a fallback.
