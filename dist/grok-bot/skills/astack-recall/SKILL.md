---
name: "astack-recall"
description: "Rebuild recent work context from chat history, live state, and shared records. Use for recall, catch-up, or work resumption."
disable-model-invocation: true
metadata:
  astack-version: "0.1.0"
---

# Recall

Rebuild recent working context before you start or resume work.
Return a concise brief of the current state and next action.
Read only the in-scope records needed for that brief.

## Use both records

Chat history holds the user's goals, your actions, and decisions.
The shared record holds user reports, prior fixes, reverts, incidents, and current errors around the same code.
Do not reconstruct a feature with recurring bugs from your transcripts alone.
Read `../astack-why/SKILL.md` for shared-record searches across git, tickets, chat, docs, and error tracking.

## Locate transcripts

Claude Code stores transcripts at `${CLAUDE_CONFIG_DIR:-~/.claude}/projects/<slug>/<session-id>.jsonl`.
The workspace `<slug>` replaces each non-alphanumeric path character with `-`.
For example, `/Users/you/proj` becomes `-Users-you-proj`.
`pwd | sed 's/[^A-Za-z0-9]/-/g'` prints the slug.
Include same-repo worktree sessions under `<slug>--claude-worktrees-<name>`.
Subagent transcripts live in `<slug>/<session-id>/subagents/`.

Each line holds one JSON record.
For `type` values `user` and `assistant`, `message.content` holds a string or block list.
Blocks can be `text`, `tool_use`, or `tool_result`.
An `ai-title` record names the chat.
Other types hold metadata.

## Rebuild the context

### 1. Choose the route

Use the `session-pickup` playbook to resume one specific chat.
For a durable skill from repeated workflows, use the `Authoring or modifying a skill` playbook.
Resolve it with `astack skill-path astack:mode playbooks/authoring-a-skill.md`.
A human-readable activity summary is a separate task.
Recall loads working context across recent chats before action.

If the user supplies a complete state capsule with paths, branch, and change, use it.
Skip transcript searches in that case.

### 2. Set the search scope

State the time window, named topic, and workspace before you search.
For `recent`, default to the last 7 days.
Default the workspace to the active one.
Never read another project's transcripts without a request.
Never silently reduce `all` to a recent subset.

### 3. Search chat history

For one or two chats, search directly.
For a larger set, give parallel `haiku` subagents separate parts of the record.
Follow effort rules in `../astack-mode/SKILL.md`.

Tell each reader to follow these rules:

- Sort candidates by actual modification time with `ls -t`, never by UUID name.
- Search the topic first.
- Read only matching chats and their relevant sections.
- Skip `${CLAUDE_SESSION_ID}.jsonl` and obvious subagent, evaluation, or test noise.
- Return one block per chat with topic, user goal, decisions, open work, struggles, corrections, and artifacts.
- Include PRs, tickets, and branches as artifacts.
- Cite every block with its chat UUID.

Keep raw transcripts with the subagents.
Return only their findings to the main thread.

### 4. Search the shared record

Do this whenever the topic names a feature, file, subsystem, area, or bug.
A request about the user's work on that topic still needs the search.
Skip it only for activity recall without a named target, such as a weekly work summary.

Read `why` and use its source investigators and per-source playbooks.
Ask about current state, failed earlier attempts, and continuing user reports.
Do not ask only for design reasons.
Spawn the investigators with the chat readers in the same message.
Keep one investigator per source.
Treat empty results as findings and report unavailable MCP sources.
Combine their findings with the chat results.

### 5. Check live state

Verify discovered PRs, branches, and tickets through `git` and `gh`.
If the answer depends on actual tool calls, files read, or errors, read the full transcript.
A shortened local copy is insufficient proof of those actions.

### 6. Write the brief

Group by thread and stay on the named topic.
Keep adjacent work outside the brief unless it blocks this topic.

## Output contract

Lead with the capsule, thread status, problems, and next move, in that order.
Put useful detail below them or remove it.

- Capsule: at most 5 bullets about the work and its overall state.
- Threads: one line per thread with exactly one status tag.
- Problems: at most 5 recurring problems, including user symptoms and shipped fixes that were later reverted.
- Next move: one concrete action with the most value.

Use these thread tags exactly:

- `[merged #N]`
- `[open PR #N]`
- `[in flight <branch>]`
- `[verified, uncommitted]`
- `[reverted #N]`
- `[planned, not started]`

Tag unfinished threads too.
If the capsule and threads exceed one screen, cut detail before you cut threads.

Follow `../astack-write-docs/references/unslop.md`.
Cite chat findings by UUID.
Cite shared-record findings by PR number, ticket ID, chat permalink, or error-tracker issue.
Remove private context before public output.
Reply with the brief itself.
