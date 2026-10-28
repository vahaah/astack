---
name: "astack-why"
description: "Investigate code history and design reasons across available evidence categories. Use for why questions, regressions, postmortems, tradeoffs, or data-backed thresholds."
disable-model-invocation: true
metadata:
  astack-version: "0.1.0"
---

# Why

Find the reasons and intent behind code.
Use `how` to explain runtime behavior.
Use `why` to explain the decisions and constraints that shaped it.

Read role values from `astack-models.md` for every spawn.
Use the named default when the rule or role line is missing.
For `auto` or `inherit-parent`, omit `model`.
These roles need the session's MCP tools, so use subagents that have them.
For an external value such as `codex`, or an unsupported Agent value, use the default.
Report that fallback.
Follow effort rules in `../astack-mode/SKILL.md`.

Use `general-purpose` for each investigator and synthesizer.
It inherits MCP tools needed for investigation and citation checks.
Do not use `Explore`, which lacks those tools and skips project rules.
Tell every investigator to work without writes.

A nested run adds another subagent level.
Claude Code permits three levels and gives no Agent tool to the third level.
Without that tool, investigate each source and synthesize the results yourself, in order.
Report that fallback.

## Current PR operations

These rules apply when a task acts on the current branch's PR.
They grant no write authority.
Use the checkout of that PR before acting on it.
The state and the diff of a PR hold for its `headRefOid` only. Compare `git rev-parse HEAD` with `headRefOid` before you act on the PR.

There is no PR only when gh exits 1 and its standard error matches `grep -qi 'no pull requests found for branch'`. Each other failure of `gh pr view` is an error, not a missing PR. Print the error of gh, and stop.

Read historical PR metadata only as evidence for its commit anchor.
If that read fails, report the error.
Mark that metadata unavailable.
Continue with other available evidence.

## Work from evidence

Be cautious and precise about facts and interpretations.
Read `references/epistemics.md` in full.
The synthesizer must preserve its confidence tiers and wording.

## 1. Define the target and question

The target can be code, a pattern, a feature, or a named design decision.
The question can concern a reason, tradeoff, edge case, external constraint, unused code, or broad history.

If the target is vague, infer it from the conversation, open files, recent edits, or cursor location.
State that interpretation briefly and proceed.
The user can redirect the scope.

## 2. Collect the code anchor

Before delegation, collect file paths, line ranges, key symbols, recent commits, PR numbers, and linked ticket IDs.
Use these commands:

- `git blame -L <start>,<end> <file>` for the last changes to the lines.
- `git log --follow -p -- <file>` for patches through renames.
- `git log --oneline -20 -- <file>` for recent commits and PR references.
- `git log -1 --format=%B <commit>` for PR numbers in commit messages.

Merge subjects can contain PR numbers in the form `(#1234)`.
For a substantive commit, read its PR body and discussion:

`gh pr view <number> --json title,body,author,createdAt,mergedAt,labels,closingIssuesReferences,comments,reviews`

Give this anchor to every investigator and the synthesizer.

## 3. Investigate the evidence categories

Default to full parallel coverage.
Record empty searches instead of silently omitting a source.

### Discover tools first

List the MCP servers available to this session before delegation.
Claude Code tools use `mcp__<server>__<tool>` names.
Deferred tools may show only their names until ToolSearch loads them.

Scan deferred names and load candidate servers with ToolSearch.
Examples include `+linear`, `+sentry`, and `+slack`.
Read their tool descriptions.
`claude mcp list` shows configured servers and connection state.

Connectors from claude.ai can appear as `mcp__claude_ai_<Name>__*`.
A server exposing only `authenticate` and `complete_authentication` is not signed in.
Mark it unavailable and report that `/mcp` provides login.

Map each MCP to one category using its name, instructions, tools, and resource descriptions.
For an ambiguous server, choose the category of its primary evidence.
Record that ambiguity in the coverage map.

| Category | Evidence most likely to answer the question |
|---|---|
| Source control history | Implementation reasons recorded in commits, PR review, comments, and tests. |
| Issue / ticket tracker | Product or business needs that required the work. |
| Long-form documents | Design reasons written before implementation. |
| Real-time team chat | Discussion that never reached a doc, especially when other records are sparse. |
| Infrastructure observability | Runtime signals behind timeouts, retries, rate limits, or circuit breakers. |
| Error / exception tracking | Exceptions and their history behind corrective or defensive code. |
| Product analytics warehouse | Usage, experiments, migrations, and data behind thresholds or flag-controlled releases. |

Always search source control through git and `gh`.
Other categories need an available matching MCP.
Examples include these sources:

- Tickets: Linear, Jira, GitHub Issues, Plane, or Shortcut.
- Documents: Notion, Confluence, Google Docs, or Coda.
- Chat: Slack, Discord, Microsoft Teams, or Mattermost.
- Infrastructure: Datadog, New Relic, Honeycomb, Grafana, Splunk, or Vercel.
- Errors: Sentry, Rollbar, Bugsnag, or Airbrake.
- Analytics: Databricks, Snowflake, BigQuery, ClickHouse, dbt, Redshift, or PostHog.

### Assign investigators

Use one investigator per available evidence category.
Each owns exactly one source tool or MCP.
Do not give one investigator several MCPs.
Spawn them in one message for parallel work.
Use `why investigators`, with `sonnet` as the default model.

Fill `references/investigator-prompt.md` and include these inputs:

- The selected playbook from `references/sources/<source>.md`.
  Adapt an example from `references/source-playbook.md` for a different MCP.
- `references/sources/incident-postmortem.md` when the code looks defensive.
- The code anchor and original user question.
- The MCP server name and a reminder to load tools with ToolSearch before use.

Defensive code includes null checks, retries, timeouts, rate limits, feature flags, egress guards, and OOM handlers.

### Justify skipped categories

Write the reason for each skip in the final `Sources Consulted` section.
Only these reasons qualify:

- No matching MCP is available.
  Report the missing access as a coverage gap.
- The category is provably irrelevant.
  For example, a build-time script with no runtime path can exclude error tracking.

A guess that a source is probably irrelevant is insufficient.

For a trivial one-commit target, an inline answer is possible only after checking all seven category searches for redundancy.
Confirm that the PR already supplies the complete answer.
Explain why further searches add no evidence.
This exception must remain rare.

## 4. Synthesize

Start one synthesizer with `why synthesizer`, default `opus`.
Give it all investigator results, including empty searches and justified skips.
Include the code anchor, original question, `references/epistemics.md`, and `references/synthesizer-prompt.md`.

## 5. Present

Present the synthesizer's answer.
Make light edits for clarity or conversation context only.
Do not rewrite its confidence language.

Use the template's structure:

- `The Question`
- `The Code in Question`
- `What We Found`
- `What We Can Reasonably Infer`
- `Competing Hypotheses`
- `What We Don't Know`
- `Sources Consulted`
- `Confidence Summary`

Adapt optional sections while preserving the separation between evidence and interpretation.
`Sources Consulted` has one line per investigator, including empty results and skipped categories with reasons.

If the question precedes a code change, add a `Preserve / Change / Avoid / Risk` constraint set after `Sources Consulted`.
Use the history findings to support those constraints.

Do not assume that the latest commit explains the whole design.
Trace earlier decisions too.
