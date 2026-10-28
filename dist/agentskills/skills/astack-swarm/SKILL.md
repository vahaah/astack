---
name: "astack-swarm"
description: "Run N parallel workers, collect their results and return one report. Use for /astack-swarm, \"swarm this\", or parallel coverage, races, gauntlets and exploration."
license: "MIT"
metadata:
  astack-version: "0.1.0"
  source: "astack, adapted from pstack"
  disable-model-invocation: "true"
---

# Swarm

Run N parallel background workers on this machine.
Give each repo writer its own git worktree.
Workers can cover separate slices, race on one brief, or combine these shapes.
The parent waits for results and returns one combined report.

## Start

Before any launch, open a task list for these phases:

1. Frame
2. Fan out
3. Aggregate
4. Report

## Phase A: Frame

1. Define the done condition and the artifact or report to return.
2. Partition slices, race N identical briefs, or mix both. Before a race or mixed launch, declare `first pass`, `rank all` or `best-of`.
3. Use the user's N or derive it from the shape. N counts all workers. Use waves if machine or rate limits prevent concurrent execution.
4. Read `swarm workers` from `astack-models.md`. If the rule or line is missing, use `sonnet`. For `auto` or `inherit-parent`, omit `model` to inherit the parent. For an unsupported Agent value, use the default and report that fallback. In a model race, name each arm's model before launch. An external arm, such as `codex`, runs through Bash with `../astack-arena/references/external-seats.md`. Match effort to the job with the Subagents section of **mode** at `../astack-mode/SKILL.md`.
5. Give each writer private output. For commit verification or measurement, name exact SHAs in the brief. A measurement brief also specifies sample count, sample definition and order. Require the worker to record both SHAs and method in its result.

## Phase B: Fan out

Spawn all N workers in one message with `subagent_type: general-purpose` and `run_in_background: true`.
Use the step 4 model.
Leave it unset for `auto` or `inherit-parent`.
Give every repo writer `isolation: "worktree"`.
That checkout starts from the current commit without uncommitted changes.
Commit anything the workers need before launch.
A read-only worker can share the main checkout.

For another starting branch or commit, name the ref in the brief.
Require `git checkout --detach <ref>` inside the worker's worktree before any other work.
Report the returned worktree path and branch for any worker that leaves changes.

Make every brief self-contained.
Include goal, scope, slice or race arm, verification and reporting requirements.
Require `PASS`, `ISSUES` or `BLOCKED` with evidence.
A worker that proves defects returns `ISSUES` with every proven issue, rather than stop at the first.
If a worker drops out, continue with N-1 and report that gap.

## Phase C: Aggregate

Read terminal results.
Reject a result missing the SHAs or method required by its brief.
Respawn that worker once.
After a second miss, record a gap rather than a pass.
Coverage needs a result for every required slice.
For a race, apply the declared first pass, rank all or best-of rule.
Do not paste raw worker output.
Keep a compact results table, one-line issues with evidence, and explicit gaps or dropouts.

## Phase D: Report

Return one chat report with the table, issue lines and gaps or dropouts.
Include the race rule when used.
