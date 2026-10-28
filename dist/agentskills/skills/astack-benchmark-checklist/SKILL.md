---
name: "astack-benchmark-checklist"
description: "Check performance measurements before you report or use them. Use for benchmarks, measured speedups, regressions, or performance-based choices."
license: "MIT"
metadata:
  astack-version: "0.1.0"
  source: "astack"
  disable-model-invocation: "true"
---

# Benchmark checklist

Use this checklist before you report or act on a performance number.
It covers before-and-after results, regressions, hillclimb runs, and choices between libraries or configs.
Answer each question with evidence from a run.

For a rough estimate that the user requests, one run is enough.
Check questions 4 and 7, and report that you ran it once.
Check the other questions if the result looks wrong.
A choice between options always needs the full checklist.

## Prepare the run

1. Write the claim that the result must support.
   For example, "export is 30% faster at p50 on the 60k-row dataset".
2. Read the measurement script.
   Record what it times, counts, and ignores.
3. Check load with `uptime`.
   Check cores with `nproc` on Linux or `sysctl -n hw.ncpu` on macOS.
4. If the machine is busy, identify the work.
   If you cannot stop it, alternate the compared runs so each side sees the same noise.
   Report that limit.

## Check the result

### 1. Name the limiter

Find the resource that prevents twice the throughput.
Profile a separate run because a profiler or tracer changes timing.
Map the hot spot to source.

Use the tools that fit the resource:

- CPU per process: `top` or `pidstat` on Linux.
  On macOS, use `top -l 1 -o cpu` or `ps -o pid,%cpu,command`.
- Runtime profiles: `node --cpu-prof`, `py-spy`, or `perf` on Linux.
  On macOS, use `sample <pid>` or Instruments.
- I/O wait: `iostat` or `fs_usage` on macOS.
- System calls: `strace -c` on Linux or `dtruss -c` on macOS.
  `dtruss` needs root and often a relaxed System Integrity Protection setting.

Watch the load generator too.
If it saturates first, the number measures that limit.
If a change leaves the result unchanged, find the limiter before you call the change useless.

### 2. Match production settings

Run each side with its production build, flags, environment, versions, and data.
Match batching, transactions, connection pools, and the cache state that production uses.

If one side uses defaults, the run compares configs as well as implementations.
A commit per row, a debug build, or a missing index can create the limiter.
Tune that side and measure again before you choose an option.
If you cannot tune it, do not choose a winner from that run.
A claim about the current defaults does not support a broader adoption choice.

### 3. Check physical limits

Compare bytes per second with disk and network bandwidth.
Compare operations per second times cost per operation with the available cores.
Compare the time saved with the time the changed code took before the change.

Removing work that takes 10% of the run can make the run at most about 11% faster.
A result beyond that limit can measure a cache, a no-op, or a bug.

### 4. Count errors

Count failures and non-success responses.
Check output correctness as well as output presence.
Rejections can be fast, while timeouts and retries can be slow.
If the script does not count errors, add that count.

### 5. Repeat the measurement

Run each side at least 5 times.
Alternate A, B, A, B, and so on.
This keeps warmup, lazy initialization, caches, and drift from favoring one side.
Report the median and range.

A gap smaller than the variation between runs is no measurable difference.
For a close result, use a rank-sum test or the test driver's own statistics.

### 6. Measure the user path

Alongside a small isolated measurement, measure the full path that a user waits for.
Use realistic data sizes and concurrency.
Report the isolated result as a share of the full path.
A helper that takes 1% of a request can save at most that share of its total time.

### 7. Prove the work ran

Check that the work happened inside the timed region.
Confirm that requests reached the server, rows were written, bytes were read, and code consumed the result.
A generator that nobody iterates or a promise that nobody awaits can measure no work.
A JIT can discard unused results.
A timeout can end before the work finishes.

## Report the verdict

Lead with `faster`, `slower`, `no measurable difference`, or `inconclusive`.
Give the number, unit, run count, range, and limiter.
For example, "p50 41 ms to 33 ms, median of 7 runs per side, range 32 to 35 ms after".
Then name the limiter, such as JSON parsing on one core.

Use `inconclusive` for a claimed difference without a known limiter.
Use it when a side ran untuned or you could not check questions 4 and 7.
Name the missing proof.

Keep a PR body to one primary number.
Follow the Opening a PR playbook at `../astack-mode/playbooks/opening-a-pr.md`.
Put run details, ranges, and limiter evidence in a linked artifact or notes file.

## Check other performance work

Check the baseline before the Perf issue playbook plans from it.
Check every later number too.
Read `../astack-mode/playbooks/perf-issue.md`.

Check the Hillclimb test driver before it becomes frozen.
Read `../astack-mode/playbooks/hillclimb.md`.
The frozen driver prints error and work counts for each keep-or-revert decision.
Those counts provide the proof for questions 4 and 7.
