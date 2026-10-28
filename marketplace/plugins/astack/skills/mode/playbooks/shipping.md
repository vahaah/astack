# Shipping

You own what lands.
Verify each PR independently.
Land only the contiguous verified run from the root.
Leave the remaining stack unchanged during that landing.

## PR head checks

Use the checkout of the PR before acting on it.
The state and the diff of a PR hold for its `headRefOid` only. Compare `git rev-parse HEAD` with `headRefOid` before you act on the PR.

There is no PR only when gh exits 1 and its standard error matches `grep -qi 'no pull requests found for branch'`. Each other failure of `gh pr view` is an error, not a missing PR. Print the error of gh, and stop.

## Steps

1. Verify each PR independently before it lands.

   Use GitHub CLI (`gh`) for every PR operation.
   Never require Graphite (`gt`).
   Assign one background verifier per PR with `isolation: "worktree"`.
   It must use a different model from the author.
   It must not have written the code.
   An author tends to examine the behavior it intended to build.
   The verifier compares parent against head through the user journey.
   Use `/astack:control-ui` or `/astack:control-cli` when astack is installed.
   Otherwise use the repository driver.
   The verifier posts `PASS`, `PASS+NOTES`, or `FAIL` on that PR.
   Only an independent verifier's verdict counts.
   Green CI and an approving bot review supply no such verdict.
   Neither proves the user journey.

2. Land only the contiguous verified run from the bottom.

   Start at the lowest unmerged PR.
   Stop at the first PR without `PASS` or `PASS+NOTES`.
   The PRs below that gap form the run.
   Its highest PR is the ceiling.
   A verified PR above the gap waits for the code below it.
   A branch that neither contains nor needs that code can move to trunk and land independently.
   After moving that branch onto trunk, get a fresh verdict against trunk before its merge.
   Its old verdict included code that trunk does not contain.

3. Make sure each verdict still covers the code.

   A verdict covers a patch.
   A chain rebase changes each upper PR's SHA without necessarily failing a check.
   Compare `git patch-id` at the verdict SHA with the current head before carrying an older verdict.
   A matching patch-id carries the verdict for that patch.
   A lane result can also survive changes limited to tests, documentation, or lint configuration.
   The code that the lane ran must build identically at both SHAs, apart from proven noise.
   Noise must also occur between two builds of the verdict SHA, or be an embedded commit SHA.
   Report each noise kind with its files so a reader can examine the proof.
   Give the changed tests, documentation, or lint configuration fresh checks and review.
   The old verdict did not examine them.
   A lane with no build output cannot prove that alternative equivalence.
   Rerun it when carrying its verdict requires that proof.
   A development server is one such lane.
   Verify any other changed behavior again.

4. Land one PR at a time from bottom to top.

   Merge the run's lowest unmerged PR with `gh pr merge <pr> --squash`.
   A PR based on its parent's branch merges into that branch.
   It does not merge into trunk.
   Read back the result with `gh pr view <pr> --json state,mergedAt,baseRefName`.
   A successful merge command can mean that a merge queue accepted the PR.
   Requested auto-merge also leaves the PR unmerged until it lands.
   Confirm that the PR is merged and its base is trunk.
   A merged state with the parent branch as its base is insufficient.
   Arm `--auto` only when the verdict covers the current PR head.
   Auto-merge lands whichever head is ready.
   After the merge lands, retarget its direct child's PR with `gh pr edit <pr> --base <trunk>`.
   Move that child's patch onto the merge result.
   Push with `--force-with-lease`.
   Pin the lease to the SHA you last pushed or took over.
   Use step 3's patch-id rule to determine whether the verdict survives.
   Merge the child only after its checks pass and its verdict still counts.

5. Leave the stack unchanged during landing.

   Step 4's move of the next PR is the only permitted branch or base change.
   A merge uses the branch and base that exist at that moment.
   A recorded verdict does not freeze them.
   Watch with `astack watch-pr --queued-stack --stack-prs <bottom-to-top>` from `playbooks/babysit.md`.
   Run it under `/loop` until it reports `COMPLETE` at the ceiling.
   A base can move to trunk when its parent merges.
   Treat that move as expected.
   Diagnose a stalled merge before you change anything.

6. Stop at the ceiling.

   An extended run needs new verdicts.
   Start a new pass at step 1.

## Reply

Report the verified run and its ceiling.
Name each PR's verdict and verifier.
State what landed and how you confirmed it.
State what the next gap needs.
