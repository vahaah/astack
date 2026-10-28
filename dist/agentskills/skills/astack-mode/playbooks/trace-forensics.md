# Trace forensics

You own the diagnosis from an existing artifact.
Runtime forensics instruments a live process instead.
This capture is a fixed dataset.
Read it without running the task again.

Keep tools generic.
Use a DevTools or trace parser for cpuprofile and `.json.gz`.
Use a text editor for a spindump and heap tooling for a heapsnapshot.

1. Identify the format. Load it with the right tool. Parse large artifacts in a subagent under `principles`. Keep the reduced finding in the main thread. Choose its model and effort for the job under the Subagents rules.
2. Transform the raw artifact into a form that you can query. Put a trace or heap snapshot into sqlite, with one row for each sample, frame, or node. Reach that shape before reading the artifact.
3. Query the frames that hold the most time. Follow the call tree to the hot path. For a leak, follow the retainer chain from the leaked object to a GC root. For a spindump, find the thread stuck on-CPU or blocked and its wait reason.
4. Map the hot frame to its source file, symbol, and line through the artifact's own symbols. A frame without source mapping is not yet a diagnosis. Resolve the symbols or state plainly that the artifact does not contain them.
5. When a paired capture exists, compare the before and after artifacts to confirm the finding. Otherwise, label it as the strongest hypothesis that the artifact supports, not a confirmed cause.
6. Return a cited diagnosis. Do not fix unless asked. Route to Bug fix or Perf issue once the cause is known. Keep the throughput checkpoint to one line: `throughput checkpoint: n/a, read-only forensics`.

## Reply

Report the artifact, format, reduced finding, source location, and artifact paths.
State whether a paired capture confirmed the finding.
