# ChangeProof contract

`astack check proof` requires `.astack/proof.json` by default.
Pass another manifest path when the repo uses a named candidate contract.
`--base <ref>` must resolve to the manifest's fixed base commit.
The gate admits only a complete current run.
`--summary` prints unverified intent and never a proof success line.

## Required records

| Record | Required content |
|---|---|
| `version`, `change`, `base` | Version 1, a change name, and a full immutable base SHA |
| `scope` | Globs for every live changed path, with criterion and model references |
| `domain` | Context, glossary, aggregate, terms, invariants, effective ADRs, and a spec-drift matrix |
| `category` | Objects, typed arrows, carrier, effects, composition, equality, laws, and a typed witness |
| `abstraction` | Hidden rule, caller facts, deletion test, alternatives, concrete-to-model relations, and omissions |
| `model` | TLA+ module, config, exact project dependency closure, bounds, fairness, invariants, and properties |
| `negative` | One named action, one exact mutation, its defect, and the expected named violation |
| `limits` | Explicit limits of the selected proof |

Unknown fields, duplicate names, unresolved references, and empty required text fail.
Paths stay inside the repo and outside `.git`.
Proof references must resolve directly to regular files, without a symlink in the path.
Scope includes tracked edits, staged edits, deletions, and nonignored untracked files.
A scope row must cover a changed path.
The checker binds current candidate files and model inputs before and after execution.
The manifest never stores its own digest or its containing commit's hash.

## Domain and decisions

Use the affected context's glossary and aggregate symbol.
Each ordinary governing ADR reference must be accepted and contain the cited decision.
Metadata uses `Status: Accepted` or `- **Status:** Accepted · <stamp>`.
Decision headings use `### D<n>. <claim>` or `### D<n> — <claim>`.
Fenced examples and duplicate Status fields cannot provide governing metadata.

### Integrated proposals

An explicit integrated-proposal reference can use a previously ratified Proposed record under an unchanged Accepted process.
It must declare `ratification` with `kind: integrated-proposal`, a `process` file and decision, `integratedAt`, and `proofRecord`.
`integratedAt` must be a full commit identity ancestral to the fixed base.
Historical reads ignore replacement refs and graft ancestry. Missing objects fail without a lazy fetch.
The route requires Git's `--no-lazy-fetch` option and rejects unsupported Git commands.
The governing and process records must be regular UTF-8 files with identical complete bytes in that commit, the base, and the candidate.
Both cited decisions must exist outside fences and have text.

The process must already be Accepted in all three views. Its authority cannot come from another Proposed record.
The separate `proofRecord` supplies the four proof sections and their required links and arrow explanations.
The checker binds those records and actual history facts before and after model execution.
Semantic review must make sure the Accepted process ratifies the selected proposal.
Ancestry establishes integration, not human approval or process meaning.
Without this explicit record, the Accepted-only rule remains unchanged.
New or amended proposals need a separate authorised integration before this route can use them.

The proof record connects the function contract to formal claims, category composition, implementation correspondence, and verification controls.
The ADR explains the claim and its limits.
Models and tests remain executable files linked from that explanation.
Do not copy a transient pass log into an ADR.

The matrix uses [spec-links.md](spec-links.md).
Criterion and control markers come from their source files independently of the links.
Implementation gates run those controls separately.
Link validation is not semantic coverage.

## Category and abstraction

Objects name valid values or artifact contracts.
Arrows reference real functions or document transformations.
Adjacent arrow types must compose.

- `pure` uses ordinary `o` composition and declares no effects.
- `result` fixes an error type and uses `>=>` composition.
- `promise-result` also states observable equality and rejection behavior.
- `artifact` states the preserved artifact contract and uses ordinary composition.

For `o`, `[g, f]` means that `f` runs first.
For `>=>`, `[f, g]` means that `f` runs first.
Reassociation never permits a change in effect order.

Record all eight law statuses.
Composed arrows need left identity, right identity, and associativity witnesses.
A Result or Promise<Result> monad claim needs all three monad witnesses.
A functor claim needs both identity and composition witnesses.
Pure and artifact records state why monad laws do not apply.
An inapplicable law cannot replace an applicable witness.
Witnesses name checked model properties or linked implementation controls.
The typed witness mentions the real arrow symbols and belongs in the repo's normal compiler or document checks.

Each abstraction explains what callers must know and what the module hides.
Its relation maps concrete functions or contracts to model actions.
Its deletion test rejects a layer that adds no useful domain rule.
These declarations require semantic review.
The checker cannot infer their truth from names alone.

## TLC execution

The runner pins `tla2tools.jar` release 1.7.4 and verifies its SHA-256 on every use.
The pin was computed from the official release asset after its published SHA-1 was checked.
Java 17 or later is required.
The runner downloads only the pinned jar into the astack cache when it is absent.
A cached digest mismatch fails.

`ASTACK_TLC_JAR` can name a verified jar outside the checkout.
`ASTACK_PROOF_TIMEOUT_MS` can lower the 60000 ms policy cap.
It cannot raise that cap.
Model states and mutations use owned temporary directories.
The child process receives no JVM option or TLA library overrides.

Use one worker, a fixed seed, and complete model checking.
The supported config contains `SPECIFICATION`, invariants, properties, and literal constants.
Pruning, simulation, recovery, Java overrides, and unsupported directives fail.
Project modules must form the declared dependency closure.
Unsafe runtime and I/O modules fail.

A positive result needs complete success, statistics, finish, and temporal records when applicable.
It needs positive distinct-state counts and zero queued states.
Warnings and errors fail.

The negative control changes one action in a temporary copy.
It cannot change Init, the specification, an invariant, or a property definition.
The original text must match exactly once in that action.
Deleting a guard is permitted.
An invariant control needs the exact named violation and a counterexample.
A temporal control needs exactly one configured property.
Syntax errors, deadlocks, unrelated violations, and unchanged passing models do not count.
The unchanged positive model must pass again with matching state counts.

## Admission result

Exit 0 and `ok: proof ` identify an admitted current proof.
Missing or invalid evidence and execution failures block delivery.
Invalid arguments or schema use exit 2.
Read the reported rejection stage before choosing the next action.
An old CLI without this command cannot satisfy the gate.

Model checking establishes the selected finite model claims under their assumptions.
Existing gates and semantic review establish separate implementation evidence.
Repository records cannot guarantee a model's private reasoning.
