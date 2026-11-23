# 0033. A hook reads each body file as its command leaves it, and a denied chain says that nothing ran

Status: Accepted
Date: 2026-11-23
Ticket: none
Supersedes: none

## Context

The upstream review found that the body hooks read a `--body-file` or a `git commit -F` file from disk at PreToolUse.
That read comes before the command runs, so an earlier step of the same command can still change the file.
So `cat > body.md` with bad text, then `gh pr create --body-file body.md`, passed with the old disk text.
A new file dropped the body check, because a missing file skips.

A PreToolUse deny stops the whole Bash call.
No deny text said so, and an agent thought that a `git add` or a file write before the denied step ran.

The shell paths of the PR and ticket hooks gave only advice for each `--repo` value, also for the origin repo.
Only the MCP path of the PR hook compared the named repo with origin.

No hook sees the result of a call, and the Codex trust pin fixes the bytes of `hooks.json`.
So each answer must come from the command text at PreToolUse.

## Decisions

### D1. A body hook judges the text that the earlier steps of its command leave

`stagedText` in `src/astack/shell.ts` gives the last certain static write to the body file, with each later append.
A file that no earlier step touches gives the disk text.
A write that can skip gives an unread body with the disk text.
A static write is a cat heredoc, an `echo`, a `printf` or a `tee` that `fileWrites` reads.
A `cat` or a `tee` with a heredoc or a here-string that holds a variable or a substitution is not a static write.

A write is certain when its pipeline starts an and-or list.
A write is also certain when `&&` comes before it and only `&&` links it to the body step.
A write after `||`, a write in a background pipeline and a write in the pipeline of the body step can skip.
A write inside `if`, `case`, a loop, a group, a subshell, a function, a substitution or a nested shell can skip too.

### D2. A step that the hook cannot read gives an unread body

A step gives an unread body when its folder or a write target is dynamic.
A step that names the base name of the body file in a form that `fileWrites` does not parse also gives one.
So `sed -i`, `diff`, `cp`, an `&>` write and a python heredoc that writes `body.md` give an unread `./body.md`.
A heredoc counts only in a step that `fileWrites` does not parse.
A reader step never gives one. The reader steps are `cat` with no redirect, `head`, `tail`, `grep`, `wc`, `ls`, `test`, `[` and `astack`.

### D3. An unread body keeps the disk check and gets one note

The STE, PR body, ticket and duplicate PR hooks judge the disk text of an unread body, as they did before.
The STE hook adds one note that starts with "could not read <file>".
It also logs one finding event with the rule `unread-body`, as ADR 0022 D1 says, with no path.
A deny of the same call masks the note, and the event then has the outcome `masked`.
A missing file still skips with no note.

### D4. A denied chain names each step that did not run

`judge` puts one line before a shell deny with 2 or more top-level commands.
The line reads `Nothing in this command ran. It had 2 steps. git, git.`
`chainSteps` gives the first word of each top-level command of `parseShell`, with no env assignment and no reserved word.
A `cd` counts, and the line gives no advice.
The line comes after `combineAll`, so `combine` keeps its monoid laws.

### D5. A `--repo` that names origin is this repo

`sameRepo` compares a named repo with the origin slug in lower case, after it drops a scheme, a host and `.git`.
The PR body hook on its shell and MCP paths and the ticket hook use it through `foreignRepo`.
A repo with no origin keeps the advice for each `--repo` value.

## Consequences

- Easier: an agent can write a body file and send it in one command.
- Easier: a denied chain tells the agent that it must run each step again.
- Easier: a PR or an issue for the origin repo gets the heading rules of the repo.
- Harder: each body hook parses the whole command and the steps before the body step.
- Limit: a redirect on a compound command, such as `done > body.md`, is no step, so the hook reads the disk.
- Limit: a write in a nested shell or a function gives an unread body, also when it always runs.
- Limit: on Cursor, the user message is the first line of a deny, so a denied chain shows the chain line there.
- Limit: `hooks.profile: minimal` turns off the STE hook, so the unread note goes. The disk checks of the other 3 hooks stay.

## Alternatives considered

- Keep the disk read. Rejected because a body that the same command writes passes with the old text.
- Treat each write as certain. Rejected because a write after `||` or inside `if` can skip, and the hook then judges text that the command does not send.
- A parser for each interpreter, such as python. Rejected because the list of interpreters has no end.
- Give an unread body for each step that names the path. Rejected because a reader such as `cat` or `astack check ste` changes nothing.
- Match the body file by its spelling. Rejected because it misses `./body.md`.
- Skip an unread body. Rejected because 8 denies of the hook before this change become an allow.
- Deny an unread body. Rejected because it stops a valid python write.
- A check after the command runs. Rejected because it needs a PostToolUse event and a new Codex trust pin.
- Count the chain steps with `shellSteps`. Rejected because it drops `cd`.
- Tell the agent to send each step again. Rejected because the merge guard forbids a chained `gh pr merge`.
- Advice for each `--repo` value, as before. Rejected because the origin repo then loses its heading rules.
