# Perf issue

You own the measurement, plan, review, and verification of the numbers.
Tie every fix to a measurement.
Do not replace measurement with source inspection.

1. Capture a baseline trace through the matching control skill. Vet the baseline and every later number with `benchmark-checklist`.
2. Use `how` to ground hypotheses. Do not claim a performance ceiling before running the code. Try these performance mantras in order, cheapest first.
   1. Do not do it. Stop work whose result nothing uses instead of making it cheaper.
   2. Do it, but do not do it again.
   3. Do it less.
   4. Do it later.
   5. Do it when the user will not notice the delay.
   6. Do it concurrently.
   7. Do it cheaper.
   Stop when an earlier mantra meets the target.
3. Plan the fix from the trace. If it crosses a function boundary, use `architect` first. Delegate implementation to a subagent on the configured perf-issue model, which defaults to `sonnet`. Choose its model and effort for the job under the Subagents rules. Review the diff. Capture a trace after the fix. Follow [Sequence Work into Verifiable Units](../../astack-principles/references/sequence-verifiable-units.md). Verify each attempt before you try the next.
4. Parse and compare the artifacts, such as JSON to sqlite followed by a diff. Flag an inconclusive result or one from the wrong surface. Neither is a pass.
5. Cite the measurement in the PR.
6. Run Opening a PR.

Use Hillclimb (`playbooks/hillclimb.md`) for sustained improvement against a metric instead of a single fix.

## Reply

Report the baseline number, result after the fix, delta, and artifact path.
