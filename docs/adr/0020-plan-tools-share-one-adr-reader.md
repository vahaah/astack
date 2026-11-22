# 0020. The plan tools share one ADR reader, and a session boundary rides in the next session PR

Status: Accepted
Date: 2026-11-22
Ticket: none
Supersedes: none

## Context

check-plan and change proof read ADR decision headings with two readers.
check-plan refused a long dash heading, resolved a fenced heading and accepted a heading with no title.
Change proof gave the opposite verdict in each case, as ADR 0005 D2 says.

The plan skill ran `/astack:plan <slug>` after each session merge and named no branch for its edits.
Agents then opened a PR that held only plan edits after each session merge.
Each such PR cost one CI run and one review, and one organization hit its Actions cap.
Main names the merged session as `now` until the next plan edit merges, so a second clone can run the boundary again.

A row that moved to an ADR had two forms, and both failed.
A delete frees the number of a top row, because the base check reads only the base.
A full row with an ADR Record saves no bytes.

## Decisions

### D1. One reader finds an ADR decision heading

`decisionHeading` in `src/astack/adr.ts` masks fenced code and finds a `### D<n>.` or `### D<n> —` heading with a title.
check-plan and change proof both call it.
A fenced heading and a heading with no title do not resolve.

### D2. A session boundary opens no PR of its own

The boundary edits are the first commit of the next session branch.
The plan file goes into the proof scope of that session.
A milestone exit, a pause and a declined grant commit on the next session branch and push it with no PR.
With no next session, the last session PR carries the close and deletes the plan.

#### Formal claim

Each merged session gets at most one boundary, and the last session gets none.
Each later merge carries the boundary of the session before it.
A decision row leaves the live rows only when its ADR heading resolves.

```text
OneBoundaryPerMerge         == each session has at most one boundary
NoBoundaryAfterLast         == the last session has no boundary
EachMergeCarriesItsBoundary == a merge of session s needs the boundary of session s - 1
RowLeavesWithAuthority      == a graduated row has a heading that resolves
LastPrDeletesPlan           == after the last merge, the plan is gone
```

The [model](../../formal/PlanBoundary.tla) and its [configuration](../../formal/PlanBoundary.cfg) check these claims over three sessions, two rows and four heading forms.
The model takes the push of a branch and the result of `git fetch` as true observations.
The model has no action that makes a graduated row live, and the `--base` test examines that rule.

#### Category composition

```text
readAdr         : CheckEnv  -> AdrText       effects: fs-read
decisionHeading : AdrText   -> HeadingOffset effects: none
planFileState   : PlanTarget -> PlanFileState effects: fs-read, spawn
planStateFor    : PlanTarget -> PlanState    effects: fs-read, spawn
parseTrailBatch : StdinRows -> TrailCells    effects: none
appendTrail     : TrailCells -> TrailFile    effects: fs-write
```

`readAdr` finds the ADR file of a number in the ADR folder of the plan, and reads it.
`decisionHeading` is pure. It masks the fences and returns the offset of the titled heading, or nothing.

`planFileState` reads the real path of the plan file and asks git for the root and the common dir of its folder.
It returns the plan path from that root, and it refuses an invalid slug.
`planStateFor` uses `planFileState` for a plan path, and the git root of the cwd for a slug.
`parseTrailBatch` is pure. It returns all rows, or the first problem with its line.
`appendTrail` writes all rows in one append call.
A batch with a problem never reaches `appendTrail`.

The record uses the `artifact` carrier and declares no composite arrow, so no composition, functor or monad law applies.

#### Implementation correspondence

`decisionHeading` maps to the `Resolves` test in the `Graduate` action.
`checkAgainstBase` refuses a graduated row whose heading does not resolve, and a retired base row that is live again.
The Resume and Session boundary parts of `upkeep.md` map to the `Resume` and `Boundary` actions.
The Finish part of `sessions.md` maps to the `Merge` action.
The trail batch and the state folder have no model state, and the tests examine them.

#### Verification

[The proof matrix](../../.astack/proof-coverage.json) links the criteria of [the requirements](../reference/plan-boundary.md) to their tests.
The negative control removes the heading test from `Graduate`, and it must violate `RowLeavesWithAuthority`.
A second control lets `Boundary` run when the next session branch exists, and TLC reports `OneBoundaryPerMerge`.
The normal test gate runs the plan, session, ADR and boundary tests.

### D3. A resume continues the next session branch

Resume step 7 runs after `git fetch`.
When the `now` PR merged and a next session branch exists, the agent continues that branch and runs no second boundary.

### D4. A row that moves to an ADR graduates

The row shrinks to `| D3 | | Graduated to ADR NNNN Dm | | | | |`, and its heading must resolve.
The row leaves the live rows, and `check-plan --base` accepts it for an owner row.
A graduated handle that is live again fails, as a superseded handle does.

## Consequences

- Easier: a plan of many sessions needs no PR that holds only plan edits.
- Easier: an agent passes a plan path from any folder, and writes a batch of trail rows in one call.
- Harder: main names the merged session as `now` until the next session PR merges.
- Harder: two open session PRs of one programme can conflict on the index.

## Alternatives considered

- A separate plan PR after each merge. Rejected because it costs one CI run and one review for each session.
- A docs-only CI path. Rejected because each product repo owns its CI.
- Two ADR readers. Rejected because they gave opposite verdicts.
- A delete of a graduated row. Rejected because it frees the number of a top row.
