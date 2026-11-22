# Domain record requirements

[ADR 0018](../adr/0018-one-domain-and-effects-record-is-checked-against-code.md) governs the domain block of a plan, the contexts card, the tsc witness and the law rung.
The [ladder model](../../formal/ProofLadder.tla) examines the law rung.
[The change proof requirements](change-proof-contract.md) and [the proof ladder requirements](proof-ladder.md) still apply.

## Acceptance criteria

- [criterion:DR-plan-rules] With a card, check-plan refuses a code plan with no block, and with no card it gives no block error. A law with no check, an unlinked step, an error named `Error` and a low rung give an error at their line. The profile key `domain.codeRoots` sets the code roots, and the plan skill names the H2 and `--template=domain`.
- [criterion:DR-card] The card of `CONTEXT.md` holds 7 contexts, and each tracked file under `src/` falls under one glob of one context.
- [criterion:DR-witness] A linked `mergeGrantIn` that returns `MergeGrant[]` fails the witness at its block line in the result reading and in the effect reading. The corrected fixture passes.
- [criterion:DR-law-rung] A prop law on a read-only cap gives R2, a prop law on an invariant gives R3 and a tla law gives R4. A tla law selects its model.
- [criterion:DR-plan-record] The gate admits a manifest with `domain.plan` and no `category`. A wrong linked type, an unlinked step and an unlinked control stop at `category`, and a legacy manifest keeps its output.
- [criterion:DR-ladder-law] A cut of the law rung in `Rung` of ProofLadder violates `FloorOnlyRaises`, and a cut of the tla term of `Selected` violates `TlaLawSelects`.

## Claim boundary

The witness compares the declared types with the exported types by name, and a type that only `export *` gives is no export of the scan.
A step check reads a readonly array and a mutable array of one type as one type. It reads a readonly tuple and a mutable tuple in the same way, but it keeps the order and the length of each tuple. A flow pair still needs the assignment.
The ladder model takes the law kind as a true observation of the block.
The witness reads the tsc of the repo, so a repo with no `node_modules/.bin/tsc` stops a manifest with `domain.plan`.
