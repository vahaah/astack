### Autonomous run

You own the exit condition.
Define done before you start.
Drive the task to that condition without stopping.

1. State a checkable exit predicate before the first iteration. Examples include green tests, a fixed repro, all N PRs merged, or zero pixel difference.
2. Choose the wake mechanism through Wakeups in `references/paths-and-wakeups.md`. Start with Claude Code's `/loop`. It is a built-in command, not an astack skill. For an event, use a watcher that wakes you when it occurs. Examples include CI, a merge, or a ref that advances. A background Bash command or `Monitor` can watch the event. Keep a long `ScheduleWakeup` heartbeat as fallback. Without an event, use `/loop` at a fixed interval. Set the interval to when another observation is useful. Choose each subagent's model and effort through the Subagents rules.
3. Make the smallest change that the evidence justifies in each iteration. Verify it against the predicate. Commit it when it advances the task. Discard a change that does not help. Revert extra precautions supported only by "might help". Use Sequence Verifiable Units (`astack skill-path astack:principles references/sequence-verifiable-units.md`). Verify each unit before the next one. Do not batch the checks at the end.
4. Own discoveries that occur during the run. Fix broken skills, related bugs, flaky verifiers, review noise, tooling failures, orphaned follow-ups, and fixable drift. Use this skill for those fixes. Put a fix outside the current task in its own PR. Do not leave reversible work for the human. Do not use `AskUserQuestion` for that work. Surface only irreversible actions, product or preference calls that no experiment can settle, or a real dead end. Keep the predicate as the main objective. Return to it after each side fix.
5. Record a checkpoint for every iteration through `show-me-your-work`. Add a row that names the change and whether the predicate moved.
6. Stop when the predicate holds. A plateau is not a stop condition. Continue with a different approach to get past it. Report a real dead end instead of repeating work without progress. Never relax the predicate to claim success.

#### Reply

Give the exit condition and iteration count.
Name what landed and what you discarded.
Report the final predicate state.
