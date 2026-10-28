# Explain the Number

- Ask "why not double?" Name the resource or code path that bounds the result. Examples include a core, a lock, the disk, the network, or the load generator itself. Find that limit in a profile or in system counters from a run. Map it to source. A guess from reading the code is not a measured limit. If you cannot explain why the number is not twice as good, you do not know what you measured.
- List what else the number could measure. Rule out each alternative with evidence. Check for errors and skipped or cached work. Check for code that never ran and a side left on default settings. Check for noise and a piece too small to matter end to end.
- Keep the evidence with the number. Put the run count, spread, and limiter in the notes or a linked artifact.

For a performance number, run the full `astack-benchmark-checklist` procedure (`astack skill-path astack:benchmark-checklist`).
For an eval result, ask the same questions about the trials.
Did every run do the task?
Does the gap hold across trials and models?
Does the scenario matter?

Missing run counts, spread, or a named limiter mean that you skipped this principle.
The same is true when claimed time savings exceed the time that the changed piece took.

[Prove It Works](prove-it-works.md) checks that an output is real.
