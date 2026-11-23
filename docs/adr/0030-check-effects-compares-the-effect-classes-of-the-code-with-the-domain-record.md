# 0030. astack check effects compares the effect classes of the code with the domain record

Status: Accepted
Date: 2026-11-23
Ticket: none
Supersedes: none

## Context

ADR 0018 gives each code plan one domain block over a contexts card.
The card names the pure modules and the caps, and each step names the caps of its row.
No check compared those names with the imports of the code.
So a module under a `pure` line can write files, and the plan does not see the effect that a change adds.

A probe with the scanner of the type hook read the 174 modules under `src/` in less than 0.1 s.
It found 18 throws, all outside the pure modules, and 0 casts.
A regex reads the word `throw` in 5 strings and comments of `comments/` and `types/`.

## Decisions

### D1. The check gives advice only, and a later block sets its exit

`astack check effects` compares the effect classes of each module with the card and the plan block.
Each rule finding is advice, and the check exits 0 with findings.
B36 of the review roadmap makes the rules fail after an advice window of 7 days.
The window counts the false findings first.

### D2. The classes come from the tokens of the types scanner

`src/astack/domain/imports.ts` reads the tokens of `src/astack/types/scan.ts`.
A value import of `node:fs`, `node:child_process`, `node:net`, `node:http`, `node:https` or `node:os` gives its class.
A read name of `node:fs` gives fs-read. A namespace import or another name also gives fs-write.
`Bun.spawn`, a bare `fetch` call, `process.env`, `process.cwd`, `Date.now`, a bare `new Date()`, `performance.now`, `Math.random` and `crypto.randomUUID` give a class too.
A string, a comment, `import type` and an import of a JSON file give none.

### D3. The card rules use the classes through imports, and the change rule the own classes

A module holds its own classes and the classes of each module that it imports by value under the code roots.
Each member of an import cycle gets the union.
The card rules and the step rules use these classes.
The change rule uses only the own classes of each module at the diff base and at HEAD.
So one change in `git.ts` does not ask the block to name each of its 56 importers.
A code root with no slash names only a file at the repo root, so test files stay outside the roots.

### D4. A pure module has no class, no throw statement and no unsafe cast

A module under a `pure` line of the card has no class through imports.
It has no `throw` statement and no `cast` finding of `findHatches`.
So `as const`, `satisfies` and a bare `as unknown` pass, as in the type hook.

### D5. A literal dynamic import is a value import

An `import()` call with a literal path counts as a value import.
Each other `import()` call and each `require` call give advice, because the check cannot read their classes.

### D6. The abs rule counts the direct value importers under the code roots

Each `callers` path of an `abs` line imports the module by value.
The number of callers equals the number of direct value importers under the code roots.
A `spreads <n>` deletion equals that number too.
Test files are outside the code roots, so they do not count.

### D7. Advice and reports print one line each, and check proof keeps its verdict

A rule finding prints as `advice:`. An unowned module, a cross-context import and an unresolved import print as `report:`.
Each line gives `<path>:<line>: <rule>: <message>`, and a count line follows.
A bad flag, a bad `--base` ref, an unreadable `--plan` file or a block that does not parse exits 2.
check proof runs the card rules, and with `domain.plan` the block rules and the change rule from its diff base.
It prints the same advice lines and keeps its exit and its verdict.

## Consequences

- Easier: the owner sees each effect that a `pure` module or a new import adds before the merge.
- Easier: a grant store with a `Result` save keeps the grant rules pure and testable.
- Harder: each new module with an own class needs a cap or a linked step in its plan block.
- Risk: the table gives no class to a timer, `console`, the standard streams, a Bun file call or an Effect platform service.
- Risk: a class through imports covers a whole module, so a pure function beside an effectful import gets a false finding.
- Follow-up: B36 sets the exit of each rule after the advice window, and B35 moves the hook handlers to ports.

## Alternatives considered

- A stop now. Rejected because no window counted the false findings yet.
- A regex over the text. Rejected because it reads the `throw` words of strings and comments.
- The classes through imports for the change rule. Rejected because one change in `git.ts` then asks for 56 names.
- A second cast reader. Rejected because it can differ from the type hook.
- Skip a dynamic import. Rejected because it hides an effect.
- A second gate in `package.json`. Rejected because `bun run check` then prints each finding twice.
