# Hook ports requirements

[ADR 0032](../adr/0032-hook-handlers-read-files-git-and-the-profile-only-through-ports.md) governs the files, git and profile ports on each hook `Context` and the shared `runProcess` edge.
The [design](../design.md) describes how `processPorts` binds the ports for each hook call.

## Acceptance criteria

- [criterion:HP-NO-DIRECT] No file under `src/astack/hook/` imports a disk or git reader by value, and no handler imports `node:fs` or `node:child_process`. Putting a direct reader import back fails the import control.
- [criterion:HP-REPLAY] A fixture covers each reading handler and a Cursor stop. Recording each port answer on a repo copy, deleting the copy and replaying with a fresh state folder gives the same verdict. Node ports on the deleted repo give a different verdict.
- [criterion:HP-PROFILE-ONCE] One `Ports` value reads the profile of a canonical folder once and returns that value on each later read. A Write, an Edit and a `git commit -m` call each read the profile once, also through a symlink path such as `/var`.
- [criterion:HP-ONE-EDGE] `runHook` and `runCursorHook` each call `deps.ports()` once for one hook call and pass `files.readText` to the decoder.
- [criterion:HP-TOTAL] Each node operation of `processPorts` never throws on a missing path or failed git call. It returns `undefined`, `false`, `"missing"`, `"unreadable"` or a failed git result.
- [criterion:HP-PROCESS] `runProcess` runs sync child processes with their options and returns status, stdout, stderr and stop details. When a program cannot start, it returns a `StartFailure` with its cause.

## Claim boundary

The ports cover repo files, git queries and the repo profile.
State folder reads and writes, GitHub API factories and principle skill lookups stay outside `Ports`.
A helper imported from outside `src/astack/hook/` can still read the disk on a code path that no replay fixture exercises.
The replay control guards every reading handler on its fixture path, and the import control guards direct imports under `src/astack/hook/`.
