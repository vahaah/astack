# Fix Root Causes

When you debug, do not fix the symptom.
Trace each problem to its root cause.
Fix it there.

## Why

Symptom fixes accumulate.
Each workaround makes the system harder to read, and the bug stays.
A root-cause fix takes longer at first, but it decreases the total debug time.
A guard at the line that failed hides the cause, and the next failure starts in a different place.

## Procedure

`astack:coding-rules` gives the procedure in its section "Fix the root cause".
Run `astack skill-path astack:coding-rules`.
Read the path that it prints.

- Ask "why" until the answer is a fact about the design.
- When a workaround needs a long comment, fix the code.
- When you cannot find the cause, add instrumentation. Read the real error. Do not guess.

## Restart bugs

When something fails after a restart, suspect stale persistent state before code.
Examine config files, caches, lock files and serialized state first.
When the behavior comes back after you clear a state file, make state validation the fix.

You skipped this principle when you know where it failed, but not why.
