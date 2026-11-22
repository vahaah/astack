# Explain the Number

- Ask why the result is not double. Name the resource or code path that sets its limit, such as a lock, the disk or the network. Find that limit in a profile or in the system counters of a run. A guess from the code is not a measured limit.
- List what else the number can measure. Rule out each alternative with evidence. Look for errors, skipped or cached work and code that did not run. Look for default settings, noise and a part too small to matter.
- Keep the run count, the spread and the limit with the number.

For a performance number, run the full `astack:benchmark-checklist` procedure (`astack skill-path astack:benchmark-checklist`).
For an eval result, ask the same questions about the trials.
Did each run do the task?
Does the gap stay across trials and models?

You skipped this principle when the run count, the spread or a named limit is missing.
You skipped it too when the claimed time saved is more than the time of the changed part.

[Prove It Works](prove-it-works.md) checks that an output is real.
