# Autopilot-full

You own the verdicts.
Each PR has one owner from build to merge.
Your independent swarm must prove the code that will land before its owner merges it.
You never own the PR branches.

A verdict covers one patch.
Green CI covers one head.
Step 4 runs one full swarm.
Run another full swarm only for a major change.
The patch-id rule in `playbooks/shipping.md` can carry a lane result.
Every new head needs its own green CI.

1. Put the operator's gates first.

   The grant covers only the items in the queue.
   Stop at merge-ready for items that the operator reserves.
   Stop there for PRs outside the queue too.
   A request to state the plan gives no execution grant.

2. Spawn one owner per PR.

   Keep its work where a replacement can find it.
   Use GitHub CLI (`gh`) for every PR operation.
   Never require Graphite (`gt`).
   Each owner is a background `astack-delegate` at depth 1 with `isolation: "worktree"`.
   Its helpers can use depths 2 and 3.
   The owner builds the change.
   It opens its PR through `playbooks/opening-a-pr.md`.
   It proves the change on the real artifact.
   It follows `playbooks/babysit.md` until the PR is green.
   It merges only after steps 4 and 5 clear it.

   Open the PR early so CI and bots can run during the work.
   Finish the code before the full swarm runs.
   Run `/astack-deslop`, or remove slop yourself when astack is absent.
   Run `/astack-no-comments` too.
   Rebase onto current trunk.
   Report the code-ready head before the owner's own proof.
   This puts verification on the base where the patch will land.
   Report every later head.
   Report merge-ready after the owner's proof, CI, and babysit finish.
   Keep fix rounds on that base unless trunk conflicts or breaks CI.
   Each rebase restarts CI.
   Run the repository checks for the touched paths on the committed head before the code-ready push.
   Run them before each later push that needs a verifier too.

   With astack installed, the owner follows `astack-coding-guide` as the session that owns its ticket.
   It loads that guide and runs steps 3 to 8 for its own PR.
   A repository with `.claude/pr-review-hardening.profile.md` also needs the guide's step 7.
   After the code-ready report, the owner runs `/astack-pr-review-hardening --pr <number>` on its own branch.
   It reports each head that the fix commits create.
   Where the guide requires the user, the owner reports to you.
   You take that report to the operator.

   Assume the owner can die.
   Push soon after starting.
   Read `astack-show-me-your-work` by path.
   Start its decision trail in the pstack store.
   Read `references/paths-and-wakeups.md` for that store.
   Push after each unit worth keeping.
   Whoever spawns an agent records its id and state in the store.
   Record a stuck-after runtime from past runs of that kind too.
   This lets the root probe a child after its parent dies.
   Force-push only your own branch with `--force-with-lease`.
   Pin that lease to the SHA you last pushed or took over.
   Stop on any push that you did not make.
   Report it to the root.

3. Run owners in parallel from trunk.

   Keep their PRs independent, with no stack.
   Each PR lands on its own.

4. Run one full verification swarm at the code-ready head.

   Read `astack-swarm` by path.
   Fan out independent verifiers at the code-ready SHA as that skill requires.
   No verifier can have written the code.
   Run another full swarm only for new behavior, a redesign, or a large new diff.
   A rebase, conflict resolution, or minor fix gets one verifier at the new head.
   Each verifier reruns the gates and audits the diff.
   It proves the critical behavior live on the real surface.
   Use `/astack-control-ui`, `/astack-control-cli`, or a named driver for that proof.
   No verdict is clean without the live lane.
   Audit the receipts in the merge-ready report before you accept its verdict.
   Each lane must examine the evidence behind a claim.

   Send every proven finding to the owner in one consolidated fix request.
   The lane's label never excludes a proven finding.
   Include a red test across every site with the same defect.
   Record a defect against trunk when it also occurs there without the PR.
   That defect does not gate this PR.
   A defect that the PR copies or newly reaches belongs to the PR.
   Never push the fix yourself.
   Each branch has one writer.
   Replace a stuck owner instead.

5. Let the owner merge only the verified patch on tested trunk code.

   Green CI alone gives no merge authority.
   Begin merge preparation after the swarm lanes start.
   Rebase onto current trunk.
   Report the new head.
   Wait for green CI on that head.
   If the owner ran hardening, merge only after a `stop_clean` still valid under `astack-coding-guide` step 7.
   An unclean stop instead needs the operator's go.

   Fetch trunk immediately before the merge.
   Determine whether its changes can affect the patch.
   A rebase for every trunk movement would never finish.
   Rebase and wait for CI when the code that would land was never tested.
   This includes conflicts, files changed on both sides, and changes to the checks that run for the PR.
   A lockfile changed on both sides has one exception.
   It needs no rebase when a frozen install passes on the merge result.
   The packages changed by the PR must also resolve there as they do on its head.
   That install tests the lockfile that would land.
   A failed install requires a rebase that repairs the lockfile.
   Trunk can also change a caller or a dependency of the patch.
   This includes called code and dependency versions.
   Run the patch checks on the merge result in that case.
   Merge only after they pass.
   Merge when none of these cases requires more work.
   Hold if trunk would require a third rebase after merge preparation.
   Report the collision to the root so it can order the work.

6. Run the root layer.

   A change that loosens a gate needs a verifier's proof and your fresh countersign.
   Examples include a raised budget or an allowlist entry.
   The owner wants green, so it cannot supply that countersign itself.
   A grant that covers approvals makes your countersign the approval.
   The owner's record must point to that countersign for a lane to examine.
   Remove any setting that disables or soft-fails a check.
   It prevents that check from guarding every case.
   Never supply or bypass an approval that the forge requires.
   No countersign replaces it.

   On the operator's go, arm `/loop 1h` until no delegated work remains.
   Each tick rereads this playbook.
   Have the owner record any missing head or agent.
   Such drift is a gap in the record, which does not by itself prove a stall.
   Probe every agent, including leaf lanes.
   Use `ListAgents`, its transcript, its `.meta.json`, and its pushed branches.
   Judge progress by side effects.
   Status text and summaries can hide a stuck child.
   An agent is stuck when it errors, cannot start turns, or passes its stuck-after runtime with no new work.
   An owner is also stuck if it has neither pushed nor written a trail row by the first tick.
   An agent waiting for you or the operator needs an answer.
   It is not stuck.
   Replace a stuck agent at once.
   Do not wait for its stop to complete.
   Tell the operator what changed when a tick changes something for them.
   Stay quiet when the tick changes nothing.

7. Stop at once when the operator says to stop.

   Send every owner a hold that permits no writes.
   Each owner reports its state and keeps its brief.
   It waits until the operator releases the hold.

## Reply

Report each PR's state and verdict.
State what merged, each countersign and its reason, and each open operator gate.
Link each PR and decision trail.
