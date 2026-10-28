# Issue tracker: GitLab

This repo keeps issues and specs in GitLab Issues.
Use [`glab`](https://gitlab.com/gitlab-org/cli) for tracker operations.
Infer the repo from `git remote -v`.
Inside a clone, `glab` identifies it automatically.

## Conventions

- Create an issue with `glab issue create --title "..." --description "..."`. Use a quoted heredoc for multiline descriptions. Pass `--description -` to open an editor.
- Read an issue with `glab issue view <number> --comments`. Add `-F json` for machine-readable output.
- List issues with `glab issue list -O json`. Add the required `--label` filters.
- Post a comment with `glab issue note <number> --message "..."`. GitLab calls comments notes.
- Add labels with `glab issue update <number> --label "..."`. Remove them with `--unlabel "..."`. Separate multiple labels with commas or repeat the flag.
- Close an issue with `glab issue close <number>`. That command accepts no closing comment. Post the reason first with `glab issue note <number> --message "..."`.
- GitLab calls PRs merge requests. Use commands such as `glab mr create`, `glab mr view` and `glab mr note`. They follow the `gh pr ...` command structure. Replace `pr` with `mr`, `comment` with `note`, and `--body` with `--message`.

## Merge requests as a triage surface

MRs as a request surface: no.

Set the flag to `yes` only if the repo treats external merge requests as feature requests.
`/astack:triage` reads this flag.
When enabled, MRs use the same labels and states as issues.

- Read an MR with `glab mr view <number> --comments`.
- Read its diff with `glab mr diff <number>`.
- Discover external MRs with `glab mr list -F json`. Keep only requests whose author is neither a project member nor its owner. Exclude maintainers' ongoing work.
- Comment with `glab mr note`.
- Add or remove labels with `glab mr update --label` and `--unlabel`.
- Close with `glab mr close`.

GitLab numbers issues and MRs separately.
A reference such as `#42` identifies one request once the maintainer names its kind.

## When a skill says "publish to the issue tracker"

Create a GitLab issue.

## When a skill says "fetch the relevant ticket"

Run `glab issue view <number> --comments`.

## Wayfinding operations

`/astack:wayfinder` uses one map issue and child issues for its tickets.

### Map

Create one issue labelled `wayfinder:map` with `glab issue create --label wayfinder:map`.
Its body contains Notes, Decisions so far and Not yet specified.
On tiers with native epics, an epic can hold the map instead.
A labelled issue works on every tier.

### Child ticket

Start the description with `Part of #<map>`.
Use one `wayfinder:<type>` label from `research`, `prototype`, `grilling` or `task`.
Assign a claimed ticket to the developer driving the session.

### Blocking

Use GitLab's native blocking link as the canonical representation visible in the UI.
Post the `/blocked_by #<n>` quick action with `glab issue note <child> --message "/blocked_by #<blocker>"`.
Native blocking needs Premium or Ultimate.
On the free tier, or when native blocking is unavailable, start the description with `Blocked by: #<n>, #<n>`.
A ticket becomes unblocked when every blocker is closed.

### Frontier query

Use `glab issue list -O json`, scoped to the map's children.
Exclude assigned tickets.
Read native links with `glab api projects/:id/issues/<child-iid>/links`.
Exclude a ticket with a `blocked_by` link to an open issue.
For fallback relations, exclude it while any issue in its `Blocked by` line remains open.
Choose the first eligible ticket in map order.

### Claim

Run `glab issue update <n> --assignee @me` as the session's first write.

### Resolve

Post the answer with `glab issue note <n> --message "<answer>"`.
Then run `glab issue close <n>`.
Append a short summary and link to the map's Decisions so far.
