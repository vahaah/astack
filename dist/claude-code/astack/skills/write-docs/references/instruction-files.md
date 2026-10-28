# Instruction files

`AGENTS.md` is the shared instruction file for coding agents in a repo.
Every session loads it, so every line costs tokens on every task.
Include facts needed for all tasks that an agent cannot find with one search elsewhere.

## Use one source

- Write the rules in `AGENTS.md`.
- Make `CLAUDE.md` contain only `@AGENTS.md`, or make it a symlink to `AGENTS.md`. Claude Code reads `AGENTS.md` independently only when both `CLAUDE.md` and `CLAUDE.local.md` are absent. The explicit import works in every case.
- Make other agent files, such as `GEMINI.md`, symlinks too. Delete separate copies that have drifted.
- Generate tool-specific rules from the shared source. Never maintain two handwritten copies.

## What goes in

```md
# <Project name>

One or two sentences: what this repo is.

## Commands

| Task | Command |
|---|---|
| Install | `bun install` |
| Test | `bun test` |
| Check before a PR | `bun run check` |

## Layout

- `apps/web/`: the customer web app.
- `packages/db/`: schema and queries.

## Rules

- Never run migrations against production from a laptop. See `docs/runbooks/migrations.md`.
- Route handlers call services, and services call the data layer. `layers.test.ts` enforces this.

## Traps

| Trap | What happens | Do this |
|---|---|---|
| Running the dev server without the local queue | Jobs pile up and tests time out | Start it with `bun run dev:all` |

## Docs

- Decisions: `docs/adr/README.md`.
- Glossary: `CONTEXT.md`.
- Runbooks: `docs/runbooks/`.
```

## What stays out

| Content | Location |
|---|---|
| Current phase, wave, sprint or status | Tracker |
| Dates, session IDs and "as of" notes | Commit or PR |
| Delivery history and decision logs | ADRs or tracker |
| Long rule explanations | The ADR linked by the rule |
| A rule already enforced by lint, types or tests | No duplicate rule. Point to the check only if agents need to know it exists. |
| Coding standards shared between repos | Shared coding rules. Keep only repo-specific additions here. |

## Size budget

Keep `AGENTS.md` under about 300 lines or 6,000 tokens.
Keep each line under 400 characters.
If it exceeds that budget, reduce it in this order:

1. Remove status, dates and history. Move useful information to the tracker.
2. Delete rules already enforced by checks.
3. Replace long explanations with one sentence and a link to an ADR or reference.
4. Keep only the 20 most common traps inline. Move the rest to `docs/reference/traps.md` and link it.
5. Move area-specific rules to scoped files that load for matching paths only. Examples include `.claude/rules/` files with a `paths:` list.

## Keep it true

- Update `AGENTS.md` in the same PR as its command or rule.
- Check each count and path when editing the file. Prefer a link instead of a copied count.
- When instruction files disagree, fix the source. Regenerate or restore links for copies. Never fix a copy independently.
