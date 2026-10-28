# Phase boundaries

A phase is a chunk of work inside a session, such as grilling, implementation, or QA.
Its definition is fuzzy on purpose.
A phase ends when you think "ok, we're done with that".

A phase boundary is the gap between phases.
Make this context decision only at that point.
During a phase, continue or split the remaining work into subagents.
Compaction during a phase makes the agent lose the thread.

## The five options

| Option | What it does |
|---|---|
| Continue | Stay in this session without a context switch. |
| `/clear` | Empty the context window and start from nothing. |
| `astack session handoff` | Write a portable Markdown file that can seed a session anywhere. |
| Subagent | Send a task to its own context window and get a report back. |
| `/compact` | Compress this context and seed a fresh session with the summary. |

## The decision tree

Work from top to bottom at the phase boundary.
The first yes wins.

### 1. Can you continue in this session?

Continue when either condition holds:

- The next phase needs this phase as a primary source.
- Enough [smart zone](https://www.aihero.dev/ai-coding-dictionary/smart-zone) remains, about 150k tokens, for the next phase to fit.

Grilling followed by implementation is the standard case.
Implementation needs the reasoning verbatim, not a summary.
Continuing costs nothing and loses nothing.
Consider it before every other move.

### 2. Is the context irrelevant to what comes next?

Use `/clear` when the session's exploration, decisions, and dead ends are all disposable.
It takes no time and returns the whole window.
You can still resume the old session.

Clearing relevant context has a one-way cost.
It loses the reasoning behind the work.
Reading the diff cannot restore that reasoning.

### 3. Do you need to hand off?

Use `astack session handoff` only for these cases:

- Change to a new harness, such as Claude to Codex.
- Move to a new directory or repo.
- Send the work to a colleague.
- Fork a side task found during a phase without derailing the current work.

These are the only cases.
A handoff provides portability through a file that travels.
You do not need it when nothing is travelling.

For a pause and later pickup in the same repo, read `astack-mode` by path.
Use `astack skill-path astack:mode`.
Follow its Pause safely and Session pickup playbooks.
They commit a `wip:` and leave a resume note.

### 4. Can the task run AFK?

Use a subagent when the task can run while you are away, without steering.
Keep the scope tight.
Leave this session untouched.
Automated review is a standard case.
The agent reads the diff and reports.
You are not needed while it runs.

### 5. Otherwise, use `/compact`

Use `/compact` when the context is relevant, the harness and directory stay the same, and you must stay involved.
Give it an instruction about the next phase, such as `/compact we're going to QA this area`.
The summary must keep what that phase needs.

Treat `/compact` as the default after the first four questions.
It comes last because those questions are cheaper or more precise.
Starting here can produce a fresh session that misreads a decision after the summary loses its detail.

## Primary and secondary sources

Every move except Continue replaces a primary source with a secondary source.
The session as it happened gives way to a summary.
The trade has the same shape each time:

| Source | Information | Noise | Room to move |
|---|---|---|---|
| Primary (Continue) | Full | Lots | Little |
| Secondary (`/compact`, `astack session handoff`) | Lossy | Less | Lots |

This is why the first question comes first.
Accept that loss only when staying costs more than it saves.

## These are judgment calls

Each question includes a judgment.
The same phase boundary can lead to different choices on different days.
Ask the questions in order at the phase boundary, not during the work.
