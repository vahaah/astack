### Pause safely

You own a clean stop.
Leave a checkpoint that a new agent can resume without this context.
This playbook requires an explicit pause.
Do not pause on "keep going", "going to bed, keep going", or "don't stop".

1. Stop at a safe boundary. Finish the current atomic step or back out of it. Start nothing new. Stop nested subagents with `TaskStop`.
2. Take no irreversible action to pause. If this work has no PR or push, do not create either to pause.
3. Make the work durable. Commit uncommitted edits as one clear `wip:` commit on the current branch. Keep every edit so nothing is lost. If the tree is broken, state that in one line of the commit body.
4. Write the resume note outside this context. Record the intent, current activity, progress, verified work, current state, next steps, key files, and gotchas. For the compaction trigger, write it to a file in the pstack store. Use a path such as `<store>/<slug>-resume.md` from `references/paths-and-wakeups.md`. If a `show-me-your-work` trail exists, point to it instead of copying its content.

#### Reply

State your current point in the loop.
Separate what is on disk from what remains only in your context.
Give paths instead of diff dumps.
Name the commits that you made and whether the tree is clean.
State the first action on resume.
This is a pause, not a final report.
