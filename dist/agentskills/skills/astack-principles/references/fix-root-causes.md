# Fix Root Causes

When debugging, do not fix symptoms.
Trace every problem to its root cause.
Fix it there.

## Why

Symptom fixes accumulate.
Each workaround makes the system harder to understand, and the real bug remains.
A root-cause fix takes longer at first but reduces total debugging time.

## Procedure

- Reproduce first.
- Ask "why" until you find the root cause.
- Do not add guards. A nil check that silences a crash fixes a symptom.
- If a workaround needs a paragraph in a comment, the code is wrong. Fix the code, not the comment.
- Search for the pattern, not only the instance. Find each instance of that pattern. Fix all of them.
- Add instrumentation when you are stuck. Add logging. Read the actual error. Do not guess.
- If the deciding fact was hard to find, propose a cheap signal that stays on and shows it immediately.

## Restart bugs

When something fails after restart, suspect stale persistent state before code.
Examine config files, caches, lock files, and serialized state first.
If clearing a state file restores behavior, prioritize state validation as the fix.
