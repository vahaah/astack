# Per-repo overlays

An overlay is the part of a repo's instructions that adds to the coding rules. It lives in the repo's `AGENTS.md` or in a file under `.claude/rules/`. Keep it short. Each line states a rule and points at the test, lint or ADR that holds it.

## What an overlay may declare

| Item | Example | Effect on the rules |
|---|---|---|
| Stricter rules | "No default exports." "Every public function returns a `Result`." | The stricter rule wins. |
| Enforced layers | "Route handlers call services, and services call the data layer. `layers.test.ts` enforces this." | These layers are exempt from "inline one-caller wrappers". Code inside each layer stays thin. |
| Bounded contexts | "`billing` and `accounts` import each other only through their `public` modules." | Same exemption as enforced layers. |
| Gates | "Before a PR, run `bun run lint`, `bun run typecheck`, `bun test` and `bun run docs:check`." | "Done" means these passed. |
| Schema library | "Zod 3. The Zod 4 migration is tracked as its own ticket." | Follow the repo's version. Migrate only the lines you change. |
| Test layout | "Unit tests sit beside the source as `*.test.ts`. End-to-end tests live in `e2e/`." | Put new tests where the repo expects them. |
| Data metadata | "Every column has a `comment on column` that states its purpose." | This is schema data, not a code comment, so the comment rules do not apply. |

## What an overlay may not do

An overlay may not widen the comment keep list by itself. Some repos require comment forms such as decision citations, cast justifications or context headers. Each of these conflicts with the keep list. The repo owner settles each conflict once:

1. Change the repo rule so the fact lives somewhere else: a test name, a type, an ADR, or the PR.
2. Or add a keep pattern for that one form to `commentKeep` in `.astack/profile.json`, and give the reason in the commit.

Until the owner decides, the keep list applies and the comment hook and Sicko treat the form as an ordinary comment.

An overlay may not loosen the root-cause rule or the test rules. A repo that needs an exception names the file and the reason in an ADR.

## Template

```md
## Coding overlay

This repo follows the astack coding rules. The lines below add to them.

- Layers: <layers>, enforced by `<test file>`.
- Gates before a PR: `<command>`, `<command>`.
- Schema library: <library and major version>.
- Tests: <where unit and end-to-end tests live>.
- <Stricter rule>. Enforced by `<lint rule or test>`.
```
