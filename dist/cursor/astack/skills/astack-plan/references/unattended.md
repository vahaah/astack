# Unattended runs

Run `astack plan attended` at S0, as its own Bash call. It prints `unattended` for `CLAUDE_CODE_SESSION_ATTENDED=0` or an `sdk` entrypoint, which a headless or SDK run sets. Else it prints `attended`. The SessionStart hook and `astack doctor` name the variable. When the prompt hook notes that a person typed the prompt, treat that turn as attended.

A host that relays the typed prompts of a person must not set `CLAUDE_CODE_SESSION_ATTENDED=0`, and must not use an `sdk` entrypoint. An unattended session takes a merge grant only from `merge.authority` or `merge.standingBases` in `.astack/profile.json` on the PR base branch.

A run is also unattended when the invocation says `--afk`, or when this skill runs inside a subagent or a workflow worker. A grill that nobody answers gives your opinion, not the owner's, so never simulate S2.

A delegation grant is not an unattended run. Under a grant the owner is there, and the owner gates still stop the work. A typed "full send" gives a merge grant for that turn.

- An unattended run never ends at the quick tier. It writes a draft standard plan, even with one session, so the defaults and the queued round stay. Log a `tier` row that says why.
- Run S0, S1, S4, S5 and S6 as usual. Run each subagent in the foreground, as the end of the agent briefs in `stages.md` says. The S4 and S6 leads also keep their own nested agents in the foreground. A headless session ends with your turn, so finish each stage and write the plan in that one turn.
- In S4, skip `astack-arena` unless the work has a one-way door. An arena in a headless run costs much time and many tokens, and nobody can judge its result before the plan ends.
- Sort the frontier as `routing.md` says. Agent calls, and owner calls with one clear best option, become `default` rows with their full reason.
- Send one-way doors and calls about the destination or the scope to `## Unresolved questions`. Add `Blocks. <session>.` where a question holds a session up.
- Write `## Unresolved questions` as the next round, ready to answer. Glossary changes and ADRs stay `Proposed`, inside the plan.
- Keep `status: draft` and `execute: none`. The checker enforces both.
- Write nothing to the tracker unless the invocation allows it. Then write only what the tier allows.

End the run with the reply in SKILL.md. It gives the plan path, the summary line of the checker and the count of queued questions. The next attended `/astack-plan <slug>` asks that round first.

A resume that is itself unattended logs its `start` row and nothing else. It leaves the plan as it is, replies with the plan path and the queued count, and stops.
