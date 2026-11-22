# 0010. Session guards skip scratch writes, keep commit checks and deny broad work loss

Status: Accepted
Date: 2026-11-14
Ticket: none
Supersedes: none

## Context

A session analysis found three classes of hook behavior that cost the owner work.
The type, comment and doc STE hooks examined a probe script in a temporary folder outside every repo.
A delegate ran `git checkout -- .` on a tree with uncommitted work of another session, and no hook stopped it.
An unattended session got a merge denial that said "The owner did not say to merge in this turn", but the owner said it.
The host started the session with `CLAUDE_CODE_SESSION_ATTENDED=0`, so astack did not read its prompts as a person's prompts.

`src/astack/attended.ts` reads the attended state, `src/astack/paths.ts` finds a scratch file, and `src/astack/hook/handlers/destructive.ts` holds the owner gates for git.
ADR 0004 D3 keeps CLI and CI checks independent of hook profiles.

## Decisions

### D1. The write-time quality hooks skip a scratch file

A scratch file is outside the project, and no folder at or above it holds `.git` or `.astack/profile.json`.
A file in the OS temp folder outside the project is a scratch file too, also in a git work tree.
The type, comment and doc STE hooks skip a write or an edit of a scratch file.
A file in the project, in a sibling work tree or in a folder with an astack profile keeps each check.

### D2. Each path that a commit can include keeps its checks

The comment and type hooks examine the staged diff of each commit, also for a file that was a scratch file at write time.
The STE hooks still examine each commit message, PR body, ticket and tracker comment.
So a scratch file can skip a check only until it enters a commit.

### D3. A git command that discards uncommitted work in the tree or a folder is an owner gate

The destructive hook reads `git status` before the command runs.
It denies `git reset --hard`, `git checkout -f`, `git switch -f` or `--discard-changes` when the tree has a tracked change.
It denies a `git checkout` or a `git restore` of `.`, `:/` or a folder with a change that the command discards.
It denies `git clean -f` when an untracked file is in its scope.
Each denial names the paths that the command discards.

The same commands pass on a clean tree.
A command that names one file, `git restore --staged` and each `git stash` form pass, because the agent names the work that it discards.

Amended 2026-11-22. Both guards read the plain form of each shell step.
`shellSteps` drops reserved words and braces, and it unwraps a fixed list of wrappers.
It also parses static `sh -c`, `eval` and substitution bodies as steps, and a static script that a shell reads from a heredoc or a pipe.
A shell reads a static script on stdin only from four sources, and only when the command defines no function or alias.
Two sources are a quoted heredoc and a static here-string.
The other two are a whole pipe stage before the shell: `echo` with no flag or backslash, or `printf '%s'` with one static argument.
`printf '%s\n'` counts as that `printf` form.
Each other script on stdin gets a deny with no search of its text.
An unquoted heredoc with `$`, a backtick or a backslash is dynamic for each reader of stdin.
So is the stdin of a command with more than one stdin source, because the shell uses the last one.
A guarded verb that a variable hides is unreadable.
An unreadable work-loss command gets a deny on a changed tree when astack can read its folder.
Each other unreadable guarded verb gets a deny at once.
`git apply -R` from stdin or a substitution, `git read-tree -u --reset` and `git checkout-index -a -f` are work-loss commands.
So is `git archive` piped to `tar -x`. A named-file form still passes.
`git archive` names its files only when each word is static, each flag is known, and the first plain word is a tree. Else it covers the whole tree.
A failed `git status` in the `tar` folder gets a deny.
The `tar` step needs a known flag in each word. Else it covers the whole tree, and a folder that astack cannot find with certainty gets a deny.

Amended 2026-11-22. A hook skip is an owner gate too.
A hook skip is `--no-verify`, `HUSKY=0`, `LEFTHOOK=0` or a `core.hooksPath` folder where HEAD does not hold each active hook as an executable file. A `core.hooksPath` with a `..` segment or a symlink is a hook skip too.
A push of a source that `astack gates run` recorded as green can skip the hooks.
A commit and a config write with a hook skip stay owner gates, because a new commit has no gate record.

