# Required formal models

Every change workflow requires a change-specific TLA+ contract and current execution evidence.
This includes code, docs, configuration, hotfixes, review fixes, and migration changes.
Read-only questions have no delivery change to prove.
Use the [ChangeProof contract](../../pr-review-hardening/references/proof-contract.md).

## Define the domain contract

Name the affected contexts, aggregate ownership, terms, invariants, and current ADR decisions.
State the changed procedure, transition, or selected contract data.
Map concrete functions and document transformations to model actions.
State the abstraction relation and excluded behavior.
An unrelated stock model never satisfies the obligation.

## Define lawful composition

Name objects, typed arrows, identity, composition, effects, equality, and law witnesses.
Use plain composition for pure total work.
Use the declared error carrier for Result composition.
Record rejection and observation policies for async effects.
Do not call every function a monad.
Keep domain names in production interfaces.

The governing ADR includes the function contract, formal claim, category explanation, correspondence, and control links.
Executable models and tests stay in their own files.
A proof sketch does not replace current checker execution.

## Run the required gate

Run `astack check proof` before delivery.
Require exit 0 and a final line that starts with `ok: proof `.
The checker runs positive, named negative, and unchanged positive models on current inputs.
It binds the model, configuration, dependencies, and candidate source.
Missing tools, unsupported inputs, incomplete runs, wrong violations, or stale inputs fail.
Keep model state and temporary mutations outside the checkout.

## Keep the claims separate

State finite bounds, assumptions, and fairness.
Add progress properties when the change claims progress.
The model result establishes only its selected claims under those limits.
Run implementation and document controls through the existing gates.
Use removal controls for critical behavior.
Semantic review still checks meaning and correspondence.
Repository records do not establish private model reasoning.
