# Mode router and worker card requirements

[ADR 0036](../adr/0036-the-mode-skill-routes-and-each-delegate-reads-a-worker-card.md) governs the mode router shape, the worker card and the delegate read set.
The [design](../design.md) describes how `astack:mode` routes requests and sizes each read set.

## Acceptance criteria

- [criterion:MR-delegate-set] `scripts/skill-load-report.ts` lists `mode/SKILL.md` and `mode/references/worker.md` as the delegate read set at or under 2,000 source words, with `mode/SKILL.md` at most 1,700 words.
- [criterion:MR-worker-rule] `mode/references/worker.md` stays at or under 300 words. Rule 1 names owner gates (including money and legal sign-off), the merge grant, ChangeProof with `astack check proof` and STE replies. `agents/delegate.md` reads only `SKILL.md` and `worker.md` from mode.
- [criterion:MR-principle-index] `mode/SKILL.md` names each of the 24 principle references once, and `principles/SKILL.md` lists none.
- [criterion:MR-routes] Each row of `mode/references/routes.md` holds at least one owner word that no card row holds. Its Fallbacks table names no mode playbook.
- [criterion:MR-state] `mode/playbooks/session-pickup.md` points to "Read the state" of `resume.md`, and no file under `mode/` calls a transcript or prior trail authoritative.
- [criterion:MR-no-stale-name] No tracked Markdown or JSON file outside `docs/adr/`, `docs/plans/`, `upstream/`, `dist/` and `CHANGELOG.md` names a retired mode reference or removed heading.
- [criterion:MR-no-lost-rule] Each rule removed from a retired route row or folded reference keeps a verified home phrase or a cut reason.
- [criterion:MR-brief-set] `docs/runbooks/skill-load-measurement.md` defines Briefs A to D, 6 rubric items, 3 runs per side and blind redaction. It also states the minus 4 of 72 pass rule and the one-retry stop.

## Claim boundary

Static controls verify source word counts, pointers, route non-overlap, rule homes and absence of stale names.
They do not measure host token counts, cache behavior or runtime compliance on a live model.
Runtime comparison between two read sets uses the blind brief-set rubric in `docs/runbooks/skill-load-measurement.md`.
