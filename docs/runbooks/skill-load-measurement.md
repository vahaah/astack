# Measure the load of a skill

Use this runbook to compare the instruction text that a selected path reads.
It keeps source metrics apart from the figures that only a real host can give.

## Kinds of evidence

| Kind | Source | Status |
|---|---|---|
| Source words and bytes of the files in a read set | `bun scripts/skill-load-report.ts` | Measured on source files |
| Fallback parity and pointers of the read sets | The same script and `tests/skill-load-report.test.ts` | Structural |
| Prompt tokens, cache use, model calls, time and cost | A matched run with host counters | Unavailable until a run records them |
| What the host lists, keeps or drops | The host diagnostics below | Measured on one host and one session |

A smaller read set proves only that the instructions select less source text.
It does not prove faster work or a lower bill.
Never write a counter that no run observed.
Report it as unavailable.

## Run the report

1. Run `bun scripts/skill-load-report.ts`. It compares the working tree with the base revision `dbed1c9`. Use `--base <rev>` for another revision.
2. Add `--json` to keep the rows and the limits as data.
3. Read the last lines of the output. They name the units and the limits.
4. A shallow clone can lack the base revision. Then the script prints `n/a` for the before columns and runs the structural checks only.

A read set is an explicitly configured set of direct files for one path.
The report does not expand shared or transitive dependencies.
It is not a trace of a real run.
The old plan baseline includes every skill name in its composition section, including conditional names.
It is a broad source-list interpretation, not the required input for S0 or resume.
The script exits 1 when a pointer is missing or when the moved fallback differs from the inline fallback of the base revision.

## Diagnose a real host

Run these on the client that loads the plugin.
Each one reports what that client does with the installed plugin, not what the source files hold.

1. Run `/context`. The Skills row shows the listing after the host applies its budget.
2. Run `/doctor` and `/skill-doctor` when the installed client supports them.
3. Run `claude plugin eval` to test that a prompt starts the intended skill. Use a `tool_used: Skill` grader for the routing check.
4. After a compaction, ask for the next step of a hardening run. Make sure that the run reads the engine again and still names its stop and merge rules.

`skillOverrides` does not control the skills of a plugin.
Do not use it to measure or to change a plugin skill.

## Limits

- Claude Code can drop the descriptions of the skills that a session invokes least, when the listing has too many skills. A description length in source does not show what the model receives.
- The Claude Code documentation says that a compaction keeps only the first part of each invoked skill, within a shared budget. This repo did not count tokens for the hardening engine, so no run can claim a boundary.
- Codex budgets its catalog too. A skill that blocks implicit invocation can still leave its metadata in the catalog.
- Cache accounting differs by provider. Anthropic splits uncached input, cache writes and cache reads. OpenAI reports total input with cache details.
- Compare tasks on the same code, model, effort, tools and environment. Record the route that the run took and the required check results.
