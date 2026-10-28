# Refresh

Use this playbook for "update from main". The goal is a branch that has every change from the base and still does what its ticket asks.

1. Record the state. Run `git status --porcelain`, `git stash list` and `git rev-parse HEAD`, each as its own Bash call. The working tree must be clean. Commit work in progress on the branch, or stop and ask the owner.
2. Run `git fetch origin`. The base is the base of the PR, else `main`.
3. Read what the base brought before you merge. Run `git log --oneline HEAD..origin/<base>` and `git diff --stat HEAD...origin/<base>`. Open each new ADR, each new migration, and each change to the glossary, `AGENTS.md`, `CLAUDE.md` and the repo rules. Open each changed file that a step of the plan lists in `Files.`.
4. Merge with `git merge origin/<base>`. Never rebase a branch that you pushed, and never force-push it.
5. Resolve each conflict so that both intents stay. The behavior of the base stays, unless the ticket changes it on purpose. Write each choice in the merge commit body.
6. When the base added migrations, put our new migrations after them, as the repo rules say. Make generated files again with the repo commands. Never edit a generated file by hand.
7. Run all the repo gates. Fix each failure that the merge caused at its root cause.
8. Compare the decision rows of the plan and the intent of the ticket with what the base changed.
   - When a new ADR or a change on the base goes against a decision row, it is an owner call. Ask it, or decide it under a delegation grant and record the row as `delegated`.
   - When the base already delivers part of the work, remove that part from the plan.
   - When the base moved a file region that a step lists, change the `Files.` line of that step.
9. Push with `git push`.
10. Reply in 6 lines or fewer. Give the merge commit, the number of resolved conflicts and the gate counts. Then give the changed decision rows and the next step.
