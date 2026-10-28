---
name: show-me-your-work
description: "Keep a TSV decision trail for long or unattended work. Store it locally unless a reviewer needs a committed trail."
disable-model-invocation: true
metadata:
  origin: pstack
---

# Show me your work

Keep one canonical decision log for the run.
Read each applicable principle in full under `${CLAUDE_SKILL_DIR}/../principles/references/<title>.md`.

## Use the TSV format

Use one TSV file with one row per decision.
Keep every cell on one line.
Use evidence pointers instead of prose in the evidence cell.
Start with the header from `references/decision-log-template.tsv`.

| Column | Value |
|---|---|
| `ts` | ISO8601 timestamp. |
| `phase` | Phase or workstream. |
| `decision` | The choice or action, in one line. |
| `why` | The reason in plain words. State a principle directly instead of naming jargon. |
| `evidence` | Commit SHA, PR number, `file:line`, or an artifact, trace, or screenshot path. |
| `result` | Outcome or predicate state, such as `tests green`, `reverted`, `pixel-diff 0`, `INCONCLUSIVE`, or `open`. |

For example:

```
ts	phase	decision	why	evidence	result
2026-05-24T09:02:00Z	frame	counted the work first, about 100 components and roughly 75 hours	wanted to know the size before starting a long run	commit 3a9f1c2	found 5 things to sort out before starting
2026-05-24T09:40:00Z	harness	took screenshots of the old version before changing anything	so we can compare old against new and catch any visual change	scripts/snapshot.sh, baseline/	saved 120 reference screenshots
2026-05-24T11:15:00Z	widget	moved the widget styles over without changing how it looks	keep the change small and the result identical	commit 7c21e0a, pixel-diff 0	looks identical, tests pass
2026-05-24T12:30:00Z	widget	threw out a helper's work because its screenshots were blank	checked the real files instead of trusting its summary	worktree reset	reverted, tightened the instructions for next time
```

## Append a row

Describe the decision as you would to a teammate.
Use concrete actions and plain words.
Follow `${CLAUDE_SKILL_DIR}/../write-docs/references/unslop.md` for log prose.

Run `${CLAUDE_SKILL_DIR}/scripts/log.sh <logfile> <phase> <decision> <why> <evidence> <result>`.
The helper writes the timestamp and adds a header on first use.
It removes stray tabs and line breaks.
It prefixes a cell that starts with `=`, `+`, `-`, or `@` with a single quote.
If you append with `printf`, handle those bytes too, especially for generated or user-supplied text.

Log decisions and checkpoints, not every action.
Include a chosen option, completed unit with proof, changed approach, revert, blocker, or corrected gate.
For a loop, write one row per iteration.
Skip trivial actions whose reason is self-evident.

## Mark each run's rows

One agent conversation is one run, including later turns and summaries.
A pickup, replacement agent, or new chat starts another run.

When you append to a log that already has rows, use `start` as your first row's phase.
Do the same before your first row after another run's `start` row.
Before later writes, read the last rows to detect another run's work.

A `start` row identifies the `ts` range of preceding rows that this run did not write.
Its evidence identifies this run, such as `${CLAUDE_SESSION_ID}`.
Use phase `start` only for this purpose.

## Store the log locally by default

Keep `decisions.tsv` in the work directory.
For concurrent efforts, use `.audit/<task-slug>.tsv`.
Leave the working log outside git.

Commit it only when a reviewer needs the trail to assess substantial work.

## Preserve history

Append corrections as new rows that supersede wrong decisions.
Never edit or remove previous rows.
Prefer evidence from committed scripts over one-off checks.
Apply `encode-lessons-in-structure`.

## Audit the log against the transcript

Before the final report, check that the log matches actual actions.
Read this run's transcript under `${CLAUDE_CONFIG_DIR:-~/.claude}/projects/`.
This command locates its `${CLAUDE_SESSION_ID}.jsonl` file:

`ls ${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects/*/${CLAUDE_SESSION_ID}.jsonl`

Subagent transcripts sit beside it in `${CLAUDE_SESSION_ID}/subagents/`.
Do not read unrelated transcripts under `~/.claude/projects/*/`.

Audit only this run's stretches of rows.
A stretch begins at this run's `start`, or at the first row if this run created the log.
It ends at the next `start` from another run.

- Check that each row records a real action or decision.
- Follow each evidence pointer and check its claim.
- Add a missing option, changed approach, or abandoned attempt that affected the result.

Correct the log through new rows.
If a row invents an action or cites wrong evidence, supersede it with the actual event and a valid pointer.
Do not edit or delete it.

Do not audit another run's rows as part of this pass.
If your own work proves one of those rows wrong, supersede it in the same way.

## Get an independent review

Before the final report, use a reviewer from a different model family.
Self-review does not satisfy this step.
For Claude work, use an external seat in read-only mode.
Follow `${CLAUDE_SKILL_DIR}/../arena/references/external-seats.md`.

Use the first external entry on `arena cross-judge pool` in `astack-models.md`.
If that line has no external entry, use `codex`.
If no external CLI works, use a Claude subagent on a different model from the worker.
Report in Attention that the review stayed in one family.
Follow effort rules in `${CLAUDE_SKILL_DIR}/../mode/SKILL.md`.

Give the reviewer the trail and this run's transcript.
Ask for risks that the user could miss, rather than a repeat of the work:

- Decisions with weak or absent evidence.
- Skipped checks or claims without transcript proof.
- Premature choices, scope growth, or fixes that hide a symptom.
- Other material gaps in the record.

Every reply for a run with a trail ends with an `Attention` section.
Its first line is `reviewed by <model>`.
Then list flags with pointers to rows or transcript moments.
`No flags` is a valid result.
The model name alone is not a result.

## Read the trail

Read from top to bottom and follow evidence pointers.
GitHub displays a committed TSV as a table.
Use `column -s$'\t' -t decisions.tsv` in a terminal.

Other skills refer to this skill for decision trails.
Keep the format here instead of repeating its columns elsewhere.
