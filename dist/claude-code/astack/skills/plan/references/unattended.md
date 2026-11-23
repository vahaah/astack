# Unattended runs

Run `astack plan attended` at S0. It prints `unattended` for `CLAUDE_CODE_SESSION_ATTENDED=0` or an `sdk` entrypoint, and `attended` otherwise. When the prompt hook notes a typed prompt, treat the turn as attended.

A host relaying typed prompts must not set `CLAUDE_CODE_SESSION_ATTENDED=0` or an `sdk` entrypoint.
An unattended session takes a merge grant only from `merge.authority` or `merge.standingBases` in `.astack/profile.json` on the PR base branch.

A run is also unattended under `--afk`, or inside a subagent or workflow worker. Never simulate S2.
A delegation grant is not unattended: owner gates still stop work, and a typed "full send" grants a merge for that turn.

- Never end at `quick`. Write a draft standard plan and log a `tier` row so defaults and queued questions stay.
- Run S0, S1, S4, S5 and S6 in one turn with every subagent in the foreground (`stages.md`).
- In S4, skip `astack:arena` unless a one-way door exists.
- Write agent calls and clear owner calls as `default` rows with full reasons.
- Put one-way doors and scope or destination calls in `## Unresolved questions` (with `Blocks. <session>.`) ready for the next round. Keep glossary and ADR proposals inside the plan as `Proposed`.
- Keep `status: draft` and `execute: none`. Write to the tracker only when allowed.

End with the `SKILL.md` reply. An unattended resume logs only its `start` row, prints plan path and queued count, and stops.
