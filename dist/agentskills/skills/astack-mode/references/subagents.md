# Subagents

Use `subagent_type: "astack-delegate"` for every subagent that you spawn inside a playbook step.
This includes delegates that write code and helpers for other tasks.
The chat that receives `/astack-mode` runs the playbook.
Never spawn an `astack-delegate` to run the playbook itself.
Routed skills set their own `subagent_type` for review with different models.
These skills include `how`, `why`, `interrogate`, `reflect`, and `swarm`.
Follow the type that the skill names.
Do not replace it with `astack-delegate`.

Set every `Agent` call from this table.
Per-role lines in `${CLAUDE_CONFIG_DIR:-~/.claude}/rules/astack-models.md` override these defaults and the model choices in routed skills.
The routed skills include `how`, `why`, `arena`, `swarm`, `architect`, `interrogate`, and `reflect`.
Use `/astack-setup-models` to write those role lines.
A role with no line keeps its default.

| Need | Claude Code |
|---|---|
| Agent type | Use `astack-delegate` for playbook delegates. Use `general-purpose` where a routed skill names it. State a read-only role in its prompt. Or use an agent whose `tools:` list leaves out Edit and Write. Use `Explore` only when losing CLAUDE.md and the rules is acceptable, such as when you find files. Agents keep MCP tools unless their `tools:` list drops them. |
| Model | `model` accepts `opus`, `sonnet`, `haiku`, or `fable`. Code roles default to `sonnet`. Use `opus` for the hardest changes: cross-cutting design, difficult concurrency, or subtle algorithms. This holds for vague intent and for a precise sequence of steps. Use `haiku` for trivial mechanical edits. Prose and judgment default to `opus`. Omit `model` when the role says `inherit-parent` or `auto`. The agent then uses the parent model. |
| Effort | `effort` accepts `low`, `medium`, `high`, `xhigh`, or `max`. The agent's frontmatter `effort:` sets its default. The per-call `effort` overrides it. When `CLAUDE_CODE_EFFORT_LEVEL` is set, every subagent uses that level. The Agent tool then has no `effort` parameter. Fast mode is a session setting (`/fast`), not a spawn parameter. |
| Background | Use `run_in_background: true` by default. Run in the foreground only when the next step needs the result and nothing else can run meanwhile. A completion arrives as a notification. |
| Isolation | `isolation: "worktree"` gives the agent its own git worktree under `.claude/worktrees/`. Use it for every writer that shares a checkout with another writer. Use it for every lane that needs the PR head. `isolation: "remote"` runs the agent in a cloud environment. Its availability is gated, so never require it. |
| Prompt | Use file pointers instead of context pasted into the prompt. Every `astack-delegate` prompt must carry this file's absolute path. |
| Follow-up | `name` makes a running agent addressable through `SendMessage`. Use `ListAgents` to see what is live. Use `TaskStop` to stop it. |
| Nesting | Agents nest to depth 3. The main chat is depth 0. An agent at depth 3 has no Agent tool. Set `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` before launch to raise the cap. Fit every tree inside the budget. State the depth of each role. |
| Cross-family reviewer | Use Bash, not Agent, as `astack skill-path astack:arena references/external-seats.md` says. Run `codex exec --sandbox read-only "<prompt>"` when `command -v codex` succeeds. You can also use `cursor-agent -p --mode ask --model <model> "<prompt>"`. A role value of `codex`, `codex:<model>`, or `cursor-agent:<model>` names such a seat. Point the reviewer at the diff or a read-only checkout. |
| Workflow tool | Never require Workflow. It runs only in the main thread after the user opts in. |

## Choose effort

Before each spawn, start from the role's line or default.
Choose the effort for the job.
The `/astack-setup-models` budget sets each role's starting effort.
Its default is `xhigh`.
Raise effort one step for the hardest or subtlest work.
Stop at `max`.
Lower effort one step for judgment.
Lower it two or more steps for routine work.
Verification is the exception.
It stays on the `swarm workers` model and effort, with `sonnet` as the default model.

Change only effort.
Keep the model or external seat that the role names so the panel stays diverse.
For a codex seat, use `-c model_reasoning_effort=<level>`.
Roles set to `auto` or `inherit-parent` stay on the parent model.
If the Agent tool rejects a value, use the role's line or default.
Report the fallback.

Each code playbook reads its model from its configured role line.
The role lines are `feature, refactoring`, `bug-fix`, `perf-issue`, and `hillclimb`.
Use `hardest tasks` for the hardest changes.
Use `judgment and prose` for prose and judgment.

## Review the work

You own every subagent's work.
Review the diff.
Write your own summary.
Do not pass through the agent's report.
A second opinion uses the same prompt with a different model.
A reviewer from another model family gives the strongest second opinion.
Agreement is a strong signal.

## Use fresh subagents

Give new work to a fresh subagent with consolidated scope.
Include the original brief, every later directive, and the prior agent's report and branch.
This rule covers a fix round, follow-up, retry, and next queue item.

Reuse an existing subagent only when the new work strictly needs state that lives in that agent.
That state must be costly to move.
This includes its local checkout, uncommitted changes, or a process that it still runs.
Examples include a dev server, simulator, or babysit watcher.
Reuse includes a resume, a `SendMessage`, or a queued follow-up.
An order to stop or hold a running agent is not reuse.

A role, such as PR owner, can outlive its agent.
After the agent returns, give its next round to a fresh agent.
A chain of interrupts and resumes silently drops directives.
Start a fresh agent with consolidated scope.
Do not rely on a "done" summary.
