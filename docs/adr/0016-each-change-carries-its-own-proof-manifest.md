# 0016. Each change carries its own proof manifest, and an ordinary ADR reference needs only its decision

Status: Accepted
Date: 2026-11-22
Ticket: none
Supersedes: none
Amends: 0005 D4
Amended by: 0035 D4 for mixed CI

## Context

Each change rewrote `.astack/proof.json`, so two open PRs conflicted in that file after one of them merged.
A probe made two branches from one commit. Two rewrites of `.astack/proof.json` conflicted in a merge of main.
Two new manifests under `.astack/proof/` merged with 0 conflicts.

The gate also read the four proof sections of each ordinary governing ADR.
It took the first section of each title, so an ADR with its arrows under a second decision stopped.
In 30 days, `proofSections` gave 204 of 256 unique domain stops.

ADR 0012 D1 keeps the manifest base as the diff base of a run with no `--base`, because a local run has no ref.

## Decisions

### D1. Each change adds its own manifest at `.astack/proof/<change>.json`

The file name is the `change` field of the manifest.
Two open PRs add two files, so they never edit one proof file.
A merge of main brings in the manifest of each merged change.

### D2. With `--base`, the run reads the one manifest that the diff from the merge base adds

The run keeps each present `*.json` file directly under `.astack/proof/` that the diff from the merge base names.
It stops at schema on two or none, and it names the files or the merge base.
The merge base must not hold the chosen manifest, so a change never edits a merged manifest. Otherwise the run stops at schema and names the path and the merge base.

### D3. With no `--base`, the run reads the one manifest in the folder

The diff base stays the manifest base, as ADR 0012 D1 says.
Two or more manifests stop at schema, and the stop asks for `--base` or a manifest path.
A found manifest prints `manifest: <path>` first. A path argument skips the search.

### D4. A change deletes each manifest of its manifest base and `.astack/proof.json`

So the manifest of a change is a new file.
A present manifest that the manifest base holds stops the run at stale, and the stop names the path and the base.
`.astack/proof.json` beside a folder manifest stops too.
A manifest that a merge of main brings in stays until the next change deletes it.

### D5. An ordinary ADR reference needs only Accepted status and text in the span of its decision

The span starts after the decision heading.
It ends at the next decision heading or at a heading of level 1 or 2, so a subsection is part of it.
An ordinary governing ADR needs no proof section.
The manifest arrows still need a real symbol and a typed witness mention.

### D6. A proof record gives each title from the span of the governing decision first

When the span of the cited decision holds a section of a title, that section counts.
Else each section of that title in the record counts.
A ratified reference still needs all four sections in its record.

### D7. `check ci-pins` chooses the manifest as `check proof --base` does, at the committed HEAD

The chosen manifest, its proof records and each deleted manifest are proof metadata beside a CI change.
A second changed manifest stops the classification.
This decision amends ADR 0005 D4.

> Amended 2026-11-23: D7 said "A second changed manifest stops the classification." [ADR 0035](0035-each-pr-has-one-review-record-and-a-delta-review.md) D4 gives such a PR the mode `ci_mixed`, and each gate of that mode blocks.

### D8. A scope row that names a manifest path is never idle

The rule covers `.astack/proof.json` and each `*.json` file directly under `.astack/proof/`.
After main deletes a base manifest, the diff of each open PR loses that path, and its scope row stays valid.

### D9. The proof sections of ADRs 0005, 0009 and 0010 live in formal records

`formal/ProofAdmission.md` and `formal/SessionGuards.md` hold them, and each ADR has a dated note.
The registry `records` of each model name the new file.

### D10. `.astack/proof.json` stays the fallback for a tree with no folder manifest

A product gate that names `.astack/proof.json` keeps working until its repo moves.
astack deletes the file in the same change that adds this ADR.

## Consequences

- Easier: a merge of main into an open PR needs no proof edit.
- Easier: an ordinary ADR governs a change with its decision text only.
- Harder: each change must delete the manifest of its base, or the proof stops.
- Harder: on main after a PR that merged main first, a run with no `--base` finds two manifests and stops.
- Limit: git can pair a deleted base manifest with a new manifest of more than half the same lines as a rename. Two such renames conflict in a merge. The manifests of this repo stay under that limit, and `merge.renames=false` merges each case.

## Alternatives considered

- A git merge driver for `.astack/proof.json`. Rejected because no driver can merge two full rewrites.
- The newest manifest by date. Rejected because a checkout resets file dates.
- A manifest path in the profile. Rejected because each PR then edits the profile again.
- Keep each manifest. Rejected because the folder then grows by one file for each PR.
- Delete each other manifest. Rejected because a merge of main then needs a proof edit.
- A proof record for each ordinary reference. Rejected because it keeps one prose copy of the arrows for each change.
- A stop on a repeated section title. Rejected because it stops each record that gives two decisions their own sections.
