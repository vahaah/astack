---
name: "astack-to-tickets"
description: "Split a plan, spec or conversation into vertical tickets. Publish one per file or tracker issue, with blocking edges."
disable-model-invocation: true
---

# Create tickets

Split a plan, spec or conversation into vertical tickets.
Each ticket delivers a small end-to-end result and names its blockers.

If the tracker or triage labels are unspecified, tell the user to run `/astack-setup`.

When `/astack-plan` drives the work, it uses this skill's slicing and quiz rules.
It files the tickets itself.

## Process

### 1. Gather context

Use the context already available in the conversation.
Fetch any supplied spec path, issue number or URL.
Read its full body and comments.

### 2. Explore the codebase when needed

Explore the current code if you have not already done so.
Use the domain glossary in titles and descriptions.
Respect relevant ADRs.
Identify preparatory refactors that would simplify implementation.
Schedule those before the feature change.

### 3. Draft vertical slices

Create tracer-bullet tickets with these properties:

<vertical-slice-rules>

- Each slice covers a narrow, complete path through schema, API, UI and tests.
- Each completed slice can be demonstrated or verified independently.
- Each slice fits in one fresh context window.
- Preparatory refactors happen first.

</vertical-slice-rules>

Name every ticket that must finish before each ticket can start.
A ticket with no blockers can start immediately.

Use expand, migrate, contract for a wide mechanical refactor that cannot produce independently green vertical slices.
Examples include a column rename or a shared-symbol type change across many call sites.

First, add the new form beside the old one without breaking callers.
Then migrate callers in batches sized by the affected package or directory.
Give each batch its own ticket, blocked by the expansion.
Keep CI green after each batch while the old form remains.
Finally, delete the old form after no caller remains.
Block that contraction ticket on every migration batch.

If migration batches cannot pass independently, keep the same sequence on a shared integration branch.
Make all batches block a final integrate-and-verify ticket.
Promise green gates only at that final ticket.

### 4. Quiz the user

When available, load `astack-write-ticket`.
Score each draft with its rubric.
Fix every failing point.

Present a numbered list of proposed tickets.
For each ticket, show its title, blockers and end-to-end result.
Ask the user these questions:

- Are the tickets too large, too small or correctly sized?
- Does each blocking edge represent a real prerequisite?
- Should any tickets be combined or split?

Revise until the user approves the breakdown.

### 5. Publish approved tickets

Use the tracker configured by `/astack-setup`.
The ticket content stays the same across trackers.
The representation of blocking edges changes.

For local files, write one ticket per `.scratch/<feature-slug>/issues/<NN>-<slug>.md` file.
Start numbering at `01` in dependency order, with blockers first.
List blocker numbers or titles in each file's "Blocked by" field.
Use the local template below.
Never combine tickets into one file.

For a real tracker, create one issue per ticket in dependency order.
Create blockers first so each edge can use a real identifier.
Prefer native relations when available.
Examples include Linear `blockedBy` and `parentId`, and GitHub dependencies and sub-issues.
Otherwise list the blocking issues in "Blocked by".
If the source is an existing issue, make each ticket its sub-issue with the configured tracker operation.
Apply the `ready-for-agent` triage label unless instructed otherwise.
The approved slices must be ready for agent implementation.

Work on the frontier of tickets whose blockers are all complete.
For a linear chain, follow its order from the first ticket to the last.
Never close or modify a parent issue.

Both templates use the headings from `astack-write-ticket`.
They give tickets the same structure across trackers and let the astack hook check them.

<local-ticket-template>

```markdown

# <NN>: <Ticket title>

Status: ready-for-agent
Blocked by: the numbers/titles of the tickets that gate this one, or "None (can start immediately)".

## Problem

Why this slice matters, in one or two sentences.

## Outcome

The end-to-end behaviour this ticket makes work, from the user's perspective, not a layer-by-layer implementation list.

## Acceptance criteria

- [ ] Acceptance criterion 1, which fails before this ticket's work
- [ ] Acceptance criterion 2

## Scope

In: this slice. Out: the sibling tickets that cover the rest, by title.

## Verification

The seam under test, and the command or demo path that shows the slice works.

```

</local-ticket-template>

<issue-template>

## Problem

Put `Part of <parent>` on the first line when the source is an existing issue.
Then explain why the slice matters in one or two sentences.

## Outcome

Describe the end-to-end result from the user's perspective.
Do not list implementation layers as the outcome.

## Acceptance criteria

- [ ] Criterion 1, which fails before this ticket's work
- [ ] Criterion 2

## Scope

In: this slice.
Out: the sibling tickets that cover the rest, named by title.

## Verification

Name the test seam and the command or demonstration that proves the slice works.

## Blocked by

- Reference each blocker, or write "None (can start immediately)". Omit this section when native relations already record the blockers.

</issue-template>

Exclude specific paths and code snippets from either form because they become stale.
A prototype snippet is an exception when it states a decision more precisely than prose.
Examples include a state machine, reducer, schema or type shape.
Put that snippet under `## Constraints` with a link to the prototype.
Keep the parts that express the decision.
Do not include a working demo.
