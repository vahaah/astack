### Session pickup

You own the resume point.
The plan, the tracker and git hold the state.
A transcript, a remote session or a PR thread is a lead that git, the PR or the plan must confirm.

1. Read the current state through "Read the state" of `references/resume.md`.
2. Locate the prior trail for leads on recent decisions. Use this repo's local transcript directories from Transcripts in `references/paths-and-wakeups.md`. Do not glob across `~/.claude/projects/*/`. That crosses workspace boundaries and reads private chats from unrelated projects. A pushed branch or PR can also hold leads, including one from a remote session. Assign a long transcript to a subagent and keep its reduced timeline in the main thread. Follow Guard the Context Window (`astack skill-path astack:principles references/guard-the-context-window.md`). Choose each subagent's model and effort through the Subagents rules.
3. Compare completed and pending work against the plan, git log and git diff. Confirm each lead from the trail against the repo, the PR or the plan. Name the resume point without repeating work that git and the plan already show as done.
4. Route the remaining work to its matching playbook. Choose whether to continue execution or ship a finished recommendation. Other choices are to ratify or override a prior conclusion, or do a postmortem of a failed run. The pickup playbook ends here. The routed playbook owns the remaining work.
5. Verify the inherited claims against the original goal on the real artifact. Follow Prove It Works (`astack skill-path astack:principles references/prove-it-works.md`). A passing prior self-report is not proof.

#### Reply

State where the prior agent stopped.
Name what git and the plan confirmed and what you repeated.
Give the resume point and outcome.
