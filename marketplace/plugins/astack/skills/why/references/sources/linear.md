# Linear tickets

## Available evidence

Linear can hold the product or business reason behind code.
Its records include these sources:

- Feature and bug descriptions with their motivation.
- Attached project docs, PRDs, and specs.
- Parent and sub-issue links between an initiative and its tasks.
- Comments that clarify scope or record a decision.
- Labels such as `compliance`, `customer-request`, and `perf`.
- Status changes that explain scope changes.
- Attachments and linked GitHub PRs.

## Search the record

Use the Linear MCP.

1. Fetch tickets linked from initial commits or PRs with `get_issue`.
   Example IDs include `ENG-1234` and `[BUG-567]`.
   Read the whole issue and its comments.
2. Search `list_issues` for feature names, symbols, and business terms.
   Try several relevant phrasings.
3. Follow a sub-issue to its parent.
   The parent can state the reason behind a narrower task.
4. Use `get_project` for an issue's project and inspect attached docs.
   Project docs can hold specs and reasons omitted from the issue.
5. Check labels and milestones.
   Labels can identify customer requests, incident follow-ups, or compliance work.
   Milestones can connect the change to a deadline.

## Evaluate evidence

Useful evidence includes a specific business problem or a comment explaining why one option won.
A parent initiative, attached spec, or relevant label can add context.
Examples of labels include `customer:acme`, `incident-followup`, `compliance`, and `perf-regression`.
Do not treat a generic initiative title or label as a complete reason by itself.

## Check limits

Read scope history when an issue was closed and reopened.
A required Why template can contain generic text without an actual explanation.
Check stale tickets against the date that the code shipped.
Follow duplicate chains to the canonical ticket.
If access fails, report the missing record as a gap.
Do not guess its contents.

## Return findings

For each relevant ticket, return:

- ID and title.
- Exact motivation text from the description or comments, without paraphrase.
- Labels, parent issue, and project.
- Author, creation date, and closed date.
- Ticket link when available.
