---
name: "astack-write-ticket"
description: "Write, refine or split Linear and GitHub issues. Use the shared templates and a ten-point rubric before filing."
license: "MIT"
metadata:
  astack-version: "0.1.0"
  source: "astack"
---

# Write a ticket

A ticket states the required result and how someone will verify it.
The implementer chooses the approach.
The reviewer checks the acceptance criteria against the PR.
The ticket must remain useful as the code changes.

Use `references/templates.md` for templates.
Use `references/rubric.md` to check each rubric point.

## Rules for every ticket

- State the outcome. Put code, files and functions only under `## Constraints`, and only for limits the implementer cannot discover alone. Examples include another team's contract or a legal requirement.
- Refer to people by role and records by ID. Examples include "a workspace admin", "team 4821" and "invoice 2290". Exclude personal names, email addresses, phone numbers, customer company names and customer quotes. Link to evidence behind access control rather than pasting it.
- Never invent a reason, acceptance criterion or non-goal. Ask the requester for a missing owner input. Name the rubric point that the answer settles.
- Keep the description as the specification. Put progress, status, review rounds and retracted findings in comments or the PR.
- Give each ticket one outcome. Follow "Split the work" below when it needs more.
- When detailed specs live in repo documents, still include the problem, outcome, acceptance criteria and scope in the ticket. Link the detailed spec.

## The hook checks the headings

The astack hook refuses a new Linear issue without its type's required headings.
Use `##` headings with these exact words:

- Feature: `Problem`, `Outcome`, `Acceptance criteria`, `Scope`, `Verification`.
- Bug: `Summary`, `Environment`, `Steps to reproduce`, `Expected`, `Actual`, `Acceptance criteria`.

Umbrella, map and decision templates use the feature headings.

A label containing the word `bug` selects the bug rules.
A body selects them with `Steps to reproduce`, or with both `Expected` and `Actual`.
A title also selects them with bug, regression, crash, crashes, crashed or broken.
Exclude those words from other ticket types' titles and labels.
Otherwise the hook requires bug headings.

For issue updates, the hook warns instead of refusing.
It also warns about personal data such as email addresses.
For `gh issue create`, it checks the matching repo issue template.
Without a matching template, it uses the headings above.
A repo template adds headings to these required sections rather than replacing them.

## Pick the template

- A feature adds a capability or changes behavior.
- A bug repairs incorrect existing behavior.
- An umbrella holds an outcome too large for one PR. It defines the overall result and check. Each child defines one slice.
- A map parents programme decision tickets and uses `wayfinder:map`.
- A decision settles one programme question before implementation. Use `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling` or `wayfinder:task`.

`astack-to-spec` creates an umbrella spec through these templates.
`astack-to-tickets` creates feature sub-issues for its slices.
Both score drafts against this rubric before filing.
`astack-wayfinder` uses these headings for maps and decisions.
`references/templates.md` maps the skills' sections to the shared headings.
`astack-triage` writes a comment with its own agent-brief headings.
This rubric does not score that comment.

In the programme tier, `/astack-plan` renders an umbrella and `now` and `next` session children with `astack plan-ticket`.
It files them through this skill.
The standard tier creates no ticket.
Score a rendered plan ticket manually on points 2, 4 and 7 only.
`astack check-plan` and `astack plan-ticket` enforce the remaining correspondence with the plan.
The title comes from the session title.
Acceptance criteria come from Exit.
Scope In lists its steps.
Scope Out lists sibling sessions.
No plan code remains in the rendered ticket.
Fix a failing point in the plan rather than editing its rendered ticket.

## Write the title

- Use sentence case with at most 80 characters and no final period.
- For a feature, name who can do what. Example: "Workspace admins can export members as CSV".
- For a bug, state the wrong behavior and its condition. Example: "CSV export drops rows whose name contains a comma".
- For a refactor, subtraction or plan session, use a verb phrase. Example: "Remove the in-memory export path".
- For a decision, state the question. Example: "Which queue backs webhook retries".
- Exclude bracket prefixes such as `[API]` and `[bug]`. Use the project and labels for area and type.
- Exclude bucket titles such as "Updates", "Tidy-up", "Follow-ups from", "Phase 2" and "Misc fixes". They indicate several outcomes.
- Exclude ticket keys, session codes and dates.

