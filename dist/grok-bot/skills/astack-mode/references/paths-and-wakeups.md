# Paths and wakeups

## Programme state

Durable programme state lives in `~/.local/state/pstack/<repo slug>/`.
This legacy storage path stays unchanged.
Give Edit and Write its absolute path, with `~` expanded to `$HOME`.
The store stays outside the Claude Code config directory.
Claude Code treats files inside that directory as sensitive and prompts for each write.

Build the repo slug from the main worktree's absolute path.
Replace every character other than a letter or digit with `-`.
An example is `-Users-me-src-app`.
Every worktree of the repo shares this store.
It outlives the session.
Never keep state that a later session needs in the session scratchpad.
Pass absolute store paths to agents.

## Transcripts

This session's transcript is `${CLAUDE_CONFIG_DIR:-~/.claude}/projects/<slug>/${CLAUDE_SESSION_ID}.jsonl`.
Its slug comes from the session's working directory.
Subagents write `<session id>/subagents/agent-<id>.jsonl` beside it.
Each `agent-<id>.meta.json` names the agent type, model, and depth.

A session in a worktree or subfolder has its own slug.
An example is `<repo slug>--claude-worktrees-<name>`.
Older Claude Code versions kept `.` in the slug.
Examine that variant too.
Read only this repo's slugs.
Never glob across `projects/*/`, which reads private chats from unrelated projects.

## Worktrees

Claude Code creates agent and `EnterWorktree` worktrees at `<repo>/.claude/worktrees/<name>`.
Use `git worktree list` as the source of truth.

## Wakeups

Follow the current harness's waiting rules before using these mechanisms.
Use its managed watcher when those rules require one.
Do not add a second polling loop around a managed watcher.

`/loop <interval> <prompt>` repeats a prompt at a fixed interval.
`/loop <prompt>` without an interval is dynamic.
Where the harness permits it, use `ScheduleWakeup` to set the pace.
A Bash watcher with `run_in_background: true` wakes you when it exits.
`Monitor` can watch an until-loop where the harness permits that mechanism.
A background agent sends a completion notification.

## CLI commands

The astack plugin ships `astack watch-pr` and `astack orch`.
They need no separate install step and call `gh`.
