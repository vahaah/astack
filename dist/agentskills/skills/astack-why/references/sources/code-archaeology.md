# Code archaeology

## Available evidence

The repo record connects source changes with commits and review.
Search these records for code-level reasons:

- Commit messages, dates, authors, and diffs.
- PR descriptions, review comments, and discussions through `gh`.
- Code comments, TODOs, FIXMEs, and deprecation notes.
- Architectural decision records when present.
- Test names and assertions that identify relevant edge cases.
- Files changed together in the same commits.
- CHANGELOG entries and release notes.
- Ticket IDs in commit messages and PR bodies.

Use this as the primary record of work that passed through the repo.

## Search the history

Expand the initial commit list with these commands:

```bash
# History through renames
git log --follow --oneline -- <file>

# Pickaxe: commits that added or removed this exact text
git log -S '<exact_string_from_code>' -- <file>

# Or for patterns:
git log -G '<regex>' -- <file>

# Who wrote each line and when
git blame -L <start>,<end> <file>

# One commit's full diff
git show <hash>

# Commits between two points affecting this file
git log <old>..<new> -p -- <file>
```

Find related docs, comments, and tests:

```bash
# ADRs often live in docs/adr/ or similar
rg -l -i 'architecture.decision' --glob '*.md'

# TODOs and FIXMEs near the target
rg -n -C2 '(TODO|FIXME|HACK|XXX|NOTE)' <target_file>

# Related tests
rg -l '<symbol>' --glob '*test*'
```
