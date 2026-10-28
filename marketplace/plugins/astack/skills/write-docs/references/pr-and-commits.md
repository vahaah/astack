# PR bodies and commit messages

## PR body template

Use the repo's template when one exists.
Otherwise use this format.
Keep the required headings exactly as written, because the astack hook checks them:
`Why`, `What changes`, `Verification` and `Risk and rollback`.

```md
Part of ABC-123

## Why

The problem, its impact and the approach in one to three short sentences. Link the failing run, the error-tracker issue or the ticket.

## What changes

One to three bullets on the behavior, not a file list, then what the PR leaves out. Call out schema, API, migration and flag changes. Add the smallest view, such as a call tree or a screenshot, only when the bullets cannot carry the change.

## Acceptance criteria and evidence

| Acceptance criterion | Result |
|---|---|
| Criterion copied from the ticket | Evidence: the test name, the screenshot, the query output |

## Verification

One to three bullets, each a gate or run path with its counts or outcome. For a bug or a review finding, show the failing run first, then the passing run. Name what you did not run.

## Risk and rollback

One or two sentences. Say whether it is a one-way or two-way door, name the blast radius, what could break and how someone would notice, and say how to undo it: a revert, a flag, or a reversible migration.

## Deploy notes

Order of operations, such as a migration that runs before the merge. Checks to run after deploy, and who runs them.

## Follow-ups

Links to tickets only.
```

`Acceptance criteria and evidence`, `Deploy notes` and `Follow-ups` are optional.
Delete an optional section when it has no content.

### The first line

- Use `Part of ABC-123` for Linear or `Part of #123` for GitHub. The tracker links the PR while leaving the ticket open. One line can name several tickets, as in `Part of ABC-123, ABC-124`.
- Never follow a closing word with a key or `#n`. Examples of refused forms are `Closes ABC-123` and `Fixes #123`. They trigger tracker closure at merge. A phrase without a key, such as "Closes the gap in the export", is valid.
- Close the ticket manually after merge when every acceptance criterion is met.
- Linear can also link a PR from a ticket key in its branch name. Merge automation can move that ticket to Done. For partial delivery, read the team's automation settings before deciding whether to include the key in the branch.

### Example

Title: `fix(export): quote CSV fields that contain commas`

```md
Part of ABC-124

## Why

Member exports dropped every member whose name contains a comma, so admins sent incomplete lists to access reviews. The writer joined fields with commas and never quoted them.

## What changes

- The CSV writer quotes any field that contains a comma, a quote or a line break, and doubles embedded quotes.
- The columns and their order stay the same.

## Verification

- `bun test`: 412 pass, 0 fail. The new regression test failed before the fix with 199 of 200 rows.
- Opened an export of the seeded 200-member workspace in a spreadsheet. All 200 rows are present and each name sits in one cell.

## Risk and rollback

Spreadsheet imports that split on bare commas would now see quoted fields. No internal consumer does that. Revert the PR to roll back. The PR changes no stored data.
```

### Pick the smallest view

| Change | View |
|---|---|
| Logic or algorithm | Pseudocode for the new path |
| Runtime control flow | Call tree with one function per line |
| UI structure | Component tree with relevant state and a screenshot |
| Broad refactor | Shallow file tree with one responsibility per entry |
| Visible result | Before and after screenshots or command output |

Choose one view.
A change that needs two views may need two PRs, subject to the owner's PR-split decision.

## PR rules

- Write for a reviewer with the diff open and one minute available. Keep the body under about 40 lines, because squash merge makes it the commit body.
- Describe the final state. Exclude review rounds, commit SHAs, owner rulings and addressed-feedback lists. Link logs, tables and long evidence.
- Explain internal code and abbreviations in plain words on first use, or omit them.
- Always include `Risk and rollback`. State what can fail and how to undo the change. "Low risk" alone is insufficient.
- Keep one plan in one PR. A PR can serve several tickets. Split only when the owner says so.
- Apply the commit-subject rules below to the PR title.

## Commit message rules

```
fix(export): quote CSV fields that contain commas

The writer joined fields with commas and never quoted them, so a
name like "Test, Comma" split into two columns and the import
dropped the row. Quoting every field would break the billing
import, which reads unquoted numbers.

Refs: ABC-124
Co-Authored-By: <added by your agent tool>
```

- Use `type(scope): imperative summary` with at most 72 characters and no final period. Types are `feat`, `fix`, `docs`, `refactor`, `test`, `perf`, `build`, `ci` and `chore`. The scope names the affected area.
- Explain the reason, behavior change and rejected alternatives in the body. Wrap at about 72 characters. Do not repeat the subject.
- Put discovery history, review context and earlier attempts in the body rather than code comments.
- Use one `Refs: ABC-123` trailer. Exclude ticket keys from the subject.
- Keep agent-added trailers, such as `Co-Authored-By` and session links.
- Small, numerous branch commits are valid. With squash merge, only the PR title and body reach the main branch.

A repo's commitlint configuration or local commit rules take precedence.
