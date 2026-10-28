---
name: setup
description: Configure the issue tracker, triage labels and domain documents for astack engineering skills. Run before their first use in a repo.
disable-model-invocation: true
metadata:
  origin: mattpocock-skills
---

# Set up astack

Configure the repo's engineering skills with three kinds of information:

- The issue tracker, such as GitHub, GitLab, Linear or local Markdown.
- The label strings for the five triage roles.
- The glossary and ADR layout, with rules for reading domain documents.

This skill uses an interview rather than a deterministic script.
Explore the repo.
Present the findings.
Confirm the choices with the user before writing.

## Process

### 1. Explore

Inspect the repo's existing configuration:

- Check `.claude/rules/*/agent-skills.md`. A generator can place this file beside `docs/agents/`. If it exists, report its configuration and stop.
- Read `git remote -v` and `.git/config` to identify the repository host and repo.
- Inspect root `AGENTS.md` and `CLAUDE.md`. Check for an existing `## Agent skills` section.
- Inspect root `CONTEXT.md` and `CONTEXT-MAP.md`. A repo that already has `GLOSSARY.md` and `GLOSSARY-MAP.md` instead keeps those names.
- Inspect `docs/adr/` and `src/*/docs/adr/`.
- Inspect `docs/agents/` for earlier setup output.
- Inspect `.scratch/` for an existing local Markdown tracker convention.
- Check whether `astack:triage` is available. The full astack bundle includes it, but a target can omit a capability.
- Check for monorepo evidence. Examples are `pnpm-workspace.yaml`, a `workspaces` field in `package.json`, or populated `packages/*` folders with their own `src/`.

Monorepo evidence must identify a substantial multi-package repo.
Without it, use one context.

### 2. Present findings and ask

Summarize the existing and missing configuration.
Take one section at a time.
Wait for one answer before the next section.
Start each section with your recommendation.
Add a one-line explanation only when a choice needs one.
Skip choices that the inspection has already settled.
Skip Section B when triage is unavailable.
Skip the Section C question when no monorepo evidence exists.

#### Section A: Issue tracker

The tracker is where this repo records work.
`astack:to-tickets`, `astack:triage` and `astack:to-spec` read and write this tracker.
They need its commands or workflow.
For example, they can call `gh issue create` or write files under `.scratch/`.
Ask the user to choose where they actually track this repo's work.

Recommend GitHub when a remote points there.
Recommend GitLab for `gitlab.com` or a self-hosted GitLab remote.
Recommend Linear when the user tracks this repo in Linear.
Otherwise offer these choices, including the user's preferred alternative:

- GitHub uses the repo's GitHub Issues through `gh`.
- GitLab uses the repo's GitLab Issues through [`glab`](https://gitlab.com/gitlab-org/cli).
- Linear uses a team through the Linear MCP tools.
- Local Markdown uses `.scratch/<feature>/`. It suits solo work or a repo with no remote.
- Other trackers, such as Jira, need a one-paragraph workflow from the user. Record that workflow as prose.

Record the choice in `docs/agents/issue-tracker.md`.
The GitHub and GitLab templates include a "PRs as a request surface" flag.
Leave its default off.
Do not raise that choice during setup.
The user can enable external PR discovery later by editing the file.

#### Section B: Triage label vocabulary

Skip this section when `astack:triage` is unavailable.
Otherwise ask exactly one question:

> Do you want to keep the default triage labels? Recommended: yes.

The defaults match the five role names:
`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human` and `wontfix`.
On yes, write those labels unchanged.
Collect overrides only after a no.
An existing label such as `bug:triage` can replace `needs-triage` without creating a duplicate.

#### Section C: Domain docs

Use one root `CONTEXT.md` and `docs/adr/` by default.
Write that choice without asking.
Offer multiple contexts only when the inspection found monorepo evidence.
That layout uses a root `CONTEXT-MAP.md` with links to per-context `CONTEXT.md` files.
Confirm the layout when you offer that choice.

### 3. Confirm and edit

Show drafts before writing:

- The `## Agent skills` block for the instruction file selected in step 4.
- `docs/agents/issue-tracker.md` and `docs/agents/domain.md`.
- `docs/agents/triage-labels.md` when triage is available and Section B ran.

Let the user edit the drafts.

### 4. Write

Select the instruction file with these rules:

- Edit `CLAUDE.md` when it exists, contains more than `@AGENTS.md`, and is not a symlink to `AGENTS.md`.
- Otherwise edit an existing `AGENTS.md`.
- If neither exists, ask which file to create.

When one instruction file exists, edit that file.
Never create the other one.
Update an existing `## Agent skills` block in place.
Preserve user edits in the surrounding sections.

Use this block:

```markdown
## Agent skills

### Issue tracker

[one-line summary of where issues are tracked]. See `docs/agents/issue-tracker.md`.

### Triage labels

[one-line summary of the label vocabulary]. See `docs/agents/triage-labels.md`.

### Domain docs

[one-line summary of layout: "single-context" or "multi-context"]. See `docs/agents/domain.md`.
```

Include `### Triage labels` and its document only when triage is available and Section B ran.
Otherwise omit both.

When Section B ran on GitHub or GitLab, create each missing configured label.
Use `gh label create` or `glab label create`.
For Linear, use `save_issue_label`.
On every real tracker, also create the five `/astack:wayfinder` labels:
`wayfinder:map`, `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling` and `wayfinder:task`.

Use these seed documents:

- [issue-tracker-github.md](./issue-tracker-github.md) for GitHub.
- [issue-tracker-gitlab.md](./issue-tracker-gitlab.md) for GitLab.
- [issue-tracker-linear.md](./issue-tracker-linear.md) for Linear.
- [issue-tracker-local.md](./issue-tracker-local.md) for local Markdown.
- [triage-labels.md](./triage-labels.md) for label mapping when triage is available.
- [domain.md](./domain.md) for the domain layout and its consumer rules.

For another tracker, write `docs/agents/issue-tracker.md` from the user's workflow description.

### 5. Done

Report completion and which engineering skills read the new files.
Explain that the user can edit `docs/agents/*.md` directly.
Run setup again only to switch trackers or start over.
