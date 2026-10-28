# Issue tracker: GitHub

This repo keeps issues and specs in GitHub Issues.
Use `gh` for tracker operations.
Infer the repo from `git remote -v`.
Inside a clone, `gh` identifies it automatically.

## Conventions

- Create an issue with `gh issue create --title "..." --body "..."`. Use a quoted heredoc for a multiline body.
- Read an issue with `gh issue view <number> --json number,title,body,labels,comments`.
- List issues with `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`. Add the required `--label` and `--state` filters.
- Create a child with `gh issue create --parent <parent> ...`. Alternatively, attach it later with `gh issue edit <parent> --add-sub-issue <child>`. These forms need `gh` 2.94+.
- With older `gh`, use `gh api --method POST repos/<owner>/<repo>/issues/<parent>/sub_issues -F sub_issue_id=<child-db-id>`. Use the child's database ID, as described under Blocking below.
- If sub-issues are unavailable, start the child body with `Part of #<parent>`.
- Comment with `gh issue comment <number> --body "..."`.
- Add a label with `gh issue edit <number> --add-label "..."`. Remove it with `--remove-label "..."`.
- Close an issue with `gh issue close <number> --comment "..."`.

Use the ticket headings from `astack:write-ticket`:
`## Problem`, `## Outcome`, `## Acceptance criteria`, `## Scope` and `## Verification`.
Also include headings from the repo's matching `.github/ISSUE_TEMPLATE/` template when one exists.
When the astack hook is available, it checks template headings on `gh issue create`.
Without a matching repo template, it checks the ticket headings.

## Pull requests as a triage surface

PRs as a request surface: no.

Set the flag to `yes` only if the repo treats external PRs as feature requests.
`/astack:triage` reads this flag.
When enabled, PRs use the same labels and states as issues.

Use the checkout of the PR before acting on it.
The state and the diff of a PR hold for its `headRefOid` only. Compare `git rev-parse HEAD` with `headRefOid` before you act on the PR.

For a lookup of the current branch's PR, apply this rule:

There is no PR only when gh exits 1 and its standard error matches `grep -qi 'no pull requests found for branch'`. Each other failure of `gh pr view` is an error, not a missing PR. Print the error of gh, and stop.

- Read a PR with `gh pr view <number> --comments`.
- Read its diff with `gh pr diff <number>`.
- Discover external PRs with `gh api --paginate 'repos/{owner}/{repo}/pulls?state=open' --jq '.[] | select(.author_association | IN("OWNER","MEMBER","COLLABORATOR") | not) | {number, title, author: .user.login, author_association, labels: [.labels[].name]}'`.
- Comment with `gh pr comment`.
- Add or remove labels with `gh pr edit --add-label` and `--remove-label`.
- Close with `gh pr close`.

GitHub shares issue and PR numbers.
Resolve a bare `#42` with `gh api 'repos/{owner}/{repo}/issues/42' --jq 'has("pull_request")'`.
A `true` result identifies a PR.
Read it with `gh pr view 42`.
A `false` result identifies an issue.
Read it with `gh issue view 42`.
On an API failure, print the error and stop.
Do not infer a resource type from a failed command.
The [GitHub issue endpoint](https://docs.github.com/en/rest/issues/issues#get-an-issue) identifies a PR with its `pull_request` key.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Use the issue-reading command under Conventions.

## Wayfinding operations

`/astack:wayfinder` uses one map issue and child issues for its tickets.

### Map

Create one issue labelled `wayfinder:map` with `gh issue create --label wayfinder:map`.
Its body contains Notes, Decisions so far and Not yet specified.

### Child ticket

Link each ticket to the map as a GitHub sub-issue with the convention above.
Without sub-issues, add the child to a task list in the map body.
Start that child's body with `Part of #<map>`.
Use one `wayfinder:<type>` label from `research`, `prototype`, `grilling` or `task`.
Assign a claimed ticket to the developer driving the session.

### Blocking

Use GitHub's native issue dependencies as the canonical representation visible in the UI.
Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`.
Get the numeric database ID with `gh api repos/<owner>/<repo>/issues/<n> --jq .id`.
Use neither the `#number` nor `node_id` as `<blocker-db-id>`.
`issue_dependencies_summary.blocked_by` counts open blockers and supplies the current gate.
If dependencies are unavailable, start the body with `Blocked by: #<n>, #<n>`.
A ticket becomes unblocked when every blocker is closed.

### Frontier query

List the map's open children with `gh issue list --state open`, scoped to its sub-issues or task list.
Exclude assigned children.
Exclude a child with `issue_dependencies_summary.blocked_by > 0`.
For a fallback body relation, exclude a child while any issue in its `Blocked by` line remains open.
Choose the first eligible ticket in map order.

### Claim

Run `gh issue edit <n> --add-assignee @me` as the session's first write.

### Resolve

Post the answer with `gh issue comment <n> --body "<answer>"`.
Then run `gh issue close <n>`.
Append a short summary and link to the map's Decisions so far.
