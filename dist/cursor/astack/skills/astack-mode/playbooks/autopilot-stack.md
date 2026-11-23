# Autopilot-stack

You own the stack.
The operator owns the landing.
Deliver one linear stack of PRs, with each base set to the branch that it builds on.
Run `playbooks/autopilot-full.md` with no merge authority.
This playbook wins where they differ.

1. Run Autopilot-full owners without landing authority.
   An owner stacks its PR only on the PR that it builds on, and uses trunk for independent work.
   With a hardening profile, owners harden from bottom to top and report `STACK-READY` after a `stop_clean`.
   An unclean stop goes to the operator with its final report.

2. Keep one topology writer.
   Owners push only their own branches and report each tip and intended parent.
   Owners never merge, close or retarget a PR.
   Only the root rebases or retargets a link.
   Append each clean PR with `gh pr edit <pr> --base <parent-branch>`, never `gt`.

3. Handle drift and freeze the chain at landing.
   Rebase from bottom to top when trunk changes require it.
   A restack that keeps its `git patch-id` keeps its verdict.
   Freeze the chain once landing starts, except for post-merge retargets under `playbooks/shipping.md`.

## Reply

Link the root and tip, give one verdict per link, and list what stays parked and why.
