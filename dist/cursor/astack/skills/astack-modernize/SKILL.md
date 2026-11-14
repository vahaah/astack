---
name: "astack-modernize"
description: "Bring an old PR up to date with its base, and decide whether it must stay open. Use when the owner asks to modernize or rebase a PR."
---

# Modernize

Modernize the idea, not only the branch.
A clean rebase does not prove that the PR still belongs in the product.

## Guardrails

- The request of the owner in this turn must name the PR.
- That request allows a rebase and a forced update of the branch of that PR only.
- A request to take over a PR is not such a request. It gives no permission to force-push the branch of that PR.
- It does not allow a merge, a close, a new base branch or more scope.
- `references/refresh.md` of `astack-mode` never rebases a pushed branch. This skill is the one exception, for the PR that the owner names.
- Treat each change in the current worktree as work of the owner. Do the rebase in a new worktree.
- Compare with `origin/<baseRefName>` after `git fetch origin`, or with a recorded `BASE_SHA`. A local base branch can be behind.
- Never force-push without a lease. Pin the lease to the head SHA that you recorded before the rebase.
- Never merge the PR.
- Post no PR comment unless the owner asks for one. Use `astack-leaving-pr-comments` for each comment.

## 1. Record the PR

Read the PR with `gh pr view <n> --json number,url,state,author,baseRefName,headRefName,headRefOid,headRepositoryOwner,headRepository,isCrossRepository,maintainerCanModify,reviewDecision`.

There is no PR only when gh exits 1 and its standard error matches `grep -qi 'no pull requests found for branch'`. Each other failure of `gh pr view` is an error, not a missing PR. Print the error of gh, and stop.

- Record the URL, the state, the base, the head repository and branch, the author, the checks and the review state.
- Record `headRefOid` as `HEAD_SHA`.
- When `isCrossRepository` is true and `maintainerCanModify` is false, push nothing. Tell the owner that the fork does not allow edits from maintainers.
- Read the title, the body, the linked issues, the commits, the review threads and the full diff with `gh pr diff <n>`.
- State the smallest goal that the PR tried to reach. Do this before you judge its code.

## 2. Make a worktree at the head

1. Run `git worktree add --detach <dir>` with a new directory outside this checkout.
2. In that worktree, run `gh pr checkout <n> --detach`.
3. The state and the diff of a PR hold for its `headRefOid` only. Compare `git rev-parse HEAD` with `headRefOid` before you act on the PR.
4. Run `git fetch origin`. Use the real base of the PR, `baseRefName`, and not a guess such as the default branch.
5. Record the merge base with `git merge-base HEAD origin/<baseRefName>` as `BASE_SHA`.

## 3. Examine what changed around the PR

Read what the base got after the PR started.
Use `git log --oneline <BASE_SHA>..origin/<baseRefName>` and `git diff --stat <BASE_SHA> origin/<baseRefName>`.
Search the merged and open PRs when a title, a path or a behavior suggests a replacement or a second change for the same goal.
Use `gh search prs --repo <owner>/<repo> <terms>` for that search.

Look past the lines that overlap:

- Did the base already solve the same problem for the user?
- Did APIs, types, schemas, dependencies or the borders between modules change?
- Do both sides now own the same behavior or invariant?
- Did the base delete, move or simplify the code that the PR changes?
- Can the PR bring back an old behavior, or make two ways to do the same thing?
- Is the benefit still larger than the cost of upkeep?

A PR is not current only because git reports no conflict.

## 4. Choose a verdict before any push

- `MODERNIZE`. The goal is still useful, and the code still has the right shape. Rebase, resolve the conflicts, run the gates and update the branch.
- `REWORK`. The goal is still useful, but a rebase keeps the wrong code. Explain the smallest rewrite. Stop before any push, unless the owner also asked for that rework.
- `CLOSE`. Another change replaced the PR, or the PR is obsolete, goes the wrong way or costs more than it gives. Cite the evidence and stop. Do not rebase an obsolete branch. Never close the PR without the permission of the owner.

Be ready to recommend `CLOSE`.
Age alone is not evidence.
Past work is not a reason to keep a PR open.

## 5. Rebase for MODERNIZE

1. In the worktree at `HEAD_SHA`, run `git rebase origin/<baseRefName>`.
2. Resolve each conflict by the intent of the PR and the newer invariants of the base.
3. When a conflict shows a product or design disagreement, stop. Do not guess. Choose the verdict again.
4. Compare the commit series before and after with `git range-diff <BASE_SHA>..<HEAD_SHA> origin/<baseRefName>..HEAD`.
5. Read the final diff with `git diff origin/<baseRefName>...HEAD`.
6. Make sure that no intended behavior went away and no landed behavior came back.
7. When the branch has a change-proof manifest, set its `base` to the full SHA that `git merge-base HEAD origin/<baseRefName>` prints. Commit that change on its own. The manifest base then excludes the changes that the rebase brought.
8. Run the repo gates for the touched paths. With a change-proof manifest, also run `astack check proof <manifest> --base origin/<baseRefName>`. Record the counts.
9. Keep a real failure apart from a failure that was there before and from a failure of the infrastructure.
10. Push with `git push --force-with-lease=refs/heads/<headRefName>:<HEAD_SHA> <head repository URL> HEAD:<headRefName>`.
11. When the lease fails, fetch again. Then choose the verdict again. Never overwrite new work.

The head repository URL of a PR from the same repository is the URL of `origin`.
For a PR from a fork, make the URL as step 7 of `references/create-pr.md` of the mode says.

## Report

Start with `MODERNIZE`, `REWORK` or `CLOSE` and the reason.
Then give these items:

- The important changes on the base.
- The conflicts of intent, or a statement that you found none.
- The result of the rebase and the push, when you did them.
- The gates that you ran, with their counts.
- The decision or work that remains, with the PR link.

Keep observed facts apart from judgment.
Name each claim that you did not examine.