### D4. Attended detection stays fail-safe, and the merge denial names its cause

`CLAUDE_CODE_SESSION_ATTENDED=0` or an `sdk` entrypoint makes a session unattended.
In an unattended session, a prompt with no `source` field is not a person's prompt, so it gives no merge grant.
A prompt that the host marks with `source` `user` stays a person's prompt.
astack adds no attended override, because each child process inherits an environment variable.
The merge denial, the SessionStart note and `astack doctor` name the variable that makes the session unattended.
The fix of the host flag is outside astack.

Amended 2026-11-22. In an unattended session, a prompt that the host marks with `source` `user` gets a note that the turn is attended.
The note reads only `event.human`, with no state folder and no `hooks.ste`.
Plan S0 reads the note as attended, because `astack plan attended` reads only the environment.

#### Formal claim

`SessionGuards` checks three groups of finite behaviors under one specification.
The merge group covers attended and unattended sessions, the three merge authorities of the profile and prompts of one or two clauses.
The clauses are a merge word, a merge word with one PR number, a negated merge, "full send", a negated "full send", "full stop" and other text.
The prompt source is `user`, absent or a machine source.

The write group covers each combination of four path facts: in the project, in the temp folder, under `.git` and under a profile.
The git group covers 16 git commands.
It covers each set of tracked, staged, mixed and untracked changes in a named file, a folder and the rest of the tree.
The push group covers a HEAD whose gates pass or fail, a gate run and one push or commit.
The push or commit skips the hooks or keeps them. It goes to a head, to refs that a record cannot cover, or into a new commit.

```text
GrantFromWords       == \A n \in grant : OwnerCovers(said, n)
GrantFromPerson      == grant # {} => PersonTyped(saidBy, attended)
MergeNeedsAuthority  == each merge has a profile grant or a covering prompt of a person
FullStopNeverMerges  == no merge happens while the last prompt of a person says "full stop"
WriteChecksKept      == a write outside the scratch class gets the write checks
ScratchSkipped       == a write of a scratch file gets no write check
CommitSurfaceChecked == each commit gets the commit checks
BroadLossDenied      == no command on the tree or a folder discards a change and passes
DenialNeedsLoss      == each denial names a change that git discards
HookSkipNeedsGates   == a hook skip goes ahead only on a head whose gates pass
```

The [model](../../formal/SessionGuards.tla) and its [configuration](../../formal/SessionGuards.cfg) check these invariants with no fairness.
The model takes the observations of the hooks as true: the clause grammar, the prompt source, the path facts and the `git status` entries.
The negative control lets a "full stop" clause give a grant of each PR. It must violate `GrantFromWords`.
The model takes the plain form of each shell step as given.
The control of the plain form is the wrapper law `verdict(w c) = verdict(c)`, which a property test checks.

Amended 2026-11-22. `sudo` and `doas` reset the environment by default, and `exec -c` clears it.
So the merge guard reads each of them before `gh pr merge` as an environment change, unless `sudo` has `-E` or `--preserve-env`.
The merge part of the wrapper law leaves out `env -i`, `sudo` and `doas` with no such flag. The destructive part keeps them.

#### Category composition

The record uses the `artifact` carrier.
Each guard maps one decoded hook call `HookCall` to one `Verdict`, and the dispatcher encodes that verdict for the host.
A guard returns a plain value and reads files, git and the environment at the hook edge, so no Result or Promise carrier fits.

```text
mergeGrantIn : PromptText -> MergeGrant   effects: none
mergeGuard   : HookCall -> Verdict        effects: fs-read, fs-write, spawn, network
handler      : HookCall -> Verdict        comments: fs-read, fs-write, spawn, env
handler      : HookCall -> Verdict        types: fs-read, spawn, env
handler      : HookCall -> Verdict        ste-artifact: fs-read, fs-write, env
handler      : HookCall -> Verdict        destructive: fs-read, spawn, env
shellSteps   : HookCall -> ShellStep      effects: none
readGit      : ShellStep -> GitRead       effects: none
runGates     : ProfileGate -> GateRun     effects: spawn, fs-read, fs-write, env
recordOf     : GateRun -> GateRecord      effects: none
```

