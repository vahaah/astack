# 0028. A broad discard passes in a repo that this session made

Status: Accepted
Date: 2026-11-22
Ticket: none
Supersedes: none
Amends: 0010 D3

## Context

ADR 0010 D3 makes each git command that discards uncommitted work in the tree or a folder an owner gate.
D3 has no exception for a repo that the session made itself.
An agent that makes a repo for a probe or a fixture with `git init` cannot reset its own repo.
A probe ran the destructive hook with a session id. It denied 4 of 4 broad discards on the dirty tree of a repo that `git init` made in that session.

The upstream review rejected a temp folder exemption, because worktrees of other sessions live there.
The incident of ADR 0010 discarded the work of another session.

No hook sees the result of a call. The dispatcher knows 4 events, and the Codex trust pin fixes the bytes of `hooks.json`.
So the hook cannot see at PreToolUse whether `git init` made a repo.
Owner rule D12 of the review roadmap says that a broad discard passes only in a repo that this session made.

## Decisions

### D1. A broad discard passes in a repo or worktree that this session made

The destructive hook records the folder that a static `git init`, `git clone` or `git worktree add` makes in the session.
A later broad discard in that repo or worktree passes on a dirty tree.
Each other repo keeps the gate of ADR 0010 D3.
`src/astack/session-repos.ts` holds the record at `<state>/session-repos/<session>.json`.

### D2. A target counts only when it holds no work

A target counts when it does not exist or is an empty folder at PreToolUse.
An empty folder holds no work, and each of the three verbs accepts one.
A folder with files, a file and a symlink give no record.

### D3. Only static words give a target

A dynamic word gives no target. So do `--bare`, `--mirror` and `--separate-git-dir`.
`--git-dir`, `--work-tree`, a `core.worktree` setting and a place variable give no target too.
A place variable is `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_COMMON_DIR`, `GIT_CONFIG_PARAMETERS` or `GIT_CONFIG_COUNT`.

A place variable counts in the env of the step, in an earlier step that names it and in the env of the hook.
An earlier `set -a`, `source` or `.` step also removes the exemption.
So does an earlier `export`, `declare`, `typeset`, `local`, `readonly` or `eval` with a dynamic word.
A discard with a place form gets no exemption, so it gets the verdict of ADR 0010 D3.

### D4. A record starts pending, and the next shell call settles it

A new record is pending, because the hook cannot see whether the command ran.
Each later shell call of the session settles each pending path before the command filter of the hook.
A pending path that is now a repo root with its own git dir binds.
Each other pending path drops, also when the command did not run.
The hook saves the record only when the settle changed it.

### D5. A discard passes only in a repo with the identity of a bound record

A bound record holds the root, its device, inode and birth time, and its git dir.
A bind needs the git dir `<root>/.git`, or a folder under `worktrees/` of the common dir for a worktree.
A discard passes only when its root and that identity equal a bound record.
So a symlink at the path or a new repo at the path of a removed session repo gets the deny.

### D6. Each record failure fails closed

No session id, a refused id, no state folder, a bad file or a failed probe gives no exemption.
Each record function is total, so no fault throws in the handler.
A failed save changes no verdict of its call.
A pending path that binds in a call whose save fails passes the discard of that call.

### D7. The exemption skips only the work-loss read

The exemption skips the work-loss read of `lostPaths` in a session repo.
It keeps each nested repo that a `git clean -ffd` removes and that has no bound record.
A force-push to a shared branch, `supabase db reset` and a hook skip keep their owner gates in a session repo.

### D8. The record is a mistake guard, not a security boundary

The record file stops an agent that discards work in a repo of another session by mistake.
An agent can write the record file by hand, as ADR 0011 D6 says for the grant file.
Branch protection and the review of the owner stay the control for a hostile agent.

## Consequences

- Easier: an agent can reset, clean and restore a repo that it made for a probe or a fixture.
- Easier: a repo of another session keeps the gate, also when it lives in the temp folder.
- Harder: each shell call of a session with a pending path spawns `git rev-parse` once for each pending path.
- Limit: when another process makes a repo at a pending path before the next Bash call of the session, the settle binds it. An Edit, Write or MCP call does not end this window.
- Limit: a file system with no birth time can reuse the inode of a removed session repo for a new folder at its path.
- Limit: two hook processes of one session can save the record at the same time, and one entry can go. A lost entry only gives a deny.
- Limit: a Cursor session has no session id, so it gets no exemption.

## Alternatives considered

- A temp folder exemption. Rejected because worktrees of other sessions live in the temp folder.
- Keep ADR 0010 D3 with no exemption. Rejected because an agent then cannot reset a repo that it made.
- Record only a path that does not exist. Rejected because each of the three verbs accepts an empty folder, and an empty folder holds no work.
- Trust a recorded path for the whole session. Rejected because another process can make a repo at a path whose init did not run.
- A PostToolUse entry that records the result of the call. Rejected because it changes `hooks.json` and its Codex trust pins.
- Match a repo by its path only. Rejected because a new repo at the same path then passes. The model breaks in 5 states.
- A `failed` function that denies each throw of the handler. Rejected because it changes each other verdict of the handler.
- An exemption from each gate of the handler. Rejected because a force-push, a database reset and a hook skip reach work outside the repo.
