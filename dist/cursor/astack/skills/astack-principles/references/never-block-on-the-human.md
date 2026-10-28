# Never Block on the Human

The human supervises asynchronously.
Agents must stay unblocked.
Make reasonable decisions.
Proceed with the work.
Let the human correct the direction after the result.
Code changes are reversible and reviewable, so a wrong decision usually costs less than blocking.

- Proceed, then present. Do the work. Show the result. Do not ask "should I do X?" Do X. Explain why.
- Make the system repair itself. When you notice a problem, log it. Fix it in the next round.
- Get confirmation for irreversible actions, such as a force-push, deletion of production data, or an external message.
- Proceed with reversible actions, such as writing code, editing notes, or splitting tasks, without blocking.
- The human sets product direction. Execution should not block.
