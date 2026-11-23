# Fallbacks

When `astack skill-path` fails or a skill is absent, name it once. State the fallback and suggest updating `astack`.

| Missing skill | Fallback |
|---|---|
| `astack-grilling` | Grill the design tree in rounds across the frontier with one recommendation per question. Look up facts yourself and stop when the owner agrees |
| `astack-domain-modeling` | Challenge fuzzy terms and write `**Term**:` with a one- or two-sentence definition and `_Avoid_:` to the glossary. Offer an ADR only when the three tests hold |
| `astack-codebase-design` | Use module, interface, public API, depth and deletion test definitions from `astack-coding-rules` |
| `astack-explorer` | Use a read-only `general-purpose` subagent |
| `astack-in-your-own-words`, `astack-sharpen` | Restate the goal in one paragraph and name the expert approach before round 1 |
| `astack-how` | Read-only subagent returns entry points, data flow and owners as pointers |
| `astack-why` | Read-only subagent reads `git log -S`, blame, tickets and ADRs for Preserve, Change and Avoid |
| `astack-recall` | Search tracker and `git log` for earlier attempts |
| `astack-architect` | Two subagents sketch compiling types independently. Compare depth and ratify one |
| `astack-interrogate` | Reviewers reproduce findings in isolated worktrees. Keep only rerun-confirmed failures |
| `astack-principles` | Use the nine-gate table in `stages.md` |
| `astack-show-me-your-work` | Use the trail rules in `template.md` |

The plan file, checker, trail and session CLI belong to `astack` and never need a fallback.
