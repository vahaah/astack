# The plan file

Start from `astack check-plan --template`, `--template=programme`, `--template=brief` or `--template=domain`.
`astack check-plan` enforces every structural, ledger and prose rule and prints the fix for each finding.

## Where it lives

- Standard plan: `<plan dir>/<slug>.md`. Programme index: `<plan dir>/<slug>/index.md`, with briefs at `B<nn>.md` beside it.
- Plan directory comes from `plan.dir` in `.astack/profile.json`, else `docs/plans`.
- Glossary is `CONTEXT.md`, `GLOSSARY.md` or `plan.glossary`. ADRs live under `plan.adr`, else `docs/adr`.
- Commit plans so every tool can read them. When a repo forbids committed plans, keep them outside the worktree and run `astack check-plan` and `astack plan trail` from the repo.
- Frontmatter `home` takes `repo` (default), `linear` or `github`. A non-repo `home` means the tracker copy is the plan, and no command reads that copy.

## Frontmatter

| Key | Value |
|---|---|
| `plan` | Slug equal to file name, directory name (`index.md`), or block handle (`B<nn>`) |
| `tier` | `standard`, `programme` or `brief` |
| `status` | `draft`, `active` or `paused` |
| `home` | `repo` (default), `linear` or `github` |
| `tracker` | Ticket keys such as `[ABC-327]` or `none` |
| `delegate` | `on` or `off`, set by `astack plan delegate` |
| `checkpoints` | `report` (default) or `approve` |
| `owner-gates` | Fixed owner gates; only a programme can lift `hosted migration` |
| `execute` | `none`, or granted `now` session handles |
| `reviewed` | `YYYY-MM-DD` date of last resume or boundary review |
| `programme`, `block` | Briefs only |
| `terms`, `supersedes` | Optional glossary terms and replaced plan slug |

## Sections in order

1. H1 stating the outcome as a claim, plus an intro of 5 lines or fewer.
2. `## Context` (optional): facts, root cause and measured counts.
3. `## Goal`: `Goal.`, `Decision.` and `Done when.` field lines.
4. `## Scope`: `- In.` and at least one `- Out.` bullet.
5. `## Decisions`: decision table or `None.`.
6. `## Domain and effects` (required when Files name a code path): one `domain` fence (`--template=domain`) naming context, aggregates, invariants, capabilities, steps, flows, laws and derived rung.
7. `## Sessions`: one H3 per session (`S<n>` or `B<nn>/S<n>`) with rolling state (`now`, `next`, `later`, `done`) and steps table for `now`.
8. `## How each step runs` (optional): only deviations from `sessions.md`.
9. `## Proof` (required when active): whole-work proof command.
10. `## Premises`, `## Risks`, `## Gates` (optional).
11. `## Unresolved questions` (always last): numbered questions with `Recommended.`, `Rejected.`, `Settles.`, `Blocks.`, `Binds.`, `Decide by.`, `Ticket.`, or `None.`.

## Decisions

```markdown
| # | Kind | Decision | Rejected | Door | Settled | Record |
|---|---|---|---|---|---|---|
| D1 | goal | Serve access reviews with members only | Guest column | two-way | user R1 | plan |
| D2 | tech | Stream CSV rows | Buffer in memory | one-way | user R2 | ADR 0012 D1 |
| D3 | | Superseded by D4 | | | | |
```

- `Kind`: `goal`, `decision`, `rule`, `tech`. `Door`: `one-way` or `two-way`. `Settled`: `user R<n>`, `delegated`, `evidence`, `default`.
- Never reuse a `D<n>` handle. Supersede `user` rows with a new row. Graduate durable rows to `Graduated to ADR NNNN Dn`. Keep rows near 300 characters.

## Sessions and steps

- Each `now` or `next` session needs `Depends on.`, `Exit.` (1 to 7 observable bullets) and `Proof.`. A `now` session needs a steps table (`#`, `Step`, `Wave`, `Lane`, `Files`, `Covers`, `Exit`, `Proof`, `Checkpoint`).
- A `done` session keeps only `State.`, `Ticket.` and `Lane.`.
- `Files` lists paths, directories ending in `/`, or regions `<file>#<region>`. Keep one editor per region per wave outside `integrator`.

## Caps, no ledger, prose and the checker

- Caps never rise. A standard plan or brief warns at 24 KB or 400 lines and denies at 32 KB. A programme index warns at 250 lines or 15 live D rows and denies at 16 KB. Hand-off comments keep 4 lines.
- No ledger: run `astack check-plan` and follow the plan hook, which denies over-cap files, checkboxes, `Status:` lines and register tables and prints each fix.
- Prose: run `astack check-plan` for long dashes, curly quotes, emoji, STE warnings and avoided glossary words.
- Checker: run `astack check-plan <file...> [--base <ref>] [--all] [--brief] [--json] [--strict] [--no-trail]`. Each message prints the rule and fix.

## Trail and drafts

Both live in `$(git rev-parse --git-common-dir)/astack/plans/<slug>/` (`trail.tsv` and `drafts.md`) and are never committed.

```sh
astack plan trail <plan> <phase> "<decision>" "<why>" "<evidence>" "<result>"
astack plan trail <plan> -
astack plan draft <plan> "<title>" "<why>"
```

## Life of a plan

- One writer edits the plan (planner during planning, integrator during build).
- Plan edits ride in a session PR, never in a standalone PR.
- The last session PR deletes the plan after durable decisions move to ADRs and terms move to the glossary.
- A replacement plan sets `supersedes:` and deletes the old plan in the same PR.
