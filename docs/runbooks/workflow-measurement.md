# Measure the PR head check

Use this runbook to measure `astack check pr-head` against the manual head check.
It keeps three kinds of evidence apart, so no number claims more than it shows.

## Kinds of evidence

| Kind | Source | Status |
|---|---|---|
| Process time | `scripts/bench-pr-head.ts` | Measured |
| Source step counts | The head check text of the skill and the stub | Structural, not observed |
| Model tool calls, tokens and complete PR time | A matched run with provider counters | Unavailable until a run records them |

A shorter instruction or a shorter command path proves only that local reduction.
Never write a counter that no run observed.
Report it as unavailable.

## Run the benchmark

1. Run `bun run bundle`, so the built CLI holds the command.
2. Run `uptime`. Write down the load. Load on the machine adds noise to each side.
3. Run `bun scripts/bench-pr-head.ts --runs 11 --out <path outside the tree>`.
4. Open the result file. It holds each duration, the ranges and the verified process counts.

The script builds a real Git repository with a bare origin.
A fake `gh` on the PATH answers each read, and a thin `git` shim counts each Git process.
The built launcher `marketplace/plugins/astack/bin/astack` runs the command.
The manual side runs each operation of the old procedure as its own process.

The script runs one discarded warm-up for each side.
Then it alternates the manual run, the wrapper run and the startup run.
The startup run is the launcher with a usage error, so it starts no `gh` or `git` process.
It times the runtime start alone.

A run counts only when its outputs match the fixture and its process list matches the expected list.
The script lists each other run as failed, and it exits 1.
The script refuses fewer than 5 runs for each side.

## Cases

- The current branch, with HEAD at the PR head.
- The current branch, with three unpushed commits.
- An explicit PR. The skill reads the PR for its selection, and the command reads it once more. Both sides keep the selection read, so the wrapper shows one more `gh` process.

## Read the result

The verdict is `faster` when the slowest wrapper run beats the fastest manual run.
It is `slower` for the reverse, and `no measurable difference` when the ranges overlap.
The verdict is `inconclusive` with fewer than 5 correct runs on a side.

The wrapper starts a runtime for each call, so compare it with the startup row.
Subtract the startup median from the wrapper median to see the work inside the command.

The benchmark times processes only.
It never times a model response, so it cannot show a reduction in model calls or tokens.

## Claim a reduction for complete PRs

Claim a reduction only from matched complete runs.

1. Fix the model, the effort, the task, the code, the tools, the environment and the initial state for each pair.
2. Run the manual procedure and the command on each pair.
3. Count tokens from all agents and retries. Keep cached input counts apart when the provider reports them.
4. Record the total time of each run and every check that ran.
5. Claim a reduction after three pairs lower the total tokens and the median time with every check intact.

A pair that lacks a counter does not count.
Name each missing counter as unavailable in the report.
