### Session pickup

You own the resume point.
Read the prior trail instead of repeating its work.

1. Locate the prior trail. Use this repo's local transcript directories from Transcripts in `references/paths-and-wakeups.md`. Do not glob across `~/.claude/projects/*/`. That crosses workspace boundaries and reads private chats from unrelated projects. A pushed branch or PR can also hold the trail, including one from a remote session. Read the metadata overview and last messages first. Then read earlier decision points. Assign a long transcript to a subagent. Keep its reduced timeline in the main thread. Follow Guard the Context Window (`astack skill-path astack:principles references/guard-the-context-window.md`). Choose each subagent's model and effort through the Subagents rules.
2. Reconstruct the operational state. Find the branch, worktree, completed work, open todos, and decisions. Read `git log` and `git diff` against the base. Treat the prior trail as authoritative input. Do not derive it again.
3. Compare completed and pending work. Compare what shipped with the plan. Name the resume point. Do not rerun the prior repro or repeat completed work. A "let me verify from scratch" pass treats the trail as untrustworthy, although it is authoritative input.
4. Route the remaining work to its matching playbook. Choose whether to continue execution or ship a finished recommendation. Other choices are to ratify or override a prior conclusion, or do a postmortem of a failed run. The pickup playbook ends here. The routed playbook owns the remaining work.
5. Verify the inherited claims against the original goal on the real artifact. Follow Prove It Works (`astack skill-path astack:principles references/prove-it-works.md`). A passing prior self-report is not proof.

#### Reply

State where the prior agent stopped.
Name what you inherited and what you repeated.
Ideally, you repeated nothing.
Give the resume point and outcome.
