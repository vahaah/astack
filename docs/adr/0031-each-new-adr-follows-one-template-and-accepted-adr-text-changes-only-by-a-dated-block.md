# 0031. Each new ADR follows one template, and accepted ADR text changes only by a dated block

Status: Accepted
Date: 2026-11-23
Ticket: none
Supersedes: none
Amends: 0005 D5

## Context

[ADR 0005](0005-every-change-carries-domain-and-formal-proof.md) D5 keeps ADR history explicit, but no check read it.
PR #14 and PR #17 added plain lines to the Accepted decisions D2 and D4 of ADR 0005, and no dated block marked them.
A replay of the amend-only rule over the 23 edits of an ADR past Proposed on main flags 5 edits. With no exemption for proof spans, it flags 11.

ADR 0008 did not name ADR 0005, and ADR 0010 had no `Amended by:` line for 0011 and 0028.
Two ADR templates existed, one in write-docs and one in domain-modeling, and neither had a domain or effects part.
Apply failed on each decision citation that the comment hook did not keep, also when the citation was only advice.

## Decisions

### D1. One ADR template gives each new ADR a Domain and effects part

The template lives in `ADR-FORMAT.md` of the domain-modeling skill.
Its `domain` fence uses the grammar of the plan block of [ADR 0018](0018-one-domain-and-effects-record-is-checked-against-code.md), and its law lines confirm the decision.

### D2. An ADR past Proposed at the base changes only by a dated block, a status move or its Amended by: line

A dated block starts with `> Note YYYY-MM-DD:` or `> Amended YYYY-MM-DD:`, and its date is on or after the `Date:` of the ADR.
The status can move to `Superseded by NNNN` or `Deprecated` in the header.
The one `Amended by:` line stays in the header too.
A raw line diff exempts the base proof spans, the base Domain and effects part and each Invariant audit part, because they name code.
A new Invariant audit part passes, because the model audit test asks for it in the first record of each model.
Each exempt part ends at the next decision heading, so it cannot hide a new decision.

### D3. Each relation names an ADR that names it back

`Supersedes:` and the status `Superseded by` name each other.
The target of an `Amends:` line of a live ADR names it in `Amended by:`, and each such entry cites its target.
Each `D<n>` of a relation resolves with `decisionHeading`.

### D4. Each ADR file has one index row, and each row has one file

The row gives the linked number, the title of the H1 and the status of the file.
`tests/adr-numbers.test.ts` calls this rule, so the rule has one source.

### D5. The template rule runs on a new ADR and on an edited Domain and effects part

A new ADR needs the header lines, the five H2 parts in order and a `### D1.` heading.
Its Domain and effects part needs a `Terms.` line that the glossary resolves, and one `domain` fence or `None.` with a reason.

### D6. adr.ts holds the one Status reader

`adrStatus` reads the Status line for change proof and for `astack check adr`.
ProofAdmission covers `src/astack/adr.ts`.

### D7. check adr reads the base through git and shares the base rule of check:proof

With `--base`, the check reads the ADR folder at the merge base of the ref and HEAD.
With no `--base`, it runs only the index and relation rules and names the two rules that it skipped.
`scripts/check-adr.ts` and `scripts/check-proof.ts` take their base from `scripts/lib/check-base.ts`.

### D8. Apply reports an unkept decision citation and does not fail

A citation alone keeps no comment, so apply prints a note for each citation that the comment hook does not keep.

### D9. The template lives in domain-modeling

The write-docs reference `adr.md` goes, and write-docs points to `ADR-FORMAT.md`.
The cap of domain-modeling rises to its count, and the cap of write-docs falls by more, as [ADR 0013](0013-astack-keeps-a-part-only-on-measured-use.md) D2 says.

### D10. A new ADR can still hold the four proof subsections

A model record under `formal/` is the other home of a proof subsection.

### D11. An ADR block passes the card, cap and law rules

`recordFindings` of `src/astack/domain/rules.ts` gives those rules, and a prop law needs a control marker under `tests/`.
The Files link rule and the rung rule stay plan rules, because an ADR has no Files cell.

## Domain and effects

Terms. Dated block, ADR template

```domain
context Proof
agg  AdrFolder @ src/astack/adr.ts: AdrFolder
inv  AO1 AdrFolder: an ADR past Proposed changes only by a dated block or a status line
inv  RL1 AdrFolder: each relation names an ADR that names it back
inv  IX1 AdrFolder: each ADR file has one index row, and each row has one file
cap  GitRead [fs-read, spawn] @ src/astack/git.ts: runGit(read), readBlobs(read)
step adrStatus : string -> Eff<never, StatusProblem, AdrStatus>
step amendProblems : (AdrFolder, AdrFolder) -> AdrProblem[]
step treeProblems : AdrFolder -> AdrProblem[]
step templateProblems : (AdrFolder, AdrFolder, TemplateFacts) -> AdrProblem[]
step readBaseFolder : (string, string, string) -> Eff<GitRead, BaseProblem, AdrFolder>
law  L1 AO1 each edit outside a dated block or a base span fails   check: prop adr-amend-only
law  L2 RL1 a relation with no back link gives one problem at its line   check: prop adr-relations
law  L3 IX1 a file with no row and a row with no file each fail   check: prop adr-index
rung R4
```

## Consequences

- Easier: a reviewer no longer reads each ADR diff for an in-place edit, because `bun run check` runs `check:adr`.
- Easier: each new ADR names its context, its steps and its laws in the grammar that the plan tools read.
- Harder: a correct edit of accepted text now needs a dated block. The check reads form only, so a dated block can still change a decision, and review keeps that duty.

## Alternatives considered

- A frozen file. Rejected because it flags 11 of 23 past edits, and the proof spans must change with the code.
- A diff of `adrProse` text. Rejected because it misses each edit inside a fence.
- A clause resolver. Rejected because ADR 0005 D5 rejects it.
- A hook that denies the edit at write time. Rejected because a check in `bun run check` also covers a commit from another tool.
- Keep the apply stop on an unkept citation. Rejected because it also fires on advice, and each repo then keeps each citation comment.
