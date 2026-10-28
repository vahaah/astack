---
name: "astack-write-docs"
description: "Write and place documents, PR bodies and commit messages. Use for documentation changes, ADRs and change descriptions."
---

# Write docs

Give each fact one home.
Code, types and tests define behavior.
Documents explain how to run the project, define its terms, explain decisions and describe operations.
The tracker records status and progress.
Commits and PRs record change history.

Follow the repo's PR template, ADR format and document layout when they exist.
Use this skill where the repo has no convention.

The references provide details:

- `references/adr.md` defines ADR criteria, format, amendments and supersession.
- `references/pr-and-commits.md` defines PR bodies and commit messages.
- `references/instruction-files.md` defines stable instruction files and includes a skeleton.
- `references/technical-writing.md` defines four layers of technical writing.
- `references/unslop.md` lists patterns to remove from prose.

## Write plainly

Use `references/technical-writing.md` for documents, PR bodies and commit messages.
Then apply `references/unslop.md`.
Their main rules are these:

- Use actual symbols, files and commands with ordinary developer vocabulary.
- State one thought per sentence. Use active voice, present tense and "you".
- Remove filler, hedges and adverbs. Exclude long dashes, bold-label lists, emoji and title-case headings.
- Verify each count at the landing commit. Otherwise link its source instead of copying the count.

## Put each doc where readers look

| Doc | Location | Content | Excluded content |
|---|---|---|---|
| README | `README.md` | Project purpose, local setup and document index | Status and unstable counts |
| Agent instructions | `AGENTS.md`, imported by `CLAUDE.md` | Commands, hard rules with pointers and measured traps | Status, dates, plans and delivery history |
| Glossary | Existing `CONTEXT.md` or `GLOSSARY.md`, otherwise `CONTEXT.md` | Bold domain terms with one or two definition sentences, `_Avoid_:` and optional `_Code_:` symbols | Ticket sections and implementation details |
| Context map | `CONTEXT-MAP.md` for several contexts | Links to one glossary per context | Duplicate glossary definitions |
| Decisions | `docs/adr/NNNN-<claim>.md`, indexed in `docs/adr/README.md` | One decision topic per file | Review logs, PR history and status |
| Runbooks | `docs/runbooks/<task>.md` | Steps to deploy, operate or recover one system | File names based on tickets or dates |
| Reference | `docs/reference/<system>.md` | Subsystem facts | Instructions and opinion |
| Plans | `docs/plans/<slug>.md`, written and checked by `/astack-plan` | Decisions, sessions, premises and open questions for current work | Status, checkboxes, dates and citations from code |
| Status and progress | The tracker or PR | Work ownership and completion | Copies in repo files |

Delete a plan after its last session ships.

## Change docs with the code

Update documents in the same PR as the behavior they describe:

| Change | Document |
|---|---|
| Add or rename a domain term | Glossary |
| Make a choice that passes the ADR test | New ADR |
| Reverse or replace a decision | New ADR that supersedes it |
| Leave an ADR's words stale or misleading | Note or Amended block in that ADR |
| Change an env var, deployment step or operations procedure | Runbook and env inventory |
| Change a command or hard rule | `AGENTS.md` |
| Change local setup | `README.md` |
| Change visible user behavior | User documentation |

Encode an enforceable constraint in a type or test.
If it also needs words, apply the three ADR tests below.
If it fails those tests, put the reason in the commit body.
A code comment can state a constraint only when a keep clause covers it, such as a vendor or protocol requirement.

## Record decisions in ADRs

Write an ADR only when all three conditions hold:

1. Reversal would require substantial work.
2. A future reader would find the code surprising without the reason.
3. The choice came from a real trade-off between alternatives.

When a condition fails, use another location.
Put enforceable constraints in types or tests, terms in the glossary, and history in commits or PRs.

During design discussions, `astack-domain-modeling` updates the glossary and proposes ADRs with the same tests.
This skill owns their file names and format.
Keep an existing `GLOSSARY.md` name.
Otherwise use `CONTEXT.md`.

