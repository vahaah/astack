# Guard the Context Window

Context overflow harms reasoning, creates compression artifacts, and stops progress.

- Size phases and cap their scope. Limit the files in each phase. Set turn budgets. Account for the cost of each mechanism.
- Send bulk reads, searches, and long outputs to subagents. Spawn an Agent with `run_in_background: true` when you have other work meanwhile. Ask it for a summary with file paths and line numbers. Keep summaries in the main thread instead of raw payloads.
