# Create PR

Use this playbook for "create pr". It follows the Opening a PR playbook in [`opening-a-pr.md`](../playbooks/opening-a-pr.md) with the rules of the owner. One plan is one PR. A follow-up goes into the open PR.

1. Look for an open PR for this work. Run `gh pr list --head <branch> --state open --json number,headRefName,headRefOid,headRepositoryOwner,headRepository,isCrossRepository,maintainerCanModify`, and search the open PRs for the ticket key. `--head` matches a branch of any owner. So a PR with `isCrossRepository` true is the PR of this work only when `git merge-base --is-ancestor <headRefOid> HEAD` exits 0. When one exists, update it and go to step 7.
   - There is no PR only when `gh pr list` exits 0 and prints no PR. Each other failure of `gh pr list` is an error, not a missing PR. Print the error of gh, and stop.
   - When `isCrossRepository` is true and `maintainerCanModify` is false, make no fix commit and push nothing. Tell the owner that the fork does not allow edits from maintainers, so no fix can reach the PR.
2. Run every repo gate: lint, typecheck, tests and the doc checks. Record the counts. Fix each red gate at its root cause first.
3. Run `/astack-deslop` on the branch diff against its base. It also runs `astack-no-comments`. Commit its edits. When they change code, run the gates again.
4. Write the PR body to a file. Use the repo PR template, else the template in `astack-write-docs`. Write it in STE.
   - When the profile sets `tracker.requirePartOf`, the first line is `Part of <key>`. One line can name more tickets, as in `Part of ABC-1, ABC-2`.
   - Never put a ticket key or `#n` after a closing word such as "Closes" or "Fixes".
   - List the in-scope defects and the hidden work that the PR fixes.
5. Run `astack check-pr <file>`. When `astack check ste` exists, run `astack check ste <file>` too. Fix each finding.
6. Write the title in the commit subject form of `astack-write-docs`. A plan handle such as `B07/S2` is allowed in the title.
7. Push the branch. A run with no PR, or with a PR from the same repository, pushes a branch with no upstream with `git push -u origin <branch>`. When `isCrossRepository` is true, the run pushes with `git push <head repository URL> HEAD:<headRefName>`, and never pushes a branch to `origin`. To make the head repository URL, start from the URL of `origin`. Replace its owner with the `login` of `headRepositoryOwner`, and its repository name with the `name` of `headRepository`. Never force-push a shared branch.
8. Run `gh pr create --title <title> --body-file <file>`. Open a draft only when the repo opens drafts first. For an open PR, run `gh pr edit <number> --body-file <file>`.
9. In the standard tier, post one hand-off comment on the ticket and set its status. Make no new tracker objects. Put each out-of-scope finding in `<git common dir>/astack/plans/<slug>/drafts.md`.
10. When the hardening profile sets `after_create_pr: harden`, run `astack-pr-review-hardening --pr <number>` once. The profile sets its cap and minimum, and the default cap is 2. The state and the diff of a PR hold for its `headRefOid` only. Compare `git rev-parse HEAD` with `headRefOid` before you act on the PR. The push of step 7 makes them equal. When they differ, push first.
11. Reply in 6 lines or fewer. Give the PR link, the gate counts and the stop of the hardening run. Then give the next step. Merge only with a grant.
