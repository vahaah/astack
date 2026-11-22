# 0012. Change proof accepts an older base

Status: Accepted
Date: 2026-11-22
Ticket: none
Amends: 0005 D3 and D4

## Context

`astack check proof` stopped as stale unless `--base` resolved to the manifest base.
CI passed `--base origin/<base>` on each pull request run, so each merge to main made the proof of each open PR stale.
Two projects logged 59 and 57 stale proof stops in one week.

The refresh playbook and the modernize skill then told the agent to set a new manifest base by hand.
The scope check and both input snapshots read from the manifest base, so a merge of main put the paths of main in scope.
Push and release runs passed no base. An older manifest base then put the paths of other merged PRs in scope.
`changedPaths` and `astack check ci-pins` read Git with plain `runGit`, which follows replace objects.

## Decisions

### D1. A manifest base that is an ancestor of the merge base admits

The manifest `base` stays a fixed commit, and ratification history stays bound to it.
With `--base <ref>`, the diff base is the merge base of the ref and HEAD.
The manifest base must be an ancestor of that merge base.
A manifest base that is not an ancestor stops, and the stop names both commits.
Without `--base`, the diff base is the manifest base, which must be an ancestor of HEAD.

The scope check and both input snapshots read from the diff base, so a file that only main changed stays out of scope.
The receipt prints the manifest base and the diff base.
`astack check ci-pins` applies the same rule to the CI proof records.

#### Formal claim

`formal/ProofAdmission.tla` adds a `base` stage before the `domain` stage, and `formal/ProofAdmission.cfg` holds its invariants.
Each run has one base observation from a finite set of cases.
The observation holds the relation of the manifest base to the diff target, and the presence of a ref.
It also holds the diff base, the history view and an authority move.

`BaseAncestry` states that an admitted proof has a manifest base that is equal to or an ancestor of the diff target.
`ScopeFromMergeBase` states that an admitted proof with a ref reads its diff from the merge base.
`HistoryAtManifest` states that ratification history of an admitted proof stays at the manifest base.
`MovedAuthorityStops` states that an admitted ratified proof has no authority move on the base branch.
The model takes the Git observations as true. It does not model Git.

#### Category composition

`proofBase` maps a `DiffTarget` to a `ProofBase` or a refusal.
`readIntegrationHistory` maps a `ProofBase` to an `IntegrationHistory` or a refusal.
Both arrows read Git through `historyGit`, and neither writes a file.
`prove` in `src/astack/cli/commands/check/proof.ts` calls them in that order, and that file is the typed witness.
This change adds no composition operator, map, functor or monad.

#### Implementation correspondence

| Model concept | Concrete contract |
|---|---|
| `relation` | `proofBase` runs `merge-base --is-ancestor` on the manifest base and the merge base, or HEAD |
| `diffFrom` | `prove` passes `ProofBase.diff` to `changedPaths` and `snapshot` |
| `historyAt` | `readIntegrationHistory` binds the ratified views to `ProofBase.manifest` |
| `moved` | `authorityMoved` in `adrCheck` compares the merge base view with the manifest base view |
| `ref` | `scripts/check-proof.ts` passes a base on each CI run |

These links describe the abstraction relation.
They do not establish refinement of all TypeScript behavior.

#### Verification

`.astack/proof-coverage.json` links CP-13, CP-14 and CP-15 of `docs/reference/change-proof-contract.md` to executable controls.
The CLI controls use real temporary Git repositories with a moved main, a base that is not an ancestor and a replace object.
A script control runs a push, a release and a branch push through `scripts/check-proof.ts`.
The named mutation removes the base relation guard from `ValidationPass`, and it must violate `BaseAncestry`.
The restored model must give the same positive counts.

### D2. Base reads ignore replace objects and grafts

Each base resolution and each diff read of `astack check proof` and `astack check ci-pins` uses `historyGit`.
So a replace object or a graft cannot fake ancestry or hide a changed path.
Each proof run now needs the `--no-lazy-fetch` option of Git.

### D3. Each CI run passes a base

`scripts/check-proof.ts` passes `origin/<base>` on a pull request run.
A push to the default branch and a release pass the first parent of HEAD.
A branch push whose HEAD the default branch holds also passes the first parent of HEAD. An example is a new branch at the tip of the default branch.
A push to another branch passes the default branch from the event payload.

A branch push with no default branch in the payload fails.
The rule expects a squash or a merge commit on main. A rebase merge diffs only its last commit.

### D4. A move of main that changes ratified authority stops with a repair

The checker also reads each ratified record at the merge base.
The authority at the merge base can differ from the manifest base. Then the proof stops.
The stop names the record, both commits and the repair.
The repair sets `base` to the merge base and `integratedAt` to a commit that holds the new text.
A change of only the selected Landed value does not stop.

## Consequences

An open PR keeps its proof when main moves, and a merge of main needs no new manifest base.
A proof that cites a ratified ADR still stops when main changes the authority of that ADR, and the stop gives the repair.
A local run with `--base HEAD` has an empty diff, so it stops. CI passes the real base.
Each proof run needs a Git that has the `--no-lazy-fetch` option.

## Alternatives considered

- Keep exact base equality and add `astack proof rebase`. Rejected because CI compares with the base tip, so each move of main still stops each PR.
- Drop `base` from the manifest. Rejected because ratification needs a fixed anchor, and a local run has no ref.
- Decide ancestry in the pure core. Rejected because the facts need Git, and `ci-pins` must then build them again.
- Pass no base on push runs. Rejected because an older manifest base puts the paths of other merged PRs in scope.
- Name only the digest in the ratification stop. Rejected because the agent cannot see that main caused the stop.
