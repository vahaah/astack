# Write agent briefs

An agent brief is a structured comment on an issue or PR moving to `ready-for-agent`.
It is the authoritative specification for the AFK agent.
The original body and discussion provide context.

For an issue, specify the change to build.
For a PR, specify the remaining work on its existing diff.
That work can finish behavior, fill gaps or address review findings.
Use the same principles for both.

## Principles

### Keep the brief useful as code changes

A request can wait days or weeks before implementation.
Its files can move, change names or receive refactors during that period.

- Describe interfaces, types and behavioral contracts.
- Name relevant types, function signatures and configuration shapes.
- Exclude file paths and line numbers.
- Do not assume the current implementation structure will remain.

### Describe behavior

State what the system must do.
Let the agent inspect the code and choose its implementation.

A useful instruction says, "The `SkillConfig` type accepts an optional `schedule` field with type `CronExpression`."
An unsuitable instruction says, "Open src/types/skill.ts and add a schedule field on line 42."

A useful instruction says, "With no arguments, `/astack-triage` shows issues needing attention."
An unsuitable instruction says, "Add a switch statement in the main handler function."

### Make completion testable

Include concrete acceptance criteria in every brief.
Each criterion must be independently verifiable.
For example, "`gh issue list --label needs-triage` returns issues that received initial classification."
"Triage should work correctly" gives no checkable result.

### State the scope limits

Name the excluded work.
Do not leave the agent to infer which related features belong in the request.

## Template

```markdown
## Agent Brief

### Category

bug / enhancement

### Summary

one-line description of what needs to happen

### Current behavior

Describe what happens now. For bugs, this is the broken behavior.
For enhancements, this is the status quo the feature builds on.

### Desired behavior

Describe what should happen after the agent's work is complete.
Be specific about edge cases and error conditions.

### Key interfaces

- `TypeName`: what needs to change and why
- `functionName()` return type: what it currently returns vs what it should return
- Config shape: any new configuration options needed

### Acceptance criteria

- [ ] Specific, testable criterion 1
- [ ] Specific, testable criterion 2
- [ ] Specific, testable criterion 3

### Out of scope

- Thing that should NOT be changed or addressed in this issue
- Adjacent feature that might seem related but is separate
```

## Examples

### Good agent brief for a bug

```markdown
## Agent Brief

### Category

bug

### Summary

Skill description truncation drops mid-word, producing broken output

### Current behavior

When a skill description exceeds 1024 characters, it is truncated at exactly
1024 characters regardless of word boundaries. This produces descriptions
that end mid-word (e.g. "Use when the user wants to confi").

### Desired behavior

Reserve the length of "..." within the 1024-character total limit.
Choose the last word boundary within the remaining prefix budget.
Append "..." to that prefix.

### Key interfaces

- The `SkillMetadata` type's `description` field: no type change needed,
  but the validation/processing logic that populates it needs to respect
  word boundaries
- Any function that reads SKILL.md frontmatter and extracts the description

### Acceptance criteria

- [ ] Descriptions under 1024 chars are unchanged
- [ ] Descriptions over 1024 chars use the last word boundary within
      1024 minus the length of "..."
- [ ] Truncated descriptions end with "..."
- [ ] The total length including "..." does not exceed 1024 chars

### Out of scope

- Changing the 1024 char limit itself
- Multi-line description support
```

### Good agent brief for an enhancement

```markdown
## Agent Brief

### Category

enhancement

### Summary

Add `.out-of-scope/` directory support for tracking rejected feature requests

### Current behavior

When a feature request is rejected, the issue is closed with a `wontfix` label
and a comment. There is no persistent record of the decision or reasoning.
Future similar requests require the maintainer to recall or search for the
prior discussion.

### Desired behavior

Rejected feature requests should be documented in `.out-of-scope/<concept>.md`
files that capture the decision, reasoning, and links to all issues that
requested the feature. When triaging new issues, these files should be
checked for matches.

### Key interfaces

- Markdown file format in `.out-of-scope/`: each file should have a
  `# Concept Name` heading, a `**Decision:**` line, a `**Reason:**` line,
  and a `**Prior requests:**` list with issue links
- The triage workflow should read all `.out-of-scope/*.md` files early
  and match incoming issues against them by concept similarity

### Acceptance criteria

- [ ] Closing a feature as wontfix creates/updates a file in `.out-of-scope/`
- [ ] The file includes the decision, reasoning, and link to the closed issue
- [ ] If a matching `.out-of-scope/` file already exists, the new issue is
      appended to its "Prior requests" list rather than creating a duplicate
- [ ] During triage, existing `.out-of-scope/` files are checked and surfaced
      when a new issue matches a prior rejection

### Out of scope

- Automated matching (human confirms the match)
- Reopening previously rejected features
- Bug reports (only enhancement rejections go to `.out-of-scope/`)
```

### Good agent brief for a PR

For a PR, "Current behavior" describes the existing diff.
Ask the agent to finish or fix that work.

```markdown
## Agent Brief

### Category

enhancement

### Summary

Finish the contributor's `--json` output flag for `triage list`

### Current behavior

The PR adds a `--json` flag that serializes the issue list to JSON. The happy
path works and the diff matches the project's command structure. Two gaps
remain: errors are still printed as human text (not JSON), and the new flag has
no test coverage.

### Desired behavior

With `--json`, all output (including errors) is well-formed JSON on stdout,
and the command's exit codes are unchanged. The existing human-readable output
is untouched when the flag is absent.

### Key interfaces

- The command's error path should emit `{ "error": string }` under `--json`
  instead of the plain-text error
- Reuse the existing serializer the PR already added; don't introduce a second

### Acceptance criteria

- [ ] `triage list --json` emits valid JSON for both success and error cases
- [ ] Exit codes match the non-JSON command
- [ ] A test covers the `--json` success output and one error case
- [ ] Default (non-JSON) output is byte-for-byte unchanged

### Out of scope

- Adding `--json` to any other command
- Changing the JSON shape of the success payload the PR already defined
```

### Bad agent brief

```markdown
## Agent Brief

### Summary

Fix the triage bug

### What to do

The triage thing is broken. Look at the main file and fix it.
The function around line 150 has the issue.

### Files to change

- src/triage/handler.ts (line 150)
- src/types.ts (line 42)
```

The bad brief has these defects:

- It names no category.
- Its description does not identify the behavior.
- Its paths and line numbers can become stale.
- It gives no acceptance criteria.
- It gives no scope limits.
- It does not distinguish current behavior from desired behavior.
