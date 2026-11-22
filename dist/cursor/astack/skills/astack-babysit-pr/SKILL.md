---
name: "astack-babysit-pr"
description: "Watch one PR through CI and review bots, fix the real findings and stop at merge-ready. Use when the owner asks to babysit, watch or monitor a PR."
---

# Babysit PR

This skill is the entry point of the Babysit route of `astack-mode`.
Follow the Babysit playbook.
Read it at the path that `astack skill-path astack:mode playbooks/babysit.md` prints.
The playbook owns the modes, the watcher, the CI classes, the bot triage and the stop at merge-ready.
This skill adds the rules below.
When a rule here goes against the playbook, the playbook wins.

## The head of the PR

Run `astack check pr-head` before you act on a PR, with `--pr <n>` for a named PR. Go on only after exit 0 with an `ok:` last line or exit 3 with a `no_pr:` last line.

A later failure of `gh pr view` is an error, not a missing PR. Print it, and stop.

## Wait with one watcher

- Use one watcher for each PR. It is `astack watch-pr` from the playbook, or the managed watcher that the harness requires.
- Never run two watchers on one PR. All watchers of a GitHub account use the same rate limit.
- Never write your own poll loop or sleep loop.
- Only the session that owns the PR watches it. A delegate or a reviewer seat never starts a watcher.
- A wake gives news. It is not a merge decision. Examine the merge state yourself.
- Stop the watcher before you hand off or ask the owner a question.
- When a wake needs no action, end the turn with no message. Never post or say "still waiting".
- Start the watcher again after each push, after you act on a verdict and after a resume.
- `astack watch-pr` accepts a PR that is behind its base. Before you report the PR as ready, read `gh pr view <n> --json mergeStateStatus` once.
- For a `BEHIND` PR of this session, update it through `references/refresh.md` of the mode. For another PR, report the branch that needs the update.

## GitHub rate limits

`gh pr view`, `gh pr checks` and `gh pr create` use GraphQL.
The REST limit of GitHub is separate, and it usually has calls left.

- When GraphQL has no calls left, read the PR with `gh api repos/<owner>/<repo>/pulls/<n>`.
- Read its checks with `gh api repos/<owner>/<repo>/commits/<sha>/check-runs`.
- A watcher that stops because it cannot read the PR usually hit the rate limit.
- Before you start it again, run `gh api rate_limit --jq .resources.graphql`.
- When `remaining` is near 0, wait for `reset` with one background command. Then start the watcher again.
- Never start a watcher again in a tight loop.

## Review findings

- Act only on checks and comments that are newer than the last push.
- Examine each bot finding against the source before you change code. Use `playbooks/review-bot-triage.md` of the mode.
- Fix real findings and CI failures. Keep a failure of the repo apart from a flaky failure of the infrastructure.
- Treat CodeRabbit as advisory. Triage its findings like other findings.
- `astack watch-pr` and the merge guard gate on each check of the PR. They do not yet exempt the check of an advisory bot, such as CodeRabbit.
- So a pending or failed check of an advisory bot holds the merge. Report that state to the owner. Do not report the PR as ready.
- Some repos hold rule files for a review bot, such as `.macroscope/check-run-agents/*.md`. Read them before you answer that bot. Its findings cite them.
- Post each comment through `astack-leaving-pr-comments`. That includes the reason before you dismiss and resolve a thread.
- Attach a screenshot or a video when it proves a claim and you can upload it.

## Keep the PR small

Review loops tend to grow a PR one small fix at a time.
Keep the PR at the size that the goal of the owner needs.
Fix real bugs in the intended case.

Decline the rest with a written reason, and list each one as a follow-up.
Examples of the rest are tests that the goal does not need and guards for edge cases that do not matter. Extra compatibility and small performance costs are examples too.
Prefer the fix that deletes or narrows code.

## Stop

- When another PR makes this PR obsolete, stop the watcher.
- Then tell the owner about the other PR.
- Ask before you close the PR, unless the owner already allowed the close.
- Merge only when the owner explicitly asks for a merge. Send that request to the Shipping playbook of the mode.
- Without that request, report that the PR is ready.
- Do not rebase or force-push in a babysit. Step 4 of the playbook gives the one exception.
