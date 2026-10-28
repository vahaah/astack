---
name: reflect
description: "Review the active transcript with three parallel lenses. Use reflect to find durable lessons and propose routed skill edits."
disable-model-invocation: true
metadata:
  origin: pstack
---

# Reflect

Find durable lessons in the active conversation and route them to skill changes.
Run when the user says `reflect` or `/astack:reflect`.
Skip a trivial or unrelated conversation.
Also skip lessons already covered by a skill that the parent followed correctly.
A one-time event is not a durable lesson.

Read applicable principles in full under `${CLAUDE_SKILL_DIR}/../principles/references/<title>.md`.

## 1. Locate the active transcript

Find this conversation by its session ID before you delegate.
Claude Code stores `${CLAUDE_SESSION_ID}.jsonl` in the workspace's directory under `projects/`.

```bash
ls ${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects/*/${CLAUDE_SESSION_ID}.jsonl
```

The session ID names this conversation only.
Do not list or read other transcripts under `~/.claude/projects/*/`.
They can contain private chats from unrelated projects.

Subagent transcripts sit beside this file in `${CLAUDE_SESSION_ID}/subagents/agent-*.jsonl`.
Include those paths for lessons about delegation.
If no transcript exists, give the reviewers a concise session digest.

## 2. Start three reviewers

Use one message with three `Agent` calls and `subagent_type: general-purpose`.
These reviewers need inherited MCP tools for cited tickets, chat threads, and observability traces.
Do not use `Explore`.

Read each role line from `astack-models.md`.
Set `model` to its value, or the default when the rule or line is missing.
For `auto` or `inherit-parent`, omit `model`.
These roles must run as Claude subagents to retain the session's MCP tools.
For an external value such as `codex`, or a rejected Agent value, use the default.
Report that fallback.
Follow effort rules in `${CLAUDE_SKILL_DIR}/../mode/SKILL.md`.

| Lens | Role line | Default `model` | Prompt template |
|---|---|---|---|
| Judgment | `reflect judgment, divergent, synthesizer` | `opus` | `references/judgment-reviewer.md` |
| Tooling | `reflect tooling` | `sonnet` | `references/tooling-reviewer.md` |
| Divergent | `reflect judgment, divergent, synthesizer` | `opus` | `references/divergent-reviewer.md` |

Pass each template verbatim with the transcript path or digest in its placeholder.
Reviewers return findings in their `Agent` response bodies.

## 3. Combine the results

Start one `general-purpose` synthesizer.
Use `reflect judgment, divergent, synthesizer`, with `opus` as the default model.
It needs inherited MCP tools to check citations.

Pass `references/synthesizer.md` verbatim.
Fill its placeholders with each reviewer's complete output.
It returns `Accepted`, `Rejected`, and `Backlog` lists.

## 4. Check for enforceable rules

Move an Accepted item to Backlog when lint, a script, metadata, or a runtime check would enforce it more reliably.
Apply `encode-lessons-in-structure`.

## 5. Apply approved changes

Present the complete Accepted, Rejected, and Backlog output.
Wait for explicit approval before any Accepted edit.
The user chooses the subset and can change its routing.
Do not apply accepted skill changes automatically.
They affect future agents across the organization.

File Backlog items to the team's devex or backlog tracker without waiting.
Only Accepted changes need this approval.

Follow each approved Routing:

- Make a trivial existing-skill change directly.
  This includes one line, a clearer sentence, or a corrected stale fact.
- For a new section, pattern table, or change longer than about 10 lines, use `skill-creator`.
  Run its draft, test, and iteration loop.
- For `tune description: <skill path>`, use `skill-creator` and its description-optimization loop.
- For `new skill via skill-creator: <kebab-name>`, use `skill-creator`.
  Do not invent a format.

If `skill-creator` is unavailable, follow https://code.claude.com/docs/en/skills.
If a `SKILL.md` validator exists, run it on every changed skill before completion.
For a plugin skill, one option is `claude plugin validate <plugin dir>`.

## 6. Report the result

Use a short list without a preamble:

- Edits applied: `<skill path>` and one line about each change.
- New skills created: `<skill path>` and one line each.
- Backlog filed: `<issue title>` and `<tags>`, one line each.
- Dropped: one line per rejected finding with the synthesizer's reason.
