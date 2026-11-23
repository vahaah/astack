# 0035. Each PR has one review record, a fix after a clean head gets a delta review, and the rung sizes the reviewer set

Status: Accepted
Date: 2026-11-23
Ticket: none
Supersedes: none
Amends: 0005 D4 and 0016 D7

## Context

Each hardening iteration reviewed `<BASE_SHA>...<HEAD>`, and an iteration with a fix was not clean.
So a fix after a clean stop needed a second full review, and the coding guide asked for a full run after each later fix.
The agent wrote `<branch>.review.json` by hand with `baseSha` and `firstReviewedHead` only, and no file counted the reviewer launches.
The `applicable` set always started `code-reviewer`, also for a diff of Markdown files only.
`astack check ci-pins` stopped each PR that changed a CI file and another file, so such a PR had no run at all.
A recurring finding always ended in `stop_recurring`, also when a later run can fix it.

## Decisions

### D1. The review record keeps the first-review fields and adds each reviewed head

`<branch>.review.json` in the git common dir keeps `baseSha` and `firstReviewedHead`, and it adds `heads`.
Each head holds its sha, its stop decision and its reviewer launches.
`astack review record` writes the record, and `astack review base` reads it.
A new head joins the end of `heads`, and no command changes the first-review fields.

### D2. A run is a delta run when HEAD holds the last clean head of the record

`astack review base` names the last `stop_clean` head of the record that HEAD holds, with exit 0 and a `delta:` line.
The reviewers of that run get `git diff <head> <HEAD>`. The run keeps the ledger, the comment gate and each gate.
An empty delta launches no reviewer.
Each other case gives exit 3 and a `full:` line. The command reads ancestry with `--no-replace-objects`.

### D3. An unreadable record gives a full run, and no command writes over it

An unreadable record exits 1, and the run makes a full run whose report names the error.
No command writes a new record over an unreadable one.
A save writes a temporary file and renames it, so a failed save keeps the old record.

### D4. ci-pins gives the mode ci_mixed to a PR that changes CI and another file

ci-pins exits 3 with a `ci_mixed:` last line when its only stops are CI files and another file changes.
No tool version can change, and no move of the base can change CI.
A proof record that fails gives `ci_mixed` too.
This decision amends ADR 0005 D4 and ADR 0016 D7.

### D5. In mode ci_mixed each gate blocks, and a clean stop needs the CI read-back

No gate of mode `ci_mixed` is advisory.
A clean stop and a merge need the CI read-back, so a run of that mode with no PR cannot stop clean.
As in mode `ci_proof`, a PR that removes a CI step that runs a gate command stops the run.

### D6. CiProofRecords models the mode ci_mixed

`ClassifyMixed` gives `ci_mixed` to other files or a failed record with the same tools and no moved base.
`MixedKeepsGates` needs green gates and a passing read-back for a delivery of that mode.
The text globs of the model add the hardening `SKILL.md` and `gate.md`.

### D7. The rung of the change-proof gate sizes the applicable reviewer set

The run reads the `rung:` line of the last change-proof gate output. With no such line, a diff of Markdown files only is R0.
With `select: applicable`, R0 launches `comment-analyzer` when the profile lists it, else the first listed agent.
R1 and up launch the applicable set. An extra reviewer with `when: rung R<n>` applies from that rung up.
A clean stop needs at least one reviewer launch, unless the review range is empty.

### D8. The opt-in key converge reviews only the commits after a fix

`converge` is false by default.
With `true`, an iteration after a fix commit reviews `<prior REVIEWED_HEAD>..<HEAD>` with the ids of the open, fixed and deferred entries.
A High or Important reviewer finding that recurs after one fix attempt becomes `deferred`.

### D9. stop_converged never merges, and a deferred entry stays open until a reviewed commit fixes it

`stop_converged` needs a clean iteration apart from open deferred entries, and no merge follows it.
A deferred entry carries into each later run, and `stop_clean` needs 0 open deferred entries.
Each reviewer gets the deferred entries, and each iteration reproduces them again. An entry becomes `fixed` when its failure does not occur at the reviewed head.
A recurring Critical or Blocker finding still ends in `stop_recurring`.
A gate or comment finding has no severity, so it never becomes `deferred`.

## Domain and effects

Terms. Review record, Delta review, Mixed CI mode

```domain
context Delivery
agg  ReviewRecord @ src/astack/review-record.ts: ReviewRecord
inv  RR1 ReviewRecord: baseSha and firstReviewedHead never change, and each new head joins the end of heads
inv  RR2 ReviewRecord: a delta run starts only from the last stop_clean head that HEAD holds
step loadRecord : string -> Eff<ReviewStore.loadRecord, RecordProblem, ReviewRecord>
step withHead : (ReviewRecord, ReviewedHead) -> ReviewRecord
step deltaBase : (ReviewRecord, string[]) -> DeltaBase
step saveRecord : (ReviewRecord, string) -> Eff<ReviewStore.saveRecord, StoreProblem, void>
law  L1 RR1 withHead keeps both first-review fields and puts the new head last   check: prop review-record-append
law  L2 RR2 deltaBase gives the last stop_clean head of the ancestor list, else full   check: prop review-delta-base
law  L3 ReviewStore a saveRecord and then a loadRecord of one path give an equal record   check: prop review-store-roundtrip
rung R4
```

## Consequences

- Easier: a fix after a clean head costs the reviewers of its delta only, and each gate still runs.
- Easier: a PR that changes CI and a product file gets a run, and each gate of that run blocks.
- Easier: a Markdown-only PR launches one reviewer, and the record counts the launches of each PR.
- Harder: an agent can write a false clean head into the record. The gates and the merge grant still apply.
- Harder: a delta after a merge of the base also reviews the base changes, which costs launches only.
- Risk: a pinned older CLI prints no rung line, so that repo keeps the applicable set for each diff that is not Markdown only.

## Alternatives considered

- A full run after each fix commit, as the coding guide said. Rejected because it repeats each reviewer for a small fix.
- Gates only after a fix, with no review. Rejected because the review roadmap rejects a fix that no reviewer sees.
- A sol-loop APPROVE head as a delta base. Rejected because sol-loop can skip paths.
- A stop on an unreadable record. Rejected because one bad file then blocks each later run.
- Only plan and docs paths in `ci_mixed`, or a split of the PR. Rejected because the rule card forbids a split without the owner.
- Advisory reds in `ci_mixed`, as in `ci_proof`. Rejected because a red can come from a product defect.
- A fixed rung list of reviewers, or no reviewer at R0. Rejected because the review roadmap asks for one light reviewer.
- `converge` on by default. Rejected because the owner did not opt in.
- A merge after `stop_converged`. Rejected because it passes a reproduced defect.
