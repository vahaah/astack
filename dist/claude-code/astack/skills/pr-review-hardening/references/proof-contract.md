# ChangeProof contract

`astack check proof` requires `.astack/proof.json` by default.
Pass another manifest path when the repo uses a named candidate contract.
The gate admits only a complete current run.
`--summary` prints unverified intent and never a proof success line.

## Base

The manifest `base` is a fixed commit. Ratification history stays bound to it.
Without `--base`, the diff base is the manifest base. It must be an ancestor of HEAD.
With `--base <ref>`, the diff base is the merge base of the ref and HEAD.
The manifest base must be an ancestor of that merge base. Otherwise the gate stops and names both commits.

The checker binds current candidate files and model inputs before and after execution.
The scope check and both input snapshots read from the diff base, so a file that only the base branch changed stays out of scope.
The receipt prints the manifest base and the diff base.
Do not change the manifest base after a merge or a rebase of the base branch.

A CI run passes `--base`. A pull request run uses the base branch of the PR.
A push to the default branch and a release use the first parent of HEAD.
A branch push whose HEAD the default branch holds also uses the first parent of HEAD. An example is a new branch at the tip of the default branch.
A push to another branch uses the default branch.

A local run with `--base HEAD` has an empty diff, so it stops.
Each base read and each diff read ignores replacement refs and graft ancestry, with Git's `--no-lazy-fetch` option.

## Required records

| Record | Keys of [proof-example.json](proof-example.json) |
|---|---|
| `version`, `change`, `base` | `1`, a name and a full base SHA. [Base](#base) |
| `scope` | `[{path, obligation, modelRefs}]`. Rows cover each tracked, staged, deleted and nonignored untracked change, and no row is idle |
| `domain` | `context`, `glossary`, `aggregate {path, symbol}`, `terms`, `invariants [{name, modelRef}]`, `adrs [{file, decision}]` and `controls {matrix, criteria}`. [Domain and decisions](#domain-and-decisions) |
| `category` | `carrier`, `objects [{name, link {path, symbol}}]`, `arrows [{name, from, to, link, effects}]`, `composites [{arrows, op}]`, `equality`, `laws [{law, status, witness, reason}]` and `typedWitness`. [Category and abstraction](#category-and-abstraction) |
| `abstraction` | `hides`, `callersKnow`, `deletionTest`, `alternatives [{name, rejectedBecause}]`, `relation [{concrete {path, symbol}, modelAction}]` and `omitted`. [Category and abstraction](#category-and-abstraction) |
| `model` | `module`, `config`, `dependencies`, `bounds`, `fairness`, `invariants` and `properties`. [TLC execution](#tlc-execution) |
| `negative` | `file`, `action`, `original`, `replacement`, `defect` and `expect {kind, name}`. [TLC execution](#tlc-execution) |
| `limits` | Proof limits |

Unknown fields, duplicate names, unresolved references, and empty text fail.
Paths stay inside the repo and outside `.git`.
A proof reference is a regular file with no symlink in its path.
The manifest never stores its own digest or commit hash.

The matrix uses [spec-links.md](spec-links.md).
Criterion and control markers come from their source files independently of the links.
Implementation gates run those controls separately.
Link validation is not semantic coverage.

## Domain and decisions

Use the affected context's glossary and aggregate symbol.
`domain.context` must be the exact text of a glossary heading.
Each term must be the exact text of a heading or of a bold span, such as `**Order**:`.
Plain text in a table cell does not define a term.
[GLOSSARY-FORMAT.md](../../domain-modeling/GLOSSARY-FORMAT.md) gives the glossary format.

Each ordinary governing ADR reference must be accepted and contain the cited decision.
Metadata uses `Status: Accepted` or `- **Status:** Accepted · <stamp>`.
Decision headings use `### D<n>. <claim>` or `### D<n> — <claim>`.
Fenced examples and duplicate Status fields cannot provide governing metadata.

An ordinary governing ADR also holds the four proof sections under `###` to `######` headings.
They are `Formal claim`, `Category composition`, `Implementation correspondence` and `Verification`.
[adr.md](../../write-docs/references/adr.md#integrate-a-governing-proof-adr) gives the content of each section.

### Integrated proposals

An explicit integrated-proposal reference can use a previously ratified Proposed record under an unchanged Accepted process.
It must declare `ratification` with `kind: integrated-proposal`, a `process` file and decision, `integratedAt`, and `proofRecord`.
`integratedAt` must be a full commit identity ancestral to the fixed base.
Historical reads ignore replacement refs and graft ancestry. Missing objects fail without a lazy fetch.
The route requires Git's `--no-lazy-fetch` option and rejects unsupported Git commands.
Both records must be regular UTF-8 files in that commit, the base, and the candidate.
By default, their complete bytes must match across those views.
Both cited decisions must exist outside fences and have text.

The checker also reads both records at the merge base when `--base` gives one.
The base branch can change the authority of a record after the manifest base. Then the gate stops.
The stop names the record, the manifest base and the merge base.
A change of only the selected Landed value does not stop.

To repair, set `base` to the merge base.
Set `integratedAt` to a commit that holds the new text.
Examine the change against that text, and then run the proof again.

The process must already be Accepted in all three views. Its authority cannot come from another Proposed record.
The separate `proofRecord` supplies the four proof sections and their required links and arrow explanations.
The checker binds those records and actual history facts before and after model execution.
Semantic review must make sure the Accepted process ratifies the selected proposal.
Ancestry establishes integration, not human approval or process meaning.
Without this explicit record, the Accepted-only rule remains unchanged.
New or amended proposals need a separate authorised integration before this route can use them.

The optional `governingMetadata: "landed-header-value"` selects one narrow lifecycle exception for the governing record.
Each view must contain one unambiguous existing top-level Landed header.
Only its nonblank single-line value can differ. Every byte outside that value remains protected.
The Accepted process remains completely byte-identical and must authorize that lifecycle duty.
Semantic review must check the landing statement's truth. This option never changes status or decision authority.
The supported flat preamble accepts plain `Landed: value` and zero-indent `- **Landed:** value` forms.
Fenced, nested, repeated, missing, multiline, or ambiguous headers fail even when unchanged.
The selected value cannot introduce HTML, fences, control characters, line separators, or a Markdown continuation.
Raw input freshness remains mandatory. A value change during model execution is still stale.

The proof record connects the function contract to formal claims, category composition, implementation correspondence, and verification controls.
The ADR explains the claim and its limits.
Models and tests remain executable files linked from that explanation.
Do not copy a transient pass log into an ADR.

## Category and abstraction

Objects name valid values or artifact contracts.
Arrows reference real functions or document transformations.
Adjacent arrow types must compose.

- `carrier {kind: pure}` uses ordinary `o` composition and declares no effects.
- `carrier {kind: result, error}` fixes the error type and uses `>=>` composition.
- `carrier {kind: promise-result, error, observation, rejection}` also states observable equality and rejection behavior.
- `carrier {kind: artifact, contract}` states the preserved artifact contract and uses ordinary composition.

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
Java 17 or later is required.
The runner downloads only the pinned jar into the astack cache when it is absent.

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
