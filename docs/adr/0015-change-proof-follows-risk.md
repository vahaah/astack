# 0015. Change proof runs a model only where the changed paths need one

Status: Accepted
Date: 2026-11-22
Ticket: none
Supersedes: none

## Context

ADR 0005 D1 gives each change one gate, and ADR 0005 D3 runs the model of the manifest again for each admission.
So each change started the same three TLC runs, also a change of one Markdown file.
A probe of only `docs/design.md` started 4 Java processes.

The manifest named one model, and the gate ran only that model.
A probe of `merge-guard.ts` with the PlanBoundary manifest admitted, and the SessionGuards model never ran.
TLC reads only the model files, so a model run cannot see a code change.

Each scope row also needed a `modelRefs` name of the manifest model.
Each product manifest holds that key, so a schema change of the key stops each product gate.

## Decisions

### D1. TLC runs only where a wrong verdict can merge, delete, leak or reorder

A model run is evidence for the paths that its model covers.
A covered path, a model file, the registry or a floor of R4 runs TLC.
Each other path keeps the reference, scope and control checks of ADR 0005.

#### Formal claim

The [ladder model](../../formal/ProofLadder.tla) and its [configuration](../../formal/ProofLadder.cfg) check the rung rule, the model selection and the one-triple rule.

```text
TlcOnlyAtR4          == a model run starts only at R4
AdmitNeedsEachTriple == an admission at R4 needs one passed triple for each selected model
FailClosedStops      == an uncovered fail-closed path stops before a rung
FloorOnlyRaises      == the rung is the highest of the path rung and both floors
OneTriplePerModel    == each model starts at most one triple
ManifestFirst        == a selected model starts only after the manifest model passed
RegistryRunsAll      == a registry diff runs each model of both sides
DeletedRegistryStops == a registry at the diff base with none in the tree stops
```

The model has 2 models, 7 path kinds, a base registry that can be absent and the floors R0, R1 and R4 on each side.
A diff holds one or two path kinds, and the model takes each order of the derive, start, judge and admit steps.
The model takes the glob match, the registry parse and the TLC verdict as true observations.

> Amended 2026-11-22: The model also takes a fixed law kind with the law rung 0, 2, 3 or 4. `Rung` takes the highest of the path rung, the law rung and both floors, and `FloorOnlyRaises` holds the law rung too. `TlaLawSelects` holds that a tla law selects the second model. [ADR 0018](0018-one-domain-and-effects-record-is-checked-against-code.md) D5 holds the law rung.

#### Category composition

The record uses the `pure` carrier, because each arrow returns a value and does no I/O.

```text
deriveLadder     : LadderInput -> Ladder
modelRuns        : Ladder -> LadderRun
admitChangeProof : AdmissionFacts -> Admitted
```

`deriveLadder` reads the changed paths, both registries, both floors and the manifest model.
It gives a rung, its cause and the selected runs, or a stop text.
`modelRuns` gives the runs of a ladder, or the manifest model alone when no registry exists.
`admitChangeProof` takes one evidence triple for each run, in the run order.
`prove` in [proof.ts](../../src/astack/cli/commands/check/proof.ts) calls them as plain calls, so no composition operator, map, functor or monad applies.

#### Implementation correspondence

| Model concept | Concrete contract |
|---|---|
| `Derive` and `DeriveStop` | `deriveLadder` in [rung.ts](../../src/astack/change-proof/rung.ts) gives a ladder or a stop |
| `Rank` | the path rung of `deriveLadder`, with the globs that [registry.ts](../../src/astack/change-proof/registry.ts) parses |
| `baseFloor` and `treeFloor` | `proofFloor` in [profile.ts](../../src/astack/profile.ts) reads `proof.minRung` on each side |
| `Start` and `Judge` | `runTriple` in `proof.ts` starts one triple and judges it positive, negative, restored |
| `CanStart` | `prove` runs the manifest model first, and `ManifestFirst` checks that order |
| `Admit` | `admitChangeProof` needs one passed triple for each run |

These links describe the abstraction relation.
They do not establish refinement of all TypeScript behavior.
`prove` also returns at the first stop, so no later triple starts.
With two models, the model has no later triple after a stop of the second model, so the model does not check this rule.
The CLI control `rl-stop-order` examines a stop of the manifest model.

#### Verification

[The proof matrix](../../.astack/proof-coverage.json) links the criteria of [the ladder requirements](../reference/proof-ladder.md) to their tests.
The CLI controls use fixture repos and a Java shim that logs each start.
The negative control removes the fail-closed guard of `Derive`, and it must violate `FailClosedStops`.

### D2. One registry file maps each path

`formal/models.json` lists each model with `name`, `model` and `negative` in the manifest shape, `records`, `covers` and `text`.
It also holds the `failClosed`, `contractOnly` and `unmodelled` entries.
The `name` of a model is its module name.
An `unmodelled` entry names its reason and a control marker of a test.

