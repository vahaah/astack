# Domain record requirements

[ADR 0018](../adr/0018-one-domain-and-effects-record-is-checked-against-code.md) governs the domain block of a plan, the contexts card, the tsc witness and the law rung.
[ADR 0030](../adr/0030-check-effects-compares-the-effect-classes-of-the-code-with-the-domain-record.md) governs `astack check effects`.
The [ladder model](../../formal/ProofLadder.tla) examines the law rung.
[The change proof requirements](change-proof-contract.md) and [the proof ladder requirements](proof-ladder.md) still apply.

## Acceptance criteria

- [criterion:DR-plan-rules] With a card, check-plan refuses a code plan with no block, and with no card it gives no block error. A law with no check, an unlinked step, an error named `Error` and a low rung give an error at their line. The profile key `domain.codeRoots` sets the code roots, and the plan skill names the H2 and `--template=domain`.
- [criterion:DR-card] The card of `CONTEXT.md` holds 7 contexts, and each tracked file under `src/` falls under one glob of one context.
- [criterion:DR-witness] A linked `mergeGrantIn` that returns `MergeGrant[]` fails the witness at its block line in the result reading and in the effect reading. The corrected fixture passes.
- [criterion:DR-law-rung] A prop law on a read-only cap gives R2, a prop law on an invariant gives R3 and a tla law gives R4. A tla law selects its model.
- [criterion:DR-plan-record] The gate admits a manifest with `domain.plan` and no `category`. A wrong linked type, an unlinked step and an unlinked control stop at `category`, and a legacy manifest keeps its output.
- [criterion:DR-ladder-law] A cut of the law rung in `Rung` of ProofLadder violates `FloorOnlyRaises`, and a cut of the tla term of `Selected` violates `TlaLawSelects`.
- [criterion:DR-effect-card] With a `pure` line on grant.ts as on main, `astack check effects` prints one advice line with fs-read and fs-write and exits 0. After the split it prints none for grant.ts. A pure module with a `throw` statement, an `as Plan` cast and an `as const` gives 2 findings, and a `throw` in a string gives none.
- [criterion:DR-effect-classes] A module that imports from node:fs with `import type` has no class. A module that imports `writeFileSync` has fs-read and fs-write, and so does each module that imports it by value.
- [criterion:DR-effect-change] With `--base`, a module that gains `spawn` and no block line of it gives one advice line. The line names the classes at the base and at HEAD.
- [criterion:DR-effect-advice] check proof prints each effects finding as an `advice:` line and keeps the exit and the verdict of a tree with no finding. `astack check effects` exits 0 with findings, and a bad flag, ref, plan or block exits 2.

## Claim boundary

The witness compares the declared types with the exported types by name, and a type that only `export *` gives is no export of the scan.
A step check reads a readonly array and a mutable array of one type as one type. It reads a readonly tuple and a mutable tuple in the same way, but it keeps the order and the length of each tuple. A flow pair still needs the assignment.
The ladder model takes the law kind as a true observation of the block.
Each agg module, linked module and port path of a plan record is a regular file inside the repo. A parent path, an absolute path and a symlink stop at `category`.
The witness reads the tsc of the repo, so a repo with no `node_modules/.bin/tsc` stops a manifest with `domain.plan`.
A tree that tracks a file under `node_modules/`, or the target of `node_modules/.bin/tsc`, also stops it.
The witness config copies only the type check options that `tsc --showConfig` gives for the tsconfig. It holds no `extends`, so a repo option that writes a file has no effect.
The effect classes come from a fixed table of node modules and named globals. A timer, `console`, the standard streams, a Bun file call and an Effect platform service give no class.
A class through imports covers a whole module, so a pure function beside an effectful import gets a finding too.
