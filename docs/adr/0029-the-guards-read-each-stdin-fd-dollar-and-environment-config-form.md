# 0029. The guards read each stdin, fd, `$` and environment config form, and a gate record binds to its base profile

Status: Accepted
Date: 2026-11-23
Ticket: none
Supersedes: none
Amends: 0010 D3

## Context

A security review after B04 found six forms that the guards read wrong.
A probe on the tree of B37 denied 1 of 35 such forms and passed each of 10 control forms.

The shell parser compared a redirect fd as a string, and it counted only `<` as a stdin source.
So `bash < f`, `bash <&3`, `{ bash; } < f` and `bash 0<<'EOF'` read as a shell with no script.
The parser read each unknown `$` form as text, so `gh $"pr" merge 12` read as no merge.

The destructive guard read git config only from command flags and for `core.hooksPath` only.
It read an exported skip variable only from the `export` form.
The gate record named no profile, and nothing stopped a write of the record.
The `core.hooksPath` check compared hook names, not the hooks that git runs.

The guards stop agent mistakes, as ADR 0011 D6 and B01 D8 say.
A guard for a hostile agent needs an OS sandbox.

## Decisions

### D1. Stdin is static only with one readable source

A redirect fd is a number, so `00<` is fd 0. A `<` with no fd is fd 0, and a `>` with no fd is fd 1.
A digit word right before `<<` or `<<<` is the fd of its heredoc.

Each redirect to fd 0 is a stdin source, also `0>&3`, `0>f`, `0<>f` and `<&3`. A pipe is a source too.
Stdin is static only with one source, which is a quoted heredoc, a static here-string or a whole pipe stage.
Each other source makes it dynamic, and a shell with a dynamic stdin is unreadable.

A heredoc or a here-string on another fd feeds no script, so its stdin is dynamic too.
A stdin redirect on a group, a subshell, a loop close or a bare `exec` makes the stdin of each step of the text dynamic.

Amended 2026-11-23. A shell with no stdin source of its own reads the stdin of the line.
An earlier step that redirects stdin or runs `exec`, `eval`, `source` or `.` can rebind that stdin, also behind `command` or `builtin`.
So such a shell after such a step is unreadable, also in a nested body.
A digit word that a quote or an escape touches is no fd, as bash reads it.
A step with a stdin redirect and a static `exec` or `eval` word makes the stdin of each step dynamic. A loop can run that step first.
A bare shell in a text with `()` before `{` or `(` is unreadable, because a function of any name can feed it.
A pipe stays open across a newline only when the stage after it holds no word, redirect, here-string or heredoc.

### D2. Each unknown `$` form is dynamic

Bash reads a `$` before a blank, a newline, an operator other than `(`, a closing quote or the end as text.
The parser reads `$"..."` as a double-quoted string.
Each other `$` form makes its word dynamic and splitting.

### D3. Git config from the environment counts as config

Static `GIT_CONFIG_KEY_<n>` and `GIT_CONFIG_VALUE_<n>` pairs below a static `GIT_CONFIG_COUNT` feed the config of the git step, as `-c` does.
Each other `GIT_CONFIG` variable in the env of the step or in an export is a hook skip.
An `include.path` or `includeIf.<cond>.path` key from each source is a hook skip, because the guard does not read the included file.

### D4. Each export form exports the earlier skip assignments

An earlier `export`, `declare -x`, `typeset -x`, `set -a`, `set -o allexport` or zsh `setopt allexport` step exports each earlier assignment of the line.
The option name of `set -o` and `setopt` matches in any case and with or without `_`, as zsh reads it.
So an earlier `HUSKY` or `LEFTHOOK` assignment with such a step is a hook skip, in either order.
A bare `export HUSKY` and a skip value that a variable gives are hook skips too.

### D5. A gate record binds to the profile blob at its merge base

`astack gates run` records the blob of the hardening profile at the merge base of the base and HEAD.
It records nothing when HEAD holds another blob there.
A hook-skip push passes only when the source and its merge base with the record base hold that blob.
An old record with no blob gives the owner gate.
`--base` is an input of the agent, so `astack gates run --base HEAD` binds the record to the profile of HEAD.

### D6. A write into the gate folder gets a deny

The destructive guard also reads Write and Edit calls.
A Write or an Edit call into `<state>/gates/` gets a deny.
So does a shell step with a static word or a redirect target in that folder. A plain read, such as `cat`, passes.
The reads are `cat`, `cmp`, `diff`, `find`, `grep`, `head`, `jq`, `less`, `ls`, `stat`, `tail`, `wc` and the hash tools `md5`, `md5sum`, `sha1sum`, `sha256sum` and `shasum`.
A `find` with `-delete`, an `-exec` form, an `-ok` form, an `-fprint` form or `-fls` is no read.

### D7. A `core.hooksPath` target must hold the active hooks

A target passes when git uses it now.
Else HEAD must hold at least one 100755 hook there, and each active hook needs a 100755 file of that name with the same bytes.
A working-tree change under the target is a hook skip.

### D8. The gate record is a mistake guard, not a security boundary

The record stops an agent that pushes red work past the hooks by mistake.
An agent can still write the record with a tool that the hook does not read.
A `cp`, `mv`, `rsync` or `tar` step into a parent folder of a record folder also passes, because the hook reads only a path in the record folder.
Such a step must bring a folder named `gates` or `session-repos`, so it is no plausible mistake.
It can also edit the profile and run the gates with `--base HEAD`.
Branch protection, CI and the review of the owner stay the control for a hostile agent.

## Consequences

- Easier: each of the 35 probe forms gets a deny, and each of the 10 control forms passes.
- Harder: a shell that reads its script from a file gets the stdin deny when the text names git, supabase or a package manager.
- Harder: a guarded git verb with a word such as `$.50` outside a message flag gets a deny.
- Harder: a stdin redirect on a group marks each shell step of the text, so a readable shell beside it gets a false deny.
- Harder: the first hook-skip push after this change gets the owner gate, because an old record has no profile blob.
- Limit: a variable that hides a path or a name keeps its verdict.
- Limit: `HOME` and `XDG_CONFIG_HOME` move the config files of each tool, and the guard does not read them.

## Alternatives considered

- Count only a `<` to fd 0, as before. Rejected because a dup, a group redirect and `00<` then feed a script that the guard does not read.
- Track which steps a group feeds. Rejected because it grows the parser past what the finding needs.
- A list of literal `$` forms only. Rejected because each unknown form then reads as a static word.
- A message catalog lookup for `$"..."`. Rejected because the guard has no catalog, and bash with no catalog prints the text.
- A hook skip for each `GIT_CONFIG` pair. Rejected because it denies a `user.name` pair.
- A read of the included file. Rejected because the file can change after the hook runs.
- A tracker of shell variables across steps. Rejected because it grows the parser past what the finding needs.
- The profile blob at the base tip. Rejected because it drops the record of each branch behind a profile change.
- The profile of the base. Rejected because it skips a gate that the PR adds.
- A signed record. Rejected because the agent owns the key and the state folder.
- Folder permissions on the gate folder. Rejected because the agent owns the folder.
- Only the hooks folder in use. Rejected because it denies a first install of `core.hooksPath`.
- Hook names only, as before. Rejected because a target with hooks that exit 0 passes.
- A third Amended block under ADR 0010 D3. Rejected because it cannot hold the rejected options and the premise.
