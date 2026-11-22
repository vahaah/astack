# Session guards

This record holds the proof sections of the session guards.
[ADR 0009](../docs/adr/0009-astack-adopts-tstack-as-a-frozen-upstream.md) D4 governs the "full send" merge grant.
[ADR 0010](../docs/adr/0010-session-guards-skip-scratch-writes-and-deny-broad-work-loss.md) D1 to D4 govern scratch writes, commit checks, work loss and attended detection.
The proof sections of both ADRs moved here on 2026-11-22.
[ADR 0011](../docs/adr/0011-merge-authority-comes-from-the-owner-and-the-base-branch.md) keeps its own sections.

### Formal claim

`formal/SessionGuards.tla` examines three groups of finite behaviors under one specification.
The merge group covers attended and unattended sessions, the three merge authorities of the profile and prompts of one or two clauses.
The clauses are a merge word, a merge word with one PR number, a negated merge, "full send", a negated "full send", "full stop" and other text.
The prompt source is `user`, absent or a machine source.

A merge grant names PRs that a merge word or an un-negated "full send" clause of a person's prompt covers.
A "full stop" clause, a negated clause and a machine prompt add no PR to the grant.
The full-stop procedure never merges, also when `merge.authority` or `merge.standingBases` of the profile gives a grant.

The write group covers each combination of four path facts: in the project, in the temp folder, under `.git` and under a profile.
The git group covers 16 git commands.
It covers each set of tracked, staged, mixed and untracked changes in a named file, a folder and the rest of the tree.
The push group covers a HEAD whose gates pass or fail, a gate run and one push or commit.
The push or commit skips the hooks or keeps them. It goes to a head, to refs that a record cannot cover, or into a new commit.

```tla
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

The [model](SessionGuards.tla) and its [configuration](SessionGuards.cfg) examine these invariants with no fairness.
The model takes the observations of the hooks as true: the clause grammar, the prompt source, the path facts and the `git status` entries.
The model takes the plain form of each shell step as given.
The control of the plain form is the wrapper law `verdict(w c) = verdict(c)`, which a property test examines.

`sudo` and `doas` reset the environment by default, and `exec -c` clears it.
So the merge guard reads each of them before `gh pr merge` as an environment change, unless `sudo` has `-E` or `--preserve-env`.
The merge part of the wrapper law leaves out `env -i`, `sudo` and `doas` with no such flag. The destructive part keeps them.

### Category composition

The record uses the `artifact` carrier.
Each guard maps one decoded hook call `HookCall` to one `Verdict`, and the dispatcher encodes that verdict for the host.
A guard returns a plain value and reads files, git and the environment at the hook edge, so no Result or Promise carrier fits.

```data
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

`mergeGrantIn` is pure. It joins the grants of the clauses of one prompt with `joinGrants`.
`mergeGuard` saves that grant for a person's prompt, and it reads the grant back when a `gh pr merge` call arrives.

`shellSteps` and `readGit` stay pure. The destructive `handler` reads the gate record, so it gets the env effect.
`runGates` runs the gates of the hardening profile, and `recordOf` keeps a record only when each gate that applies passes.
The `turn` handler keeps its effects, and its attended note reads only `event.human`.

The guards run side by side on one hook call, and `combineAll` keeps the verdict of the highest rank.
The record declares no composite arrow, so the identity and associativity laws of arrow composition do not apply.
This change adds no map, functor or monad, so those laws do not apply either.
The wrapper law is not one of the eight category laws, so the proof matrix lists it as a control.
`tests/astack/guard-composition.ts` is the typed witness. The repo type check examines the signatures of each arrow there.

### Implementation correspondence

| Model concept | Concrete contract |
|---|---|
| `Prompt` and `ClauseGrant` | `mergeGrantIn` and `FULL_SEND_COMMAND` read the clauses, and `mergeGuard` saves the grant of a person's prompt |
| `HumanPrompt` | `humanPrompt` with `replyInteractive`, and `unattendedReason` in `src/astack/attended.ts` |
| `Merge` | `preflightReasons`, `stateReasons` and `grantCovers` in `src/astack/pr/merge.ts` and `src/astack/pr/grant.ts` |
| `mode` of `Merge` | The full-stop and full-send skills. The full-stop skill never merges, and no function enforces this part |
| `Scratch` and `Write` | `isScratchPath` in the comment, type and doc STE hooks |
| `Commit` | `commitScopes` and the commit checks of the comment and type hooks, with no scratch test |
| `CodeLost` and `RunGit` | `workLossReasons` and its status reader in `src/astack/hook/handlers/destructive.ts` |
| `GitLost` and `After` | The documented effect of each git command on the index, the work tree and untracked files |
| `GatesRun` and `green` | `runGates`, `recordOf` and `saveGateRecord` in `src/astack/gates.ts`. A gate run records HEAD only when each gate that applies exits 0 |
| `Push` and `Targets` | `gitReasons` in `src/astack/hook/handlers/destructive.ts`, which reads `loadGateRecord` for each pushed source |
| The plain form, which the model takes as given | `shellSteps` in `src/astack/shell.ts` and `readGit` in `src/astack/git-command.ts` |

These links describe the abstraction relation.
They do not show that the TypeScript code refines the model.
ADR 0009 D1, D2, D3, D5 and D6 change skills, credits and upstream files only.
They change no guard code, so they map to the preservation relation.

### Verification

[The proof matrix](../.astack/proof-coverage.json) links each criterion of the [session guard requirements](../docs/reference/session-guards.md) to its controls.
The merge guard, hook, STE hook, guard and doctor suites run each control through the normal test gate.
The normal test gate also runs the tests of the notice, the upstream snapshot and the skill shape for ADR 0009 D1, D2, D5 and D6.

The registry negative of the model in `formal/models.json` must give its named violation with a counterexample.
The unchanged model must pass again with the same state counts.
`tests/property/shell-wrapper-law.test.ts` examines the wrapper law on both guards, and `tests/fixtures/guard-bypass.json` holds the probe forms.
Current results belong to CI and the proof receipt, so this record does not copy a pass result.
