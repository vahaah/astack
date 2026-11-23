# Create PR

Use this playbook for "create pr". One plan is one PR. A follow-up goes into the open PR.
Each other playbook that opens a PR runs steps 1 to 8. Only the owner's "create pr" runs steps 9 to 11.

## Before step 1

Build in a git worktree based on main. Subagents inherit that worktree.
Each `Agent` call on the same branch needs its own worktree with `isolation: "worktree"`.
Move unrelated work from a dirty branch into a patch, and apply it in a fresh worktree.
Rebase the work into small, ordered commits. Each commit must be landable and help explain the sequence.

## PR head checks

Run `astack check pr-head` before you act on a PR, with `--pr <n>` for a named PR. Go on only after exit 0 with an `ok:` last line or exit 3 with a `no_pr:` last line.

## Steps

1. Look for an open PR for this work. Run `gh pr list --head <branch> --state open --json number,headRefName,headRefOid,headRepositoryOwner,headRepository,isCrossRepository,maintainerCanModify`, and search the open PRs for the ticket key. `--head` matches a branch of any owner. So a PR with `isCrossRepository` true is the PR of this work only when `git merge-base --is-ancestor <headRefOid> HEAD` exits 0. When one exists, update it and go to step 7.
   - There is no PR only when `gh pr list` exits 0 and prints no PR. Each other failure of `gh pr list` is an error, not a missing PR. Print the error of gh, and stop.
   - When `isCrossRepository` is true and `maintainerCanModify` is false, make no fix commit and push nothing. Tell the owner that the fork does not allow edits from maintainers, so no fix can reach the PR.
2. Run every repo gate: lint, typecheck, tests and the doc checks. Record the counts. Fix each red gate at its root cause first.
3. Run `/astack-deslop` on the branch diff against its base. It also runs `astack-no-comments`. Commit its edits. When they change code, run the gates again.
   - Then run `/astack-code-review` against the branch base, before `gh pr create`. Fix each hard Standards finding and each Spec finding in its own commit. Run `astack-interrogate` only when the user or the repo profile asks for it. File a finding outside the scope fence with `/astack-write-ticket`.
   - Run `astack check proof` on the candidate. Go on only after exit 0 and a last line that starts with `ok: proof `.
   - An Autopilot owner opens its PR early, and it finishes this review before its code-ready report.
4. Write the PR body to a file. Use the repo PR template, else the template in `astack-write-docs`. Write it in STE.
   - When the profile sets `tracker.requirePartOf`, the first line is `Part of <key>`. One line can name more tickets, as in `Part of ABC-1, ABC-2`.
   - Never put a ticket key or `#n` after a closing word such as "Closes" or "Fixes".
   - List the in-scope defects and the hidden work that the PR fixes.
   - For a performance change, Verification gives one primary number and its unit with `before → after`.
5. Run `astack check-pr <file>`. Fix each finding.
6. Write the title in the commit subject form of `astack-write-docs`. A plan handle such as `B07/S2` is allowed in the title.
7. Push the branch. A run with no PR, or with a PR from the same repository, pushes a branch with no upstream with `git push -u origin <branch>`. When `isCrossRepository` is true, the run pushes with `git push <head repository URL> HEAD:<headRefName>`, and never pushes a branch to `origin`. To make the head repository URL, start from the URL of `origin`. Replace its owner with the `login` of `headRepositoryOwner`, and its repository name with the `name` of `headRepository`. Never force-push a shared branch.
8. Run `gh pr create --title <title> --body-file <file>`. Open a draft only when the repo opens drafts first. For an open PR, run `gh pr edit <number> --body-file <file>`.
9. In the standard tier, post one hand-off comment on the ticket and set its status. Make no new tracker objects. Put each out-of-scope finding in `<git common dir>/astack/plans/<slug>/drafts.md`.
10. When the hardening profile sets `after_create_pr: harden`, run `astack-pr-review-hardening --pr <number>` once. The profile sets its cap and minimum, and the default cap is 2.
11. Reply in 6 lines or fewer. Give the PR link, the gate counts and the stop of the hardening run. Then give the next step. Merge only with a grant.

## Stacks

A stack is a chain of base branches. The root PR targets trunk.
Each child branch rebases onto the exact tip of its parent, and its PR targets that parent branch.
Create a child with `gh pr create --base <parent-branch>`. Retarget it with `gh pr edit <pr> --base <parent-branch>`.
After a parent merges, move the child to trunk under `playbooks/shipping.md` step 5.

## Babysit

A new PR does not start a babysit. Post the URL and continue the build.
Start a babysit pass only when the user asks after the whole stack exists.
A subagent that opens a PR posts the URL and returns to its parent.
An Autopilot-full or Autopilot-stack owner is the exception. Its brief assigns the babysit loop, and the owner starts it after its code-ready report.
