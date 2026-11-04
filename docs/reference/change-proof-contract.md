# ChangeProof admission requirements

[ADR 0005](../adr/0005-every-change-carries-domain-and-formal-proof.md) governs mandatory admission.
[ADR 0006](../adr/0006-internal-composition-records-follow-domain-effects.md) governs typed composition and law evidence.
[ADR 0008](../adr/0008-ratified-landing-metadata-requires-an-explicit-opt-in.md) governs the explicit history-bound proposal route and its selected landing-value option.
The [installed contract](../../marketplace/plugins/astack/skills/pr-review-hardening/references/proof-contract.md) gives the format and runner limits.

## Acceptance criteria

- [criterion:CP-01] Missing contracts and summary-only results cannot admit a delivery.
- [criterion:CP-02] Admission requires complete positive, expected negative, and unchanged restored-positive results.
- [criterion:CP-03] A syntax error, wrong violation, or unchanged passing countermodel cannot count as the negative control.
- [criterion:CP-04] Scope and candidate binding use lossless entry records for live edits, executable modes, staged edits, submodule state, removals, and nonignored untracked files.
- [criterion:CP-05] Model dependencies, configurations, and mutation targets remain explicit and safe under the supported subset.
- [criterion:CP-06] Domain, symbol, control, and governing ADR references must resolve to current integrated contracts.
- [criterion:CP-07] Declared arrows compose, effects stay explicit, and applicable laws have witnesses for the actual carrier.
- [criterion:CP-08] Tool exits, complete protocol output, state counts, and expected violations must agree.
- [criterion:CP-09] A wrong jar or unavailable required Java runtime blocks admission.
- [criterion:CP-10] Timeout or cleanup failure leaves no admitted result or live owned process.
- [criterion:CP-11] Every adopted profile requires an unrestricted, nonoptional, unsuppressed executable proof gate with a checked success marker.
- [criterion:CP-12] A blocked installation transition preserves review state and remains a visible principled stop.

## Claim boundary

The checker validates declared references, composition structure, current input binding, and actual TLC outcomes.
It does not infer domain meaning, prove arbitrary implementation correspondence, or establish private reasoning.
The governing ADR connects those distinct proof duties without treating one as another.
