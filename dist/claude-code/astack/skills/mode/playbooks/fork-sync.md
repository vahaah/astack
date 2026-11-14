# Fork sync

You own what the fork takes from its upstream repo.
The owner decides what the fork leaves out.
Show each exclusion before you integrate.

Use this playbook when the owner asks to sync a fork with its upstream repo.
"update from main" is a different route, `references/refresh.md`.

1. Record the state. Run `git status --porcelain` and `git stash list`, each as its own Bash call.
2. Fetch the upstream remote. Fetch the release and nightly tags too when the owner asks for them.
3. Find the last upstream commit that an earlier sync took. Read the earlier sync merges and their PR bodies.
4. Read the fork policy of the repo, such as an ADR or a sync doc, and its sync script. When the repo has no fork policy, write the policy ADR in the first sync.
5. Write a ledger. Give each new upstream commit one disposition, `take`, `adapt`, `skip` or `defer`, and a reason of one line. Follow the fork policy.
6. Before you integrate, show the owner each skip group and each defer group. Ask them in one round, with a recommendation and lettered options for each group.
7. Integrate on one branch, so one plan is one PR. Split the work into stacked PRs or a security PR first only when the owner says so.
8. Run all the repo gates. Fix each failure at its root cause.
9. Put two lists in the PR body. The first list holds the commits that the fork takes or adapts. The second list holds the commits that it skips or defers. Give each commit its reason.
10. Continue with `references/create-pr.md` and the Shipping playbook. Do not add a verifier of your own, because Shipping has an independent verifier for each PR.

## Reply

Give the upstream range, the count of each disposition, and the PR link.
Name each skip group and each defer group with the decision of the owner.
