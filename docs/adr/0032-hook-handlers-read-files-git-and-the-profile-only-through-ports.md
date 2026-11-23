# 0032. Hook handlers read files, git and the profile only through ports

Status: Accepted
Date: 2026-11-23
Ticket: none
Supersedes: none
Amends: none

## Context

Each hook `Context` held no port for repo files, git or the profile.
`HookDeps` had one `readText` port that only the decoder received.
A scan found 74 direct reader calls across 14 files under `src/astack/hook/`, plus helpers that handlers passed as values.

`judgeEach`, `verdictFor` and `contextFor` each read the hooks section of the profile on their own.
A probe in a temp repo counted 5 profile reads on a Write, 3 on an Edit and 6 on a `git commit -m`.
Under `/var`, the commit read the profile 7 times, because git returned `/private/var`.

`src/` also held 14 `spawnSync` calls in 11 files, 11 optional file readers and 6 copies of `gitText`.
It also held 2 copies of `currentBranch` and 12 definitions of `type Env`.
No test could record every repo read of a hook call, delete the repo and replay the call.

## Decisions

### D1. Handlers reach repo files, git and the profile only through context.ports

Every hook handler and every helper that a handler calls reads repo files, git and the profile through the ports on `Context`.
One edge binds the ports for each hook call, so a test can record and replay every read.

### D2. Ports groups files, git and profile operations in src/astack/ports.ts

`Ports` has three fields: `files`, `git` and `profile`.
`files` exposes `readText`, `pathKind`, `realPath`, `relativePath`, `isScratch`, `workTree`, `listDir`, `isExecutable` and `folderId`.
`git` exposes `gitRun`, `gitText`, `gitRoot`, `gitBranch`, `gitOrigin` and `gitChanges`.
`profile` exposes `readProfile`.
`src/astack/ports.ts` exports each node operation under its operation name.

### D3. processPorts binds the ports once for each hook call and caches per canonical folder

`processPorts` in `src/astack/ports.ts` wraps the node operations with `portsFrom`.
`portsFrom` caches `readProfile` and `gitRoot` by the canonical path of each folder for the life of one `Ports` value.
Each hook call builds one value, so cache entries never leak across calls or tests.

### D4. Context.ports is required and HookDeps builds ports instead of readText

`Context.ports` has no optional disk fallback, so no handler can skip the ports by accident.
`HookDeps` takes `ports: () => Ports` in place of `readText`.
`runHook` and `runCursorHook` call `deps.ports()` once and pass `files.readText` to the decoder.

### D5. Helpers take the port they need and old disk forms go

Each helper that a handler calls takes the port type it uses, and every other caller moves in the same change.
The old path-based helper forms and `typePolicy` go, and `parseTypePolicy` parses the `types` section directly.

### D6. State stores, GitHub factories and principle lookups stay outside Ports

The state folder holds the STE state, the event log, the ledger, the grant store, the session repos, the gate record and the Cursor store.
Those stores, the GitHub factory ports of `merge-guard` and `duplicate-pr`, and `principleSkills` stay outside `Ports`.

### D7. runProcess in src/astack/process.ts runs every sync child process

`runProcess` runs each sync `spawnSync` call with `cwd`, `env`, `input`, `timeoutMs`, `maxBuffer`, `stdin` and `output`.
It returns a `Result<ProcessOutput, StartFailure>` so a failed start gives its cause and each caller maps the output to its own contract.

### D8. Shared helpers keep one copy of optional read, gitText, currentBranch and Env

`src/astack/paths.ts` holds the one optional read.
`src/astack/git.ts` exports `gitText`, which keeps an empty output, `gitValue`, which returns `undefined` for an empty output, and `currentBranch`.
`src/astack/process.ts` exports the one `Env` type.

### D9. A replay control and an import control guard the port boundary

`[control:hook-port-replay]` records every port answer on a repo copy, deletes the copy and replays the hook call with a fresh state folder.
`[control:hook-no-direct-read]` fails on any value import of a disk or git reader under `src/astack/hook/`, and on `node:fs` or `node:child_process` in a handler.

## Domain and effects

Terms. Hook ports

```domain
context Guards
step runProcess : (string, string[], ProcessOptions) -> Eff<Process.runProcess, StartFailure, ProcessOutput>
law  L1 Profile one Ports value reads the profile of a canonical folder once, and each later read gives that value   check: prop ports-profile-once
law  L2 Files a hook call on replayed port answers, with its repo deleted, gives the verdict of the recorded call   check: prop hook-port-replay
law  L3 Process a run gives the status, stdout and stderr, and a program that cannot start gives its cause   check: prop process-run
rung R4
```

## Consequences

- Easier: a single hook call reads the profile once for each canonical folder, down from up to 7 reads.
- Easier: a replay test proves that every reading handler and Cursor stop reads the repo only through `context.ports`.
- Easier: `spawnSync`, optional file reads, `gitText`, `currentBranch` and `Env` each live in one module.
- Harder: every new helper that a handler calls must take a port parameter instead of calling `paths.ts`, `git.ts` or `profile.ts` directly.
- Harder: state writes stay direct, so `astack check effects` still reports `fs-write` on handlers that touch the state folder.

## Alternatives considered

- Keep direct disk calls and fake through temp repos. Rejected because 10 handlers made 57 direct calls that no replay test could isolate.
- Expose only `readText` and one git runner on `Ports`. Rejected because 19 path-fact calls would remain direct.
- Cache profile reads at module scope. Rejected because module state leaks across calls and tests.
- Keep `Context.ports` optional with a disk fallback. Rejected because a handler could silently bypass its port.
- Add a state port in the same change. Rejected because it adds about 27 call sites across 5 stores outside the block scope.
- Keep one `gitText` empty-output rule for every caller. Rejected because `astack gates run` treats an empty status as clean while plan reads treat empty output as absent.
- Test handlers with hand-written fakes. Rejected because a hand fake can agree with a handler that also reads the disk.
