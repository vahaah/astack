---
name: "astack-why"
description: "Find the reasons behind code in its written record. Use for why questions, design reasons, regressions, postmortems, tradeoffs, or data-backed thresholds. Use how for runtime behavior."
disable-model-invocation: true
metadata:
  astack-version: "0.4.0"
---

# Why

Answer from the record, not from the code.
Read the commits and the PR discussions that added the target and each later change.
When that trail leaves the reason open, read the other sources of step 3.
Cite what the authors wrote.
Mark each inference as an inference.
Say what the record does not answer.

Do the whole investigation yourself, in one pass.
Delegate no part of it.
Do not write files, commit, or change external state.

## Current PR operations

These rules apply when a task acts on the current branch's PR.
They grant no write authority.
Use the checkout of that PR before acting on it.
Run `astack check pr-head` before you act on a PR, with `--pr <n>` for a named PR. Go on only after exit 0 with an `ok:` last line or exit 3 with a `no_pr:` last line.

A failure of `gh pr view` is an error, not a missing PR. Print it, and stop.

Read historical PR metadata only as evidence for its commit anchor.
If that read fails, report the error.
Mark that metadata unavailable.
Continue with other available evidence.

## 1. Define the target and question

The target can be code, a pattern, a feature, or a named design decision.
The question can concern a reason, tradeoff, edge case, external constraint, unused code, or broad history.

If the target is vague, infer it from the conversation, open files, recent edits, or cursor location.
State that interpretation briefly and proceed.
The user can redirect the scope.

## 2. Collect the code anchor

Collect file paths, line ranges, key symbols, recent commits, PR numbers, and linked ticket IDs.
Use these commands:

- `git blame -L <start>,<end> <file>` for the last changes to the lines.
- `git log --follow -p -- <file>` for patches through renames.
- `git log --oneline -20 -- <file>` for recent commits and PR references.
- `git log -1 --format=%B <commit>` for PR numbers in commit messages.
- `git log -S '<literal>' -- <file>` for the commit that added a value or a name.

Merge subjects can contain PR numbers in the form `(#1234)`.
For a substantive commit, read its PR body and discussion:

`gh pr view <number> --json title,body,author,createdAt,mergedAt,labels,closingIssuesReferences,comments,reviews`

Do not assume that the latest commit explains the whole design.
Trace earlier decisions too.

## 3. Read the other sources

Read further when the commits and PRs leave the reason open.
Read further also when the code looks defensive.
Examples of defensive code are null checks, retries, timeouts, rate limits, feature flags, egress guards, and OOM handlers.
Its reason often lives in an incident, an error, or a runtime signal.

First list the MCP tools of this session.
Load a deferred tool before you call it.
A server that offers only a sign-in tool is not signed in.
Mark it unavailable.
Tell the user how to sign in.

| Source | Evidence that it can hold | Examples |
|---|---|---|
| Source control | Reasons in commits, PR reviews, comments, and tests | git, `gh` |
| Tickets | Product or business needs behind the work | Linear, Jira, GitHub Issues |
| Documents | Design reasons written before the code | Notion, Confluence, Google Docs |
| Team chat | Discussion that never reached a document | Slack, Discord, Microsoft Teams |
| Observability | Runtime signals behind timeouts, retries, and limits | Datadog, Grafana, Honeycomb |
| Error tracking | Exceptions behind corrective or defensive code | Sentry, Rollbar, Bugsnag |
| Analytics | Usage and experiment data behind thresholds and flags | Databricks, BigQuery, PostHog |

Always read source control.
Search each other source with the ticket IDs, PR numbers, symbols, and literal values of the anchor.
Limit each search to the dates of the commits.
Record an empty search as a result.

Skip a source only for one of these reasons:

- No matching tool is available in this session. Report that as a coverage gap.
- The source is provably irrelevant. For example, a build script with no runtime path has no error history.

A guess that a source is probably irrelevant is not a reason.

## 4. Weigh the evidence

Code shows behavior, but it does not prove why that behavior exists.
Give each claim one of these five tiers.
Match its section and its words to that tier.

1. Direct. One written source states the reason. Write "This exists because X", with the citation beside it.
2. Supported. Several indirect items point to one conclusion. Name each item and what it adds.
3. Inferred. Context makes a reading reasonable, but no source supports it. Write "Given A and B, C seems likely because D".
4. Speculative. Weak evidence fits, and other hypotheses fit equally well. Write "One possibility is X, but we have no direct evidence". Put it under `Competing Hypotheses`.
5. Unknown. You searched and found no reason. Name the sources, the queries, and the coverage.

Use a word that asserts intent or success only for a Direct or Supported claim with its citation.
Such words include `because`, `the reason is`, `was designed to`, `fixes`, and `the team decided`.
Qualify an inference with words such as `appears to`, `likely`, `suggests`, or `is consistent with`.
Do not write `obviously`, `clearly`, `of course`, a dismissive `just`, `I think`, or `I believe`.

Obey these rules too:

- Never use code as evidence of its own intent.
- Do not defend a design from its current use. Its first reason can be old or wrong.
- A repeated pattern can come from copied code, not from a decision.
- Test a reason that the user suggests as one candidate. Do not accept it by default.
- When two sources disagree, show both, with their citations. Let the user judge them.
- For each gap, name the question, the sources, the queries, and the result. Do not fill a gap with a guess.

## 5. Present

Use these headings:

- `The Question`
- `The Code in Question`
- `What We Found`
- `What We Can Reasonably Infer`
- `Competing Hypotheses`
- `What We Don't Know`
- `Sources Consulted`
- `Confidence Summary`

Omit `What We Can Reasonably Infer` or `Competing Hypotheses` when it has no content.
Keep evidence and interpretation in separate sections.
`Sources Consulted` has one line for each source of step 3.
Each line gives the search and its result, or the reason for the skip.

If the question precedes a code change, add a `Preserve / Change / Avoid / Risk` constraint set after `Sources Consulted`.
Use the history findings to support those constraints.

Before you reply, check each claim in `What We Found` and `What We Can Reasonably Infer`.
Give it a citation, or move it to inference or hypotheses.
