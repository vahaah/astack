# ChangeProof admission requirements

[ADR 0005](../adr/0005-every-change-carries-domain-and-formal-proof.md) governs mandatory admission.
[ADR 0006](../adr/0006-internal-composition-records-follow-domain-effects.md) governs typed composition and law evidence.
[ADR 0008](../adr/0008-ratified-landing-metadata-requires-an-explicit-opt-in.md) governs the explicit history-bound proposal route and its selected landing-value option.
[ADR 0014](../adr/0014-each-proof-stop-names-its-cause.md) governs what each stop names.
[ADR 0015](../adr/0015-change-proof-follows-risk.md) governs the proof rung, and [the ladder requirements](proof-ladder.md) give its criteria.
[ADR 0016](../adr/0016-each-change-carries-its-own-proof-manifest.md) governs the manifest of each change and the ordinary ADR rule.
The [installed contract](../../marketplace/plugins/astack/skills/pr-review-hardening/references/proof-contract.md) gives the format and runner limits.

## Acceptance criteria

- [criterion:CP-01] Missing contracts and summary-only results cannot admit a delivery.
- [criterion:CP-02] At R4, admission requires complete positive, expected negative, and unchanged restored-positive results for each selected model. The three runs of a model start together, and the checker judges them in the order positive, negative, restored.
- [criterion:CP-03] A syntax error, wrong violation, or unchanged passing countermodel cannot count as the negative control.
- [criterion:CP-04] Scope and candidate binding use lossless entry records for live edits, executable modes, staged edits, submodule state, removals, and nonignored untracked files.
- [criterion:CP-05] Model dependencies, configurations, and mutation targets remain explicit and safe under the supported subset.
- [criterion:CP-06] Domain, symbol, control, and governing ADR references must resolve to current integrated contracts.
- [criterion:CP-07] Declared arrows compose, effects stay explicit, and applicable laws have witnesses for the actual carrier.
- [criterion:CP-08] Tool exits, complete protocol output, state counts, and expected violations must agree.
- [criterion:CP-09] At R4, a wrong jar or unavailable required Java runtime blocks admission.
- [criterion:CP-10] Timeout or cleanup failure leaves no admitted result or live owned process. When the judge order gives a result, the checker kills the live runs and removes their temp roots before it stops.
- [criterion:CP-11] Every adopted profile requires an unrestricted, nonoptional, unsuppressed executable proof gate with a checked success marker.
- [criterion:CP-12] A blocked installation transition preserves review state and remains a visible principled stop.
- [criterion:CP-13] With `--base <ref>`, the scope and the snapshots read from the merge base of the ref and HEAD. The manifest base must be an ancestor of that merge base. Replace objects and grafts cannot change a base or hide a changed path.
- [criterion:CP-14] Each CI run of `scripts/check-proof.ts` passes a base. A push to the default branch and a release use the first parent of HEAD. A branch push whose HEAD the default branch holds also uses the first parent of HEAD. A push to another branch uses the default branch.
- [criterion:CP-15] The base branch can change the authority of a ratified ADR after the manifest base. Then the stop names the ADR, both commits and the repair. A change of only the selected Landed value does not stop.
- [criterion:CP-16] A local run of `scripts/check-proof.ts` reads `origin/HEAD`. A clean HEAD that the default branch holds uses the first parent of HEAD, and each other HEAD uses the default branch. With no `origin/HEAD` that resolves, or no first parent, the run keeps the manifest base.
- [criterion:CP-17] The proof reads TLC output with CR LF line ends as it reads output with LF line ends.
- [criterion:CP-18] A SANY error stop names the module, the first line and column and the message line of the error.
- [criterion:CP-19] A failed run names its invariant or property. It prints at most 20 numbered steps of 200 characters, then a count of the rest.
- [criterion:CP-20] A stale stop names each changed path, the index or the ratification history. A run past the deadline names its last progress record.
- [criterion:CP-21] Each stop writes one stderr line with the proof contract section of its stage. The example manifest of the proof contract parses, and the schema accepts each carrier form of the proof contract.
- [criterion:CP-manifest-merge] Two branches that each replace the base manifest with their own merge with 0 conflicts after one of them merges. `check proof --base main` admits the second, whose scope lists the deleted manifest exactly.
- [criterion:CP-manifest-search] With no `--base`, the one present manifest under `.astack/proof/` admits, and the first line names it. Two manifests stop with both names. A tree with no manifest there reads `.astack/proof.json`.
- [criterion:CP-manifest-base] With `--base`, two manifests that the diff from the merge base changes stop with both names. A diff that changes none stops and names the merge base. A manifest that the merge base holds stops with its path, also in `check ci-pins`.
- [criterion:CP-manifest-held] A tree that keeps a manifest of its manifest base stops with that path, also when the change rewrites it as its own. `.astack/proof.json` beside a folder manifest stops too. An unstaged delete of the base manifest admits.
- [criterion:CP-adr-decision] An Accepted ordinary ADR that explains the arrows only under the cited decision passes the domain stage. A decision with only subsections passes, and an empty decision stops.
- [criterion:CP-record-decision] A proof record whose D1 and D2 each hold a Category composition admits a manifest that cites D2. A title that the D2 span lacks comes from the whole record. A record with a missing section still stops.

## Claim boundary

The checker validates declared references, composition structure, current input binding, and actual TLC outcomes.
It does not infer domain meaning, prove arbitrary implementation correspondence, or establish private reasoning.
The governing ADR connects those distinct proof duties without treating one as another.