Amended 2026-11-22. `shellSteps` and `readGit` stay pure. The destructive `handler` reads the gate record, so it gets the env effect.
`runGates` runs the gates of the hardening profile, and `recordOf` keeps a record only when each gate that applies passes.
The `turn` handler keeps its effects, and its attended note reads only `event.human`.
The guards still run side by side under `combineAll`, so no composite arrow is new.
The wrapper law is not one of the eight category laws, so the proof matrix lists it as a control.

The guards run side by side on one hook call, and `combineAll` keeps the verdict of the highest rank.
The record declares no composite arrow, so the identity and associativity laws of arrow composition do not apply.
This change adds no map, functor or monad, so those laws do not apply either.
`tests/astack/guard-composition.ts` is the typed witness. The repo type check examines the signatures of each arrow there.

#### Implementation correspondence

| Model concept | Concrete contract |
|---|---|
| `Prompt` and `ClauseGrant` | `mergeGrantIn` reads the clauses, and `mergeGuard` saves the grant of a person's prompt |
| `HumanPrompt` | `humanPrompt` with `replyInteractive`, and `unattendedReason` in `src/astack/attended.ts` |
| `Merge` | `preflightReasons`, `stateReasons` and `grantCovers` in `src/astack/pr/merge.ts` and `src/astack/pr/grant.ts` |
| `mode` of `Merge` | The full-stop skill, which never merges. No function enforces this part |
| `Scratch` and `Write` | `isScratchPath` in the comment, type and doc STE hooks |
| `Commit` | `commitScopes` and the commit checks of the comment and type hooks, with no scratch test |
| `CodeLost` and `RunGit` | `workLossReasons` and its status reader in `src/astack/hook/handlers/destructive.ts` |
| `GitLost` and `After` | The documented effect of each git command on the index, the work tree and untracked files |
| `GatesRun` and `green` | `runGates`, `recordOf` and `saveGateRecord` in `src/astack/gates.ts`. A gate run records HEAD only when each gate that applies exits 0 |
| `Push` and `Targets` | `gitReasons` in `src/astack/hook/handlers/destructive.ts`, which reads `loadGateRecord` for each pushed source |
| The plain form, which the model takes as given | `shellSteps` in `src/astack/shell.ts` and `readGit` in `src/astack/git-command.ts` |

These links describe the abstraction relation.
They do not show that the TypeScript code refines the model.

#### Verification

[The proof matrix](../../.astack/proof-coverage.json) links each criterion of the [session guard requirements](../reference/session-guards.md) to its controls.
The merge guard, hook, STE hook, guard and doctor suites run each control through the normal test gate.
The negative control must violate `GrantFromWords` with a counterexample, and the unchanged model must pass again with the same state counts.
Amended 2026-11-22. The B04 manifest drops the record test from `Push`. That control must violate `HookSkipNeedsGates`.
`tests/property/shell-wrapper-law.test.ts` checks the wrapper law on both guards, and `tests/fixtures/guard-bypass.json` holds the probe forms.
Current results belong to CI and the proof receipt, so this ADR does not copy a pass result.

## Consequences

- Easier: an agent can write a probe in a temp folder with no hook noise.
- Easier: a delegate cannot discard the uncommitted work of another session without an owner answer.
- Easier: a merge denial in an unattended session names the real cause.
- Harder: a scratch file can hold text that the hooks did not examine until it enters a commit.
- Harder: an agent must name each file that it discards, or ask the owner.
- Limit: `git restore --staged` on a file with staged and unstaged changes drops the staged version. D3 allows it.

## Alternatives considered

- Skip every file outside the project. Rejected because a sibling work tree is real work with its own settings.
- Add a profile flag to skip scratch files. Rejected because a probe outside every repo has no profile to read.
- Deny each git command that discards work, also for a named file. Rejected because the agent then cannot undo its own edit of one file.
- Add an attended override variable. Rejected because each child process inherits it, so a delegate can give itself a merge grant.
