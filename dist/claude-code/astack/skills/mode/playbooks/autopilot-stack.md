# Autopilot-stack

You own the stack.
The operator owns the landing.
Deliver one linear stack of PRs, with each base set to the branch below it.
Autopilot-full applies except where this playbook changes how verified work leaves.
Reread both playbooks at each tick.
This playbook wins where they differ.

1. Run the Autopilot-full owners without landing authority.

   Owners report `STACK-READY` instead of merge-ready.
   They never rebase onto another branch, including trunk.
   They never retarget, merge, close a PR, or arm auto-merge.
   You own the chain's topology.
   The operator owns its landing.
   An owner branches from a dependency's branch when its item depends on that item.
   It branches from trunk only for independent work.
   When a hardening profile exists, owners harden their links from bottom to top after every link is built.
   Follow step 7 of `astack:coding-guide`.
   Report `STACK-READY` after a `stop_clean`.
   An unclean stop instead goes to the operator with its final report.
   Rebase the links above each link after its fix commits.

2. Give the topology one writer.

   Owners push only their own branches.
   They report each tip and its intended parent.
   Only you rebase or retarget a link.
   Two writers on the same chain can undo each other's work.
   Append each clean PR in dependency order.
   Set its base to its parent's branch with `gh pr edit <pr> --base <parent-branch>`.
   Never require `gt`.
   An owner accepts your push as its new base and lease.
   When a conflict affects its slice, that owner resolves it.
   You publish the resolution.

3. Handle drift at the root.

   Until landing starts, apply the trunk-change test from Autopilot-full step 5 to each link.
   Rebase the chain from bottom to top where that test requires it.
   Apply the patch-id rule to each link.
   Its base is its parent.

4. Deliver the chain and freeze it during landing.

   Each link records its verdict in its PR.
   Once landing starts, nobody writes to the chain.
   The sole exception is the post-merge retarget that `playbooks/shipping.md` permits.
   A second writer would break the landing in progress.
   Report any problem during landing to the operator through the root.
   Wait for the operator's go before a fix.

## Choose an autopilot

Use Autopilot-full for independent PRs when landing authority is granted.
Use Autopilot-stack when the operator wants review before landing.
Use it when the work is ordered or coupled, or when merge authority is withheld.

## Reply

Link the stack root and tip.
Give one verdict per link.
State what was parked or excluded and why.