## Create a ticket

1. Gather facts from the conversation, linked tickets, code and logs. Look up facts yourself. Ask only for inputs you cannot discover, such as affected roles, urgency, exclusions or who verifies the result.
2. Search for duplicates. In Linear, query `list_issues` with key terms. On GitHub, run `gh issue list --search "<terms>"`. Refine or link a matching ticket instead of creating a duplicate.
3. Fill the chosen template. Remove empty optional sections.
4. Run `astack check-ticket <file>` with `--bug` or `--feature` when the type is known. It checks the shared headings and matching Markdown issue template. Use `--template <name>` to select a template. Use `--no-template` for Linear. Then score the draft against `references/rubric.md`.
5. Fix every failing point. Ask for an input you cannot discover. Never file a ticket with a failing point.
6. Show the draft and scorecard. File it when every point passes and the user asked for publication. Report its key. Under an autonomy grant, or an `astack-mode` playbook's Tickets step, file a passing draft without another question. Otherwise wait for the user's answer.
7. Set the team, parent and exactly one type label. Set the project when the tracker uses projects. Set priority when known. Add links to designs, documents and related issues.

In Linear, call `save_issue` without `id`.
Send applicable `team`, `title`, `description`, `project`, `labels`, `parentId`, `relatedTo` and `links` fields.
Use Markdown with real line breaks for the description.
If `list_templates` returns a team template, start from it when it includes all required headings.

On GitHub, save the body to a file.
Run `gh issue create --title "<title>" --body-file <file> --label <type>`.
Add `--project "<project title>"` when the repo uses GitHub Projects.
Use `--parent <number>` for a child and `--blocked-by <numbers>` for blockers.
Add headings from the matching Markdown template in `.github/ISSUE_TEMPLATE/`.
A template matches when its name, file name or labels identify the ticket kind.
For example, `bug_report.md` matches bugs.
A sole template matches every kind unless it explicitly identifies another kind.
The hook ignores YAML issue forms.
A repo with only forms uses the shared headings above.

## Refine an existing ticket

1. Read the issue and discussion. In Linear, call `get_issue` with `includeRelations: true`, then `list_comments`. On GitHub, run `gh issue view <number> --comments`.
2. Score the ticket. Give each point one line with pass, fail or not applicable, plus its evidence.
3. Draft a rewrite in the correct template. Keep every original fact. Move progress and logs to a draft comment. Turn an unconfirmed fact into a question for the requester.
4. Show the scorecard and rewrite. Wait for approval unless the request already authorized edits. Under an autonomy grant, or an `astack-mode` playbook's Tickets step, apply a passing rewrite without another question. Report the change.
5. Apply the rewrite. In Linear, send its `id` to `save_issue`. For a small edit, use `patch` only when the `save_issue` schema lists it. Otherwise send the complete `description`. On GitHub, run `gh issue edit <number> --body-file <file>`. Post the moved notes as a comment.
6. Preserve status, assignee and priority unless the user requested their change.

## Split the work

A ticket fits when one PR can deliver an independently checkable result with seven or fewer acceptance criteria.
Aim for about 1,000 changed lines or fewer, excluding generated files.
The result must be verifiable without waiting for other tickets.

For larger work, or work that needs decisions first, use `/astack-plan`.
It writes the plan and renders the umbrella and immediately available children.
It files those tickets through this skill.
Without a plan, use an umbrella:

- Put the overall problem, outcome, scope and end-to-end check in the parent.
- Give each child one observable or testable vertical slice with its own criteria and verification. Set `parentId`. Set `blockedBy` when order matters.
- For a wide mechanical change, add the new form beside the old one first. Migrate callers in batches. Delete the old form last.
- Use real sub-issues instead of a checklist of sessions or PRs in the description. The tracker must expose their scope and status.

Treat review findings the same way.
File one sub-issue per finding under the reviewed ticket.
Set a project and type label on each finding.
For a security finding, also set Security, or the workspace equivalent, and a priority.
Never collect findings in a "Follow-ups from" ticket.

## Link the work

Start the PR body with `Part of <key>`, following `/astack-write-docs`.
Leave the ticket open until someone closes it after merge.
