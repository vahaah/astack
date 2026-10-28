# Prove It Works

Verify every task output against the real thing directly.
Do not infer correctness from proxies, self-reports, or "it compiles."

## Why

Unverified work has unknown correctness.
Indirect verification can feel cheaper than direct observation.
Examples include file mtimes, output freshness, agent self-reports, and cached screenshots.
Acting on a wrong inference costs far more than checking the source.

- Check process liveness directly, not through derived state.
- Read the actual value, not a cached or derived representation.
- When verification fails, question the observation method before the system.

## Script the check when you can

The strongest proof is a deterministic script that reruns the same comparison.
A single visual inspection is weaker evidence.
Write the script.
Run it.
Keep the script and its output for a reviewer.
The reviewer can rerun the check instead of trusting your word.

Keep the artifact visible for the human.
Commit it only when large or complex work needs an audit trail.
A large port or migration can need this trail (`astack:show-me-your-work`, at `astack skill-path astack:show-me-your-work`).
