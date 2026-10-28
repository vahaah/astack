---
name: "astack-diagnosing-bugs"
description: "Diagnosis loop for hard bugs, flaky tests and performance regressions. Use when the user says \"diagnose\" or \"debug this\", or a bug or regression resists a first look. Not for questions about how code works."
---

# Diagnosing Bugs

Use this process for hard bugs.
Skip a phase only with an explicit reason.
Before code exploration, read the repo glossary when present.
Use `CONTEXT.md`, or `GLOSSARY.md` where the repo already uses that name.
Read ADRs for the affected area too.

## Redact

Commands, outputs and captured artifacts can expose secrets.
Replace every secret with `<REDACTED>` before you show it.
Build loops around environment variables so credentials stay in the environment.
Captured artifacts can include auth headers.
Quote only the lines needed for diagnosis.
If redaction removes necessary evidence, explain the limit and ask the user.

## Phase 1: Build a feedback loop

First build a precise pass/fail signal for this bug.
Bisection, hypotheses and instrumentation all depend on that signal.
Reading more code cannot replace it.
Give this phase most of your initial effort.
Try different approaches until a usable loop exists.

### Ways to construct one, in roughly this order

1. Write a failing test at the seam that reaches the bug. It can be a unit, integration or end-to-end test.
2. Run a curl or HTTP script against a development server.
3. Call the CLI with a fixture and compare stdout with a known-good snapshot.
4. Drive the UI with Playwright or Puppeteer. Assert the symptom through the DOM, console or network.
5. Replay a captured network request, payload or event log through the isolated code path.
6. Build a temporary test program with the smallest useful system subset. A service with mocked dependencies can expose the path through one call.
7. For intermittent wrong output, run 1000 random inputs through a property or fuzz loop.
8. For a regression between commits, datasets or versions, automate startup and checks for `git bisect run`.
9. Compare the same input across old and new versions, or across two configurations.
10. As a last resort, guide human actions with a copy of `scripts/hitl-loop.template.sh`. Replace example `step` and `capture` lines with this bug's procedure. The script returns captured observations as `KEY=VALUE`. `capture` echoes user input. Use it for observations only. Put sign-in in a `step` so credentials are not captured.

A correct feedback loop resolves most of the diagnosis work.

### Tighten the loop

After a loop exists, improve its speed, precision and repeatability:

- Cache setup, skip unrelated initialization or narrow test scope to make it faster.
- Assert the exact symptom rather than only absence of a crash.
- Pin time, seed randomness, isolate the file system or freeze network inputs to make it repeatable.

A flaky 30-second loop gives weak feedback.
A deterministic 2-second loop supports much faster diagnosis.

### Non-deterministic bugs

Increase the reproduction rate rather than require a perfectly stable reproduction.
Run the trigger 100 times, parallelize it, add stress, narrow timing windows or inject sleeps.
A 50% reproduction rate supports diagnosis much better than 1%.
Keep raising the rate until the loop is useful.

### When you genuinely cannot build a loop

Stop if no loop is possible.
State that limit and list the attempted approaches.
Ask for access to the reproducing environment, a redacted artifact, or permission for temporary production instrumentation.
Useful artifacts include a HAR file, logs, a core dump or a timestamped screen recording.
Never proceed to hypotheses without a loop.

### Completion criterion: a tight loop that goes red

Name one command that you already ran at least once.
Show its invocation and redacted output.
It can name a script, test or curl call.
Make sure it meets every criterion:

- [ ] It drives the real bug path and asserts the user's exact symptom. It can fail for this bug and pass after its fix. Success without errors alone is insufficient.
- [ ] It gives the same verdict each run. For flaky bugs, use the pinned high reproduction rate described above.
- [ ] It takes seconds rather than minutes.
- [ ] The agent can run it unattended. Any human steps use a copy of `scripts/hitl-loop.template.sh`.

If you start forming a theory before this command exists, stop.
Phase 2 requires a command that can detect this specific bug.

## Phase 2: Reproduce + minimise

Run the loop and confirm failure as the bug occurs.
Check every item:

- [ ] The failure matches the user's symptom rather than a nearby, different bug.
- [ ] Repeated runs reproduce the failure, or achieve a high enough rate for an intermittent bug.
- [ ] The captured evidence includes the exact error, wrong output or slow timing needed to judge the fix.

### Minimise

Reduce the reproduction to the smallest scenario that still fails.
Remove inputs, callers, configuration, data and steps one at a time.
Rerun the loop after each removal.
Keep only elements necessary for failure.
This reduces the hypothesis space and gives Phase 5 a focused regression case.

Finish only when removing any remaining element makes the loop pass.
Reproduce and minimize before you proceed.

## Phase 3: Hypothesise

Write 3 to 5 ranked hypotheses before you test one.
This reduces commitment to the first plausible explanation.
State a falsifiable prediction for each hypothesis.

Use the form "If <X> is the cause, then <changing Y> removes the bug, or <changing Z> makes it worse."
Discard or refine a hypothesis without a prediction.

Show the ranked list to the user before testing.
Their domain knowledge may change the ranking or rule out a prior attempt.
Do not block when the user is AFK.
Then continue with your ranking.

## Phase 4: Instrument

Tie every probe to a Phase 3 prediction.
Change one variable at a time.
Prefer tools in this order:

1. Use a debugger or REPL when available. Inspect the relevant value at a breakpoint.
2. Add targeted logs at the points that distinguish hypotheses.
3. Never log everything and then search the output.

Give every debug log a unique prefix, such as `[DEBUG-a4f2]`.
Use that prefix to find all instrumentation during cleanup.

For a performance regression, prefer measurement to logs.
Establish a baseline with a timing program, `performance.now()`, profiler or query plan.
Then bisect.
Measure before the fix.

## Phase 5: Fix + regression test

Write a regression test before the fix only when a correct seam exists.
The test must exercise the real bug pattern as it occurs at the call site.
A one-caller test cannot prove a bug that needs several callers.
A unit test that misses the triggering chain gives false confidence.

If no correct seam exists, record that finding for the next phase.
The architecture prevents a reliable regression test there.

When a correct seam exists:

1. Turn the minimized reproduction into a failing test at that seam.
2. Confirm failure. If you forced failure through a code or fixture mutation, compare it with a pristine copy using `diff`. Confirm the mutation before you trust the result.
3. Apply the fix.
4. Confirm the test passes.
5. Rerun the Phase 1 loop with the original, unminimized scenario.

## Phase 6: Cleanup

Complete every item before you report done:

- [ ] Rerun Phase 1 and confirm the original reproduction no longer fails.
- [ ] Confirm the regression test passes, or document the missing seam.
- [ ] Remove all `[DEBUG-...]` instrumentation and search for its prefix with `grep`.
- [ ] Delete temporary prototypes or move them to a clearly named debug location.
- [ ] State the confirmed hypothesis in the commit body. Follow `astack-write-docs` when available so the next debugger has that explanation.
