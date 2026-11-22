# Guard the Context Window

Context overflow harms reasoning and stops progress.

- Size each phase. Limit its files, set turn budgets and count the cost of each mechanism.
- Send bulk reads, searches and long outputs to subagents. Ask each one for a summary with file paths and line numbers.

You skipped this principle when the main thread holds raw output that a summary can replace.
