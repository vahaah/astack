# Visual parity

You own exact pixel equivalence.
The baseline is the spec.
Do not change it.
Use image diffs to prove equivalence rather than visual judgment.

1. Establish the baseline before any migration. Use a regression harness that captures the current component across its states. Also capture the target when matching two implementations. Without a baseline, make no parity claim. This prerequisite blocks the work instead of becoming a follow-up.
2. State and enforce the shortcut bans. Do not modify the harness, tamper with the baseline, or restructure a component to make a diff pass. If the baseline looks wrong, stop and ask instead of editing it.
3. Migrate one component at a time. Parallelize through worktrees with one owner for each component. Follow [Separate Before Serializing Shared State](../../astack-principles/references/separate-before-serializing-shared-state.md). Migrate shared primitives first as a blocking phase.
4. Compare each component with its baseline through image diff on the matching surface with the control skill. Any nonzero diff fails. Investigate the pixel delta. Use `/loop` for each component until its diff is zero.
5. Run Opening a PR for each component or safe batch.

## Reply

Report the migrated components, each diff result, baseline harness location, and remaining work.
