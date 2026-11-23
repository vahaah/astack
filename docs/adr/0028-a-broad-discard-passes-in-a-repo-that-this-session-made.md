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
For a missing target, the pending entry holds the time of a file that the hook writes in the state folder at the call.
That time comes from the clock of the file system, so a repo that the command makes has the same or a later birth time.
For an empty folder, it holds the device, inode and birth time of that folder.

### D3. Only static words give a target

A dynamic word gives no target. So do `--bare`, `--mirror` and `--separate-git-dir`.
`--git-dir`, `--work-tree`, a `core.worktree` setting and a place variable give no target too.
A `core.worktree` key in any case and in any word of a step is such a setting, as in `git clone -c` or `git config`.
A place variable is `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_COMMON_DIR`, `GIT_CONFIG_PARAMETERS`, `GIT_CONFIG_COUNT` or `TAR_OPTIONS`.

The hook reads the place forms of the whole command line, in any order of its steps.
A loop or a function can run a step after a later step of the text.

A place variable counts in the env of a step, in each step that names it and in the env of the hook.
A step that can change the state of the shell also removes the exemption from the whole line.
Such steps are `declare`, `typeset`, `local`, `readonly`, `float`, `integer`, `set`, `setopt`, `unsetopt`, `emulate`, `alias`, `eval`, `source`, `.` and `trap`.
A trap runs code later, also before the discard.

So does a word that the parser cannot read in full, in any step of the line.
That is a dynamic word, a word with a glob or a brace expansion, and a word with a backslash.
The parser does not decode each escape of a `$'...'` string, so a backslash can hide a place form.
A line with a place form records no target and gets no exemption, so it gets the verdict of ADR 0010 D3.

A `git archive` pipe keeps the exemption only when its `tar` step stays in the folder of the step.
Each word of that step must be an extract, verbose, keep, mode or stdin file flag, and the step must have no env.
So `-C`, `--directory`, `-P` and each other `tar` flag give the verdict of ADR 0010 D3.

Amended 2026-11-23. The `git archive` step must stay in the tree of the repo too.
`--prefix`, `--remote`, `--add-file`, `--add-virtual-file` and a tree-ish with a path, such as `HEAD:sub`, give the verdict of ADR 0010 D3.
With the exemption, the extraction keeps each dirty nested repo and submodule that has no bound record.

### D4. A record starts pending, and the next shell call settles it

A new record is pending, because the hook cannot see whether the command ran.
Each later shell call of the session settles each pending path before the command filter of the hook.
A pending path that is now a repo root with its own git dir binds.
The root must be born at or after the time of a missing target, or be the same empty folder.
So a repo that the call moved to the path drops, and its discard keeps the gate.
Each other pending path drops, also when the command did not run.
The hook saves the record only when the settle changed it.

### D5. A discard passes only in a repo with the identity of a bound record

A bound record holds the root, its device, inode and birth time, and its git dir.
A bind needs the git dir `<root>/.git`, or a folder under `worktrees/` of the common dir for a worktree.
A discard passes only when its root and that identity equal a bound record.
So a symlink at the path or a new repo at the path of a removed session repo gets the deny.

Amended 2026-11-23. The record also holds the device, inode and birth time of the git dir, so a swapped git dir gets the deny.
A bind needs the git dir, the `.git` marker of the root and the `HEAD` of the git dir born at or after the call.
An empty target holds that time too.
A bind also needs each index entry and the first `HEAD` reflog entry at or after that time.
A repo with a commit and no reflog does not bind.
A birth time of 0, or a birth time equal to the ctime, is unknown, and such a repo does not bind.

### D6. Each record failure fails closed

No session id, a refused id, no state folder, a bad file or a failed probe gives no exemption.
Each record function is total, so no fault throws in the handler.
A failed save changes no verdict of its call.
A pending path that binds in a call whose save fails passes the discard of that call.

### D7. The exemption skips only the work-loss read

The exemption skips the work-loss read of `lostPaths` in a session repo.
It keeps each nested repo that a `git clean -ffd` removes and that has no bound record.
A force-push to a shared branch, `supabase db reset` and a hook skip keep their owner gates in a session repo.

Amended 2026-11-23. A lost path that is a repo root, such as a nested repo or a submodule, keeps the deny unless a record binds it.
A command that recurses into submodules gets no exemption in a repo with a submodule.
That is `--recurse-submodules`, a `submodule.recurse` key of `-c` and a true `submodule.recurse` setting of git.

### D8. The record is a mistake guard, not a security boundary

The record file stops an agent that discards work in a repo of another session by mistake.
An agent can write the record file by hand, as ADR 0011 D6 says for the grant file.
Branch protection and the review of the owner stay the control for a hostile agent.

Amended 2026-11-23. A Write call, an Edit call and a shell write into `<state>/session-repos/` get a deny, as the gate folder does in ADR 0029 D6.
A line that writes into a new target with `cp`, `mv`, `rsync` or `tar` records no target for it.

## Consequences

- Easier: an agent can reset, clean and restore a repo that it made for a probe or a fixture.
- Easier: a repo of another session keeps the gate, also when it lives in the temp folder.
- Harder: each shell call of a session with a pending path spawns `git rev-parse` once for each pending path.
- Limit: when another process makes a repo at a pending path before the next Bash call of the session, the settle binds it. An Edit, Write or MCP call does not end this window.
- Limit: a file system with no birth time can reuse the inode of a removed session repo for a new folder at its path.
- Limit: on a file system with no birth time, a missing target never binds, so the repo keeps the gate.
- Limit: a repo that the call copies to a missing target across file systems has a new birth time and binds. The source keeps its work.
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
