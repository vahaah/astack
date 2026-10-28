# Hillclimb

You own the metric and the experiment's integrity.
Supervise the work and review the attempts.
Delegate those attempts.
Use this loop for sustained improvement of one measurable result against a target.
Use Bug fix or Perf issue for a single fix.

Make one change.
Measure its effect.
Keep or revert it.
Never stack untested changes.
Never claim a win from code inspection.
Follow [Prove It Works](../../astack-principles/references/prove-it-works.md).

1. Ground the workload and architecture before choosing the metric. Use `how` over the target. Name realistic workload dimensions that can change the result, such as data size, history, state, or concurrency. Select a case that reproduces the user's complaint. If none reproduces it, fix the reproduction before hillclimbing. Choose one fixed metric. State which direction counts as better. Set a verifiable stop predicate. Pair the target with a minimum attempt count so a lucky early win cannot end the run. The example "at least 50% better than baseline and at least 10 iterations" has this shape. Use the user's numbers when given. Otherwise, agree them with the user.
2. Build the measurement harness under [Build the Lever](../../astack-principles/references/build-the-lever.md). Prove its sensitivity before you freeze it. Run contrasting realistic workloads. Confirm that the target case reproduces the symptom and easier cases separate as expected. If the harness cannot distinguish them, revise the workload or metric. Vet the harness with `benchmark-checklist` before freezing it. Make it print its error count and the count of work done. Freeze one repeatable command that emits a metric from enough samples to distinguish the result from noise. Use a median of N rather than a single run. Record the baseline metric and a green regression-gate run before any change. The regression gate is the tests that must keep passing.
3. Open the decision log through `show-me-your-work`. Keep a `decision.tsv` with one row per attempt: id, hypothesis, change, before, after, delta, tests, verdict (kept or reverted), note. Read it before each attempt. Keep it outside the tracked tree through gitignore.
4. Ground each hypothesis in the architecture model from step 1. Name a specific mechanism, such as "defer X off the boot path because it blocks first paint". Do not use a vague hypothesis such as "try memoizing something". For a performance metric, use the mantra order from Perf issue step 2 (`playbooks/perf-issue.md`). Borrow that order, not its stop rule.
5. Run one hypothesis per iteration.
   - Give the change and a tight scope to a subagent on the configured hillclimb model, which defaults to `sonnet`. Choose its model and effort for the job under the Subagents rules. Supervise it and review the diff instead of writing the change yourself. Follow [Guard the Context Window](../../astack-principles/references/guard-the-context-window.md). Delegate independent live hypotheses in parallel, each in its own worktree through `isolation: "worktree"`. Follow [Separate Before Serializing Shared State](../../astack-principles/references/separate-before-serializing-shared-state.md).
   - Measure before and after with the frozen harness. Run the regression gate.
   - Accept only when the metric improves beyond noise and the gate stays green. Otherwise, revert the whole change. Do not keep a tweak that "might help".
   - Make one commit for each accepted fix. Stage only changed files with `git add <files>`, never `-A`. Log the row whether you kept or reverted the change.
   Each iteration ends in a check before the next begins, under [Sequence Work into Verifiable Units](../../astack-principles/references/sequence-verifiable-units.md). For an unattended run, borrow only the wake mechanism from Autonomous run (`playbooks/autonomous-run.md`). Do not borrow its stop rule.
6. Continue beyond the first plateau. On a stall or several rejections, try another strategy before declaring the work complete. Options include changing category, combining near-misses, rereading source, or trying a more radical approach. Correctness and simplicity take priority over the number. Revert a win that breaks behavior. Keep a simplification that holds the number, under [Laziness Protocol](../../astack-principles/references/laziness-protocol.md).
7. Stop when the predicate is met or remaining ideas offer marginal value that does not justify their cost. Do not relax the predicate to meet it. Do not quit while cheap untried hypotheses remain. If stuck, surface that fact instead of repeating attempts without progress.
8. Run Opening a PR with accepted commits stacked in the order they landed.

## Reply

State the metric, target, baseline, final result, and percent delta.
Report total iterations, with kept and reverted counts.
Give each accepted fix one line.
Include the `decision.tsv` path.
Name the best idea you would try if the work continued.
