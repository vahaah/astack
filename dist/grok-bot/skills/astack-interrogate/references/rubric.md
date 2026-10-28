# Review Rubric

Apply the relevant lenses below.
A change does not need every lens.

## Correctness

Check whether behavior meets the intent.
Examine these cases:

- Empty input, nil or undefined, limit values and concurrent access.
- Errors that are caught, returned, propagated or silently swallowed.
- Off-by-one errors, coercion, integer overflow and string encoding.
- Races, stale closures and dangling references.
- Both success and failure paths.
- A repeated operation or restart after a partial failure. If leftover state changes the result, look for missing reconciliation.
- Several actors writing shared files, branches or data. Require structural serialization, such as locks, sequential phases or exclusive ownership. A convention alone may not hold.

Trace every potential bug through a real execution path.
For a possible nil value, show the call chain that can produce it.

## Root Causes vs. Symptoms

Check whether the change fixes the cause or hides a symptom.
Read callers, callees, types and sibling modules beyond the diff when needed.
Use file reads and `rg` or `grep` to trace the architecture and its purpose.
Look for these signs:

- A guard hides a violated invariant.
- A retry hides a broken contract.
- A cast hides the wrong data model.
- A workaround lacks a reason or a proper root fix.
- Module A patches a contract that Module B should correct.
- A comment or convention asks people to avoid a mistake that a type, lint or runtime check could prevent.

## Structural Integrity

Judge how the code fits the system:

- Validate at system edges once, then trust internal types. Do not spread validation through business logic.
- Keep orchestration and low-level detail at appropriate abstraction levels.
- Identify new coupling that makes later changes harder.
- Compare data structures with actual access patterns.
- Ask whether the design fits the new requirement as if it had been known from the start.
- For a replaced API with no external consumers, move all callers and delete the old path in the same wave. Do not retain a temporary compatibility layer indefinitely.

Do not penalize simple code for lacking abstraction.
Premature abstraction is worse than duplication.

## Verification

Inspect the evidence that the code works:

- Tests exercise behavior rather than implementation details.
- Assertions and invariants detect regressions.
- A bug fix has a test for its bug.
- An integration change tests the full path.
- Checks read the real value rather than a proxy, such as file mtime or cached state for liveness.
- Delegated and asynchronous work verifies output artifacts rather than trusting reports or summaries.

## Complexity Budget

Compare complexity with the result it provides.
Look for these costs:

- Code that can be simpler without losing correctness or clarity.
- Abstractions with one call site.
- Configuration and parameters for cases that do not exist.
- Dead code, unused imports and obsolete parameters.
- Speculative paths with no current callers.
- Compatibility code retained after its migration ends.
- Features, controls and options whose experience does not justify their complexity. An incomplete feature can be worse than no feature.

Prefer the simpler design unless it is wrong.

## Security

Trace and show the input path for each security finding.
Check these paths:

- Unfiltered user input reaching SQL, shell, eval or innerHTML.
- Missing authentication or authorization on new endpoints.
- Secrets in code, logs or errors.
- Time-of-check-time-of-use, TOCTOU, in security-critical operations.
