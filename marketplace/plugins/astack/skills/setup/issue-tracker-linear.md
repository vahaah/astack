# Issue tracker: Linear

This repo keeps issues and specs in Linear team <TEAM>.
Use the Linear MCP tools.
Pull requests remain on the repo's git host.

## Conventions

- Create an issue with `save_issue` without `id`. Send `team`, `title` and a Markdown `description`. Use the `astack:write-ticket` headings: `## Problem`, `## Outcome`, `## Acceptance criteria`, `## Scope` and `## Verification`. Add `project`, `labels`, `parentId` and `blockedBy` when applicable. The astack hook refuses a new issue that lacks its headings.
- Read an issue with `get_issue` and `includeRelations: true`. Then call `list_comments`.
- List issues with `list_issues`. Its filters include `team`, `project`, `label`, `state`, `parentId` and `assignee`.
- Set `parentId` when creating a child. For an existing child, send its `id` and `parentId` to `save_issue`.
- Post a comment with `save_comment`.
- Apply or remove labels only when the `save_issue` schema lists `addLabels` and `removeLabels`. Send `id` with those fields. Otherwise read current labels with `get_issue`. Then send `id` and the full new list as `labels`.
- To close an issue, post the reason with `save_comment` first. Then send its `id` and the team's done `state` to `save_issue`. Use the canceled state for a rejection.
- Record native blocking relations with `blockedBy` and `blocks` on `save_issue`.

## Pull requests as a triage surface

PRs as a request surface: no.

Start a PR body with `Part of <TEAM>-123`.
Never put a ticket key after a closing word such as `Closes`.
The astack hook refuses that form.

## When a skill says "publish to the issue tracker"

Create an issue in team <TEAM> with the convention above.

## When a skill says "fetch the relevant ticket"

Read the issue and comments with the convention above.
Accept a key such as `<TEAM>-123` or a Linear URL.

## Wayfinding operations

`/astack:wayfinder` uses one map issue and child issues for its tickets.

### Map

Use one issue labelled `wayfinder:map` with the map template from `astack:wayfinder`.

### Child ticket

Set `parentId` to the map.
Use one `wayfinder:<type>` label from `research`, `prototype`, `grilling` or `task`.
Assign a claimed ticket to the developer driving the session.

### Blocking

Use `blockedBy`.
A ticket becomes unblocked when every blocker is completed or canceled.

### Frontier query

Call `list_issues` with the map's `parentId` and `assignee` set to `null`.
Keep open issues only.
Exclude any issue whose `get_issue` relations show an open blocker.
Choose the first eligible ticket in map order.

### Claim

Call `save_issue` with the ticket's `id` and `assignee: "me"` as the session's first write.

### Resolve

Post the answer with `save_comment`.
Then call `save_issue` with the ticket's `id` and the team's done state.
Add a short summary and link at the end of the map's Decisions so far.
When the `save_issue` schema lists `patch`, send the map's `id` with one `insert_before` operation in `patch`. Anchor it on `## Not yet specified`. Otherwise read the map's description with `get_issue`. Insert the pointer before that heading. Send the full text as `description`.