> Note 2026-11-22: TLC reads only the model files, so a code change cannot fail a model. The first record of each registry entry now holds a dated `## Invariant audit` table, with one row for each invariant and property except `TypeOK`. A `restates` row names the action whose guard or update it repeats, and a control that a test holds. An `independent` row gives its reason. `tests/astack/model-audit.test.ts` fails a missing, stale or uncontrolled row. An entry can also hold a `conformance` field with its conformance test and a code mutation of the function that the test guards. The SessionGuards entry names `grantReasons`.

### D3. One run starts at most one triple for each model, and no verdict persists

A model runs once, also when the manifest and a path both select it.
The manifest negative replaces the registry negative of its model.
No run stores a verdict, so each admission runs each selected model again.

### D4. The rung is the highest path rung and the floor

A model glob, a model file or the registry gives R4.
A path under a fail-closed glob with no model glob stops, unless an `unmodelled` entry gives it R1.
A path under a `contractOnly` glob gives R0, and each other path gives R1.
R2 and R3 wait for the plan laws of a later block.

> Amended 2026-11-22: A law of a plan block now gives R2 and R3. A prop law on a read-only cap gives R2, and each other prop law gives R3. [ADR 0018](0018-one-domain-and-effects-record-is-checked-against-code.md) D5 holds this rule.

### D5. At R4 the manifest model runs with each selected model

At R4 the manifest model runs first, then each other selected model in registry order.
Below R4 no Java process starts, and the manifest model gets only its static plan check.
ADR 0005 D3 and its controls apply to each model run at R4.
The manifest negative stays the one model mutation of a change.

### D6. The gate reads the registry at the diff base and in the tree

A registry diff runs each model of both sides.
The gate compares the parsed registries of both sides, so an edit that git does not list is also a registry diff.
A registry at the diff base with no registry in the tree stops at `rung`.
A model leaves the registry in two changes, because a base model with no module in the tree stops.
The fail-closed globs of both sides apply, so a fail-closed glob also leaves the registry in two changes.
With no registry on either side, only the manifest model runs, and the output has no rung line.

### D7. A pull request cannot lower its own floor

`proof.minRung` of `.astack/profile.json` sets a floor from R0 to R4.
The gate takes the higher floor of the profile at the diff base and in the tree.
A missing profile gives R0, and a bad floor stops at `rung`.

### D8. Scope `modelRefs` is optional and unread

A scope row can omit `modelRefs`, and the gate reads no name in it.
The key goes when each product repo moves to the per-change manifest of a later block.

### D9. ProofAdmission gets the rung stage, and ProofLadder holds the rung rule

`rung` is a stop stage after `controls`, and its stop names the section "Rungs and models".
A reference stop comes first, so each earlier stop keeps its output.
`formal/ProofAdmission.tla` adds `rung` to its stages and sections, and its claim covers an admission at R4.
A rung variable in that model multiplies its states, so the ladder rule is a separate model.

## Consequences

- Easier: a docs-only change starts no Java process.
- Easier: a change of a session guard runs the SessionGuards model with each manifest model.
- Harder: a new file under a fail-closed glob needs a model glob or an `unmodelled` entry.
- Harder: a registry edit runs each model, approximately 10 s here.
- Risk: an unlisted path outside the fail-closed globs runs at R1, so review of each registry diff must catch it.
- Follow-up: a product manifest keeps a dead `modelRefs` key until its repo moves to the per-change manifest.

## Alternatives considered

- TLC on each change, as ADR 0005 D1 says. Rejected because TLC cannot see a code change.
- A verdict cache by the hash of the model files, the jar and the Java major. Rejected because it saves at most 3.51 s and stores state that an agent can write.
- A `sync` commit for each model in the registry. Rejected because 15 of 20 pull requests then edit the registry and conflict.
- A positive-only run for an unchanged model. Rejected because it adds a second run shape and judge path.
- Globs in the profile. Rejected because a repo can lower them.
- A rung that the author picks. Rejected because the author is the party that the gate checks.
- A schema stop for `modelRefs`. Rejected because it breaks each product gate at its next CLI update.

## Invariant audit

The audit of 2026-11-22 reads `formal/ProofLadder.cfg`. Each row names an invariant or a property other than `TypeOK`.

| Invariant | Class | Action | Controls |
|---|---|---|---|
| `TlcOnlyAtR4` | independent | It joins the `needed` set of `Derive` with the guard of `Start` |  |
| `AdmitNeedsEachTriple` | independent | It joins `Derive`, each `Start` and the guard of `Admit` |  |
| `FailClosedStops` | restates | `Derive` | `rl-fail-closed` |
| `FloorOnlyRaises` | restates | `Derive` | `rl-floor`, `rl-rung` |
| `OneTriplePerModel` | restates | `Start` | `rl-one-run` |
| `ManifestFirst` | restates | `Start` | `rl-select`, `rl-registry-diff` |
| `RegistryRunsAll` | independent | It joins `Selected` of `Derive` with the guard of `Admit` |  |
| `DeletedRegistryStops` | restates | `Derive` | `rl-registry-gone` |
