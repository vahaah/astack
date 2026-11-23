# ADR lifecycle requirements

[ADR 0031](../adr/0031-each-new-adr-follows-one-template-and-accepted-adr-text-changes-only-by-a-dated-block.md) governs the ADR template and `astack check adr`.
[ADR 0005](../adr/0005-every-change-carries-domain-and-formal-proof.md) D5 keeps ADR history explicit.
The [admission model](../../formal/ProofAdmission.tla) covers the status reader of `src/astack/adr.ts`.

## Acceptance criteria

- [criterion:AL-amend-only] Given an Accepted ADR at the base, a change that adds a plain line to D4 exits 1 at that line. A fenced line edit and an added proof heading exit 1. A dated block, a move to Superseded by and a base span edit exit 0.
- [criterion:AL-status] Change proof and `astack check adr` read `Status: Accepted · owner` as Accepted. Both stop on two Status lines.
- [criterion:AL-covers] A diff of `src/astack/adr.ts` alone runs ProofAdmission at R4.
- [criterion:AL-relations] An ADR with `Amends: 0010 D4` and an ADR 0010 with no `Amended by:` line fail, and the problem names both files. A Supersedes line with no matching status fails too.
- [criterion:AL-index] An index row with another title or status than its file fails at the row. Two files with one number fail too.
- [criterion:AL-template] With `--base`, a new ADR with no `## Domain and effects` part fails, and the problem names the part. An unknown card context and a prop law with no control fail at their line.
- [criterion:AL-base] A `--base` that git cannot read exits 1 and names the ref.
- [criterion:AL-citations] A repo comment cites `ADR-0006`, and no keep pattern keeps it. The apply dry run prints the citation as a note and exits 0.

## Claim boundary

The check reads the form of a change only. A dated block can still change the meaning of a decision, so review keeps that duty.
A head proof span drops only when the base holds a span with the same heading under the same decision. So a new proof heading in an accepted ADR fails.
The relation rule reads only the `Supersedes:`, `Amends:` and `Amended by:` lines and the status. It reads no clause inside a decision.
With no contexts card, the template rule examines only the control marker of each prop law.
