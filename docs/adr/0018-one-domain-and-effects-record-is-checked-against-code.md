# 0018. One domain and effects record is checked against code

Status: Accepted
Date: 2026-11-22
Ticket: none
Supersedes: none

## Context

ADR 0006 D1 asks each change brief to cite a composition record, but the record was prose that no check read.
The manifest `category` section repeated the arrows, and admission only looked for each arrow name in a file.
A wrong return type of a linked function passed that mention check.
`check-plan` refused an H2 for the record, and the glossary named no bounded context.
ADR 0015 D4 left the rungs R2 and R3 for the plan laws of a later block.

## Decisions

### D1. A code plan holds one domain block, and three checks compare it with the code

A plan whose Files name a code path holds one `domain` fence under `## Domain and effects`.
check-plan compares the block with the contexts card and the plan steps.
The tsc witness compares each linked step with the code.
The rung derives from the laws of the block and the registry.

### D2. The block has one line for each item, and one parser reads it

The block holds at most 15 lines.
Each line starts with a keyword: `context`, `agg`, `inv`, `cap`, `step`, `flow`, `law`, `map`, `abs` or `rung`.
`src/astack/domain/notation.ts` parses each keyword with one pattern into a union with its line.
It gives the caps and the errors of each flow.
`astack check-plan --template=domain` prints the grammar from that module.

### D3. The contexts card is the one domain fence under Contexts

The card is the first `domain` fence under `## Contexts` of `CONTEXT-MAP.md` or `GLOSSARY-MAP.md`, else of the glossary file.
A second card is an error.
A card context groups code owners under one glossary, so the `CONTEXT.md` of astack holds 7 contexts.
The card also holds the shared caps and a `pure` line for each pure module.

### D4. A repo with a card needs the block in each code plan

In a repo with a card, check-plan refuses a code plan with no block.
It gives each break of a block rule at its line.
A repo with no card gets no block rule, so a product plan changes only when its repo writes a card.

### D5. Each law gives a rung, and the path rung and the floor still apply

A `tsc` law gives R0, and a `prop` law on a read-only cap gives R2.
Each other `prop` law gives R3, and a `tla` law gives R4 and selects its model.
The rung is the highest of the path rung, the law rung and both floors.
The block names its rung, and check-plan refuses a rung below the derived rung.

### D6. The witness writes Equals checks and maps each tsc error to its block line

The witness writes one check for each step, flow pair and agg line under `node_modules/.cache/astack/`.
It runs the tsc of the repo with the tsconfig of the first linked module.
It refuses a tsc that git tracks. Its own config holds only the type check options of that tsconfig, and it has no `extends`.
A module under another tsconfig stops the witness.
Each step needs one Files cell `<module>#<name>`, and the run removes its folder.

### D7. The profile picks the carrier and the code roots

`domain.carrier` of `.astack/profile.json` picks `result`, the default, or `effect`.
`domain.codeRoots` sets the globs of a code path.
A linked module that exports `Result` gives that type, else the witness declares the shape of `result.ts`.
Apply writes both keys from the companion config.

### D8. The effect reading compares Success, Error and Context

The effect reading compares `Effect.Effect.Success`, `Error` and `Context` of each step.
Each cap names the tag class of its port module.
A stub `effect` package holds those names for the tests, so astack has no `effect` dependency.

### D9. A generic or overloaded link fails with a hint

The long agg form needs the exports `decide` and `fold`.
A link to a generic or overloaded export fails at its line with a hint to link a concrete export.
Type parameters in the step grammar wait for 10 plans with a block.

### D10. A manifest cites the block with domain.plan, and holds no category

A manifest holds `domain.plan` or `category`, and never both.
With `domain.plan`, the domain stage finds `domain.context` in the card.
The category stage applies the block rules, the witness verdict and the law links.
A manifest with `category` keeps its earlier checks and output.

### D11. Check proof reads the plan at HEAD, else at the manifest base

The gate hashes the plan, the card and the linked modules with the other inputs.
A `prop` law needs a links row of the matrix for its control.
A `tla` law needs its model and its invariant in `formal/models.json`.

## Consequences

- Easier: a wrong return type of a linked step fails at its block line in less than one second.
- Easier: the owner reads each effect, step type and law of a change in 15 lines.
- Harder: each astack brief with a code path needs a block after the card lands.
- Risk: the export scan misses a name that only `export *` gives, and the witness then names that type.
- Follow-up: `astack check effects` compares the caps with the imports in a later block.

## Alternatives considered

- Prose effect lists. Rejected because no check reads them.
- A YAML block. Rejected because it needs a schema for each key.
- A card path key or a CONTEXT-MAP.md with 7 glossaries. Rejected because one glossary serves each code owner of astack.
- A rung that the author picks. Rejected because ADR 0015 rejects it.
- The TypeScript compiler API. Rejected because it is `unstable/` in TypeScript 7.0.2.
- An `effect` dev dependency. Rejected because astack code never imports it.
- A required `domain.plan` now. Rejected because it stops the proof gates of 2 product repos.