Use a title that states a claim true after the decision takes effect.
"Exports stream rows to the client" is a claim.
"Export architecture" is only a topic.
Number decisions `D1`, `D2` and onwards.
Never renumber them.
Cite them as `ADR NNNN D2`.
Use a Note block for stale wording.
Use an Amended block to quote and correct misleading wording.
A changed decision needs a new ADR that supersedes the old one.
Use the template in `references/adr.md`.

## Keep instruction files lean

Use `AGENTS.md` as the shared instruction source.
Make `CLAUDE.md` contain `@AGENTS.md` or link to it with a symlink.
Claude Code reads `AGENTS.md` independently only when no `CLAUDE.md` exists.
Other agent files must be symlinks or generated copies of the shared source.

- Keep the source under about 300 lines or 6,000 tokens. Every session loads it.
- Include stable rules only. Give each rule one sentence and a pointer to its ADR, test or lint.
- Put status, dates, phases, session IDs and delivery history in the tracker.
- Add a trap only after a real failure. Use one table row for the trap, its effect and the correct action.

Use `references/instruction-files.md` for a skeleton and reduction process.

## Write the PR body

Write for a reviewer who has the diff open and less than one minute.
Explain the problem, behavior change, proof and failure risks.
Keep the body under about 40 lines, because it becomes the commit body on squash merge.

Use an existing repo template.
Look for `PULL_REQUEST_TEMPLATE.md` or `pull_request_template.md` in `.github/`, the root or `docs/`.
Also inspect `.github/PULL_REQUEST_TEMPLATE/` for multiple templates.
Copy the selected template's headings into the body file.
Never pass `--template` with `gh pr create`.
GitHub CLI refuses it beside `--body` or `--body-file`.
The astack hook checks the template headings.
With multiple templates, it checks only their shared headings.
Run `astack check-pr <file>` before creation.
Use `astack check-pr <file> --template <name>` to check all headings of one selected template.

Without a repo template, use this format with the headings unchanged:

```md
Part of ABC-123

## Why

## What changes

## Acceptance criteria and evidence

## Verification

## Risk and rollback

## Deploy notes

## Follow-ups
```

The hook requires `Why`, `What changes`, `Verification` and `Risk and rollback`.
`Acceptance criteria and evidence`, `Deploy notes` and `Follow-ups` are optional.
Delete empty optional sections instead of writing "n/a".

- Name the ticket on the first line as `Part of ABC-123`. Multiple tickets can share that line, as in `Part of ABC-123, ABC-124`. The line is mandatory when `.astack/profile.json` sets `tracker.requirePartOf`.
- Never put a ticket key or `#n` after a closing word such as `Closes`, `Fixes` or `Resolves`. That form triggers tracker completion at merge, so the astack hook refuses it. The reference explains GitHub issue and branch-name cases.
- Describe behavior. Call out schema, API and migration changes rather than listing files.
- Describe the final state. Keep review rounds, commit SHAs and owner rulings out of headings and body. Link logs and long tables.
- Explain internal code and abbreviations in plain words, or omit them.
- Always state rollback. Name the revert, flag or reversible migration that undoes the change.
- Keep Why to one to three short sentences covering the problem, impact and approach.
- Keep What changes to one to three behavior bullets, followed by excluded work. Add a small call tree or screenshot only when prose cannot explain the change.
- Keep Verification to one to three gates or run paths with counts or outcomes. For defects and review findings, show the failing run before the passing run.
- Keep Risk and rollback to one or two sentences. State reversibility, affected systems and the rollback step.

## Write commit messages

- Use `type(scope): imperative summary` with at most 72 characters and no final period. Types are `feat`, `fix`, `docs`, `refactor`, `test`, `perf`, `build`, `ci` and `chore`.
- Put the ticket key in a `Refs: ABC-123` trailer. Exclude it from the subject.
- Explain the reason, behavior change and rejected alternatives in the body. Do not repeat the subject. Put discovery history and earlier attempts here rather than in code comments.
- Keep agent-added trailers such as `Co-Authored-By` and session links.
- Apply the subject rules to PR titles, because a squash merge uses that title on the main branch.
- Small ordered branch commits are valid. Put a fix and its test or script together so every commit passes its checks.

Follow a repo's commitlint configuration or local commit rules when present.
