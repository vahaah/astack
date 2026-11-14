---
name: "astack-file-pr"
description: "File a short PR that starts with the problem, not a list of changes. Use when the owner asks to file, open or create a PR."
metadata:
  astack-version: "0.1.0"
---

# File PR

Follow the Create PR playbook of `astack-mode`.
Read it at the path that `astack skill-path astack:mode references/create-pr.md` prints.
The playbook owns the open-PR lookup, the gates, deslop, the body file, the checks, the push and the hardening run.
This skill adds the voice of the title and the body, a secret scan and a fallback for the GraphQL limit.

## Title

A PR title usually becomes the commit subject.
Follow the title form of the repo.
Read recent merged PRs and the git log for examples.
Without a repo form, use the Conventional Commits form of `astack-write-docs`.

Say why the change matters, not only what it does.
When a user sees a benefit, name it.

```text
Weak:   fix(watch): retry the GraphQL read on HTTP 502
Strong: fix(watch): keep watching a PR when GitHub returns a 502
```

## Body

Put the problem in the `## Why` section of the template.
Start with the problem in the words of the request of the owner.
Then state the approach in one sentence.
Do not start with a list of changed files, functions or entry points.

```text
Weak:   Removed the carry-over from each entry point and deleted three helpers.
Strong: The "new worktree" default did not apply to a new thread. Now each new thread uses the defaults.
```

Keep one attribution in the body.
That is the attribution line of the harness, which `astack-write-docs` keeps.
Add no second line that names a model or a harness.

## Before you create the PR

- Examine the title, the body, each quote and each attachment for secrets and private details.
- Open the PR ready, so that the review bots run. The playbook names the one repo exception.

## The GraphQL limit

`gh pr create` uses GraphQL.
When it fails because the GraphQL limit has no calls left, create the PR through REST.
Do this only after these two steps passed:

1. Step 1 of the playbook found no open PR for this work.
2. `astack check-pr <file>` passed on the body file.

The astack hooks that check a new PR read only `gh pr create`.
The two steps do their work for the REST call.

```bash
gh api repos/<owner>/<repo>/pulls -f title=<title> -f head=<head> -f base=<base> -F body=@<file>
```

For a branch of the same repository, `<head>` is the branch name.
For a branch of a fork, `<head>` is `<head owner>:<branch>`.

The state and the diff of a PR hold for its `headRefOid` only. Compare `git rev-parse HEAD` with `headRefOid` before you act on the PR.

## After the PR exists

- When the owner also asked for a babysit, continue with `astack-babysit-pr`.
- Post a PR comment only when the request of the owner needs one.
- Use `astack-leaving-pr-comments` for each comment.
