# Runtime forensics

You own the diagnosis.
Instrument the live process instead of inferring from source.
Deliver a cited diagnosis, not a fix.

1. Capture a live signal through the control skill on the matching surface. Use a CPU profile for a spinning process, heap snapshot for a leak, or CDP trace for a visual glitch. Capture a real artifact, not a guess.
2. Reduce the artifact to the decisive evidence. Examples include a function on the hot path, a retainer chain from a leaked object to a GC root, or a loop firing without input. Parse large artifacts in a subagent under [Guard the Context Window](../../astack-principles/references/guard-the-context-window.md). Keep the reduced finding in the main thread. Choose its model and effort for the job under the Subagents rules.
3. Prove the mechanism before accepting it. Inject instrumentation through CDP eval on the running process, or apply a live hotfix without reloading. Use that probe to confirm the hypothesis cheaply.
4. Map the finding to its source file, symbol, and line that allocates or schedules the work.
5. Keep the throughput checkpoint to one line: `throughput checkpoint: n/a, read-only forensics`.

## Reply

Report the captured signal, reduced finding, mechanism proof, source location, and artifact paths.
Do not fix unless asked.
Return to Bug fix or Perf once the cause is known.
