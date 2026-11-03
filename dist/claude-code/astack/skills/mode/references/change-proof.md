# Required change proof

Every code, configuration, docs, hotfix, review fix, and migration change requires a ChangeProof.
Read-only questions have no delivery change to prove.
The same contract applies to quick work and full plans.
A profile flag or minimal hook preset cannot disable it.

## Domain first

Read the affected glossary and context map.
Use the domain's terms in names and interfaces.
Name the affected contexts, aggregate ownership, invariants, and effective decisions.
Create missing domain definitions before implementation.
Keep the glossary free of progress and generic programming definitions.
Record a changed architectural choice in a new ADR.
Preserve superseded decisions and their reasons.

## One contract

Create `.astack/proof.json` with the [proof contract](../../pr-review-hardening/references/proof-contract.md).
It links changed paths, criteria, domain references, composition, abstraction, models, and controls.
Every changed path needs an obligation and a model relation.
Use a change-specific model or an explicit preservation relation.
For docs, model the changed procedure or selected contract data.
An unrelated example never satisfies the requirement.

Before implementation, state these facts in the internal brief:

- Domain context, aggregate, terms, and invariants.
- Objects and typed arrows that model the actual contract.
- Identity, composition, effects, equality, applicable laws, and witnesses.
- The hidden rule, caller facts, abstraction relation, alternatives, and deletion test.
- Governing ADR decisions with their formal and category explanations.
- TLA+ obligations, bounds, assumptions, fairness, negative control, and implementation controls.

This is an inspectable contract, not a private reasoning transcript.
Keep production names in the domain language.
Category notation belongs in the internal record, ADR, model, and law evidence.
Do not add a runtime FP framework or another layer to repeat the notation.

## Internal messages

Use `astack check proof --summary` to print the shared intent record.
Give each code delegate that record, its scope, and the permitted effects.
The summary is explicitly unverified.
It cannot satisfy a gate.

Each handoff cites the same record and governing ADR decisions.
It states the current input digest, commands, outcomes, and unfinished obligations.
A safe pause can report incomplete proof.
A delivery claim cannot.
Keep user-facing progress short and in plain language.

## Execute before delivery

Run the existing implementation and document gates.
Run `astack check proof` on the candidate inputs.
Require exit 0 and a final line that starts with `ok: proof `.
The checker runs the positive model, named negative control, and unchanged positive model.
It rejects unsupported inputs, wrong violations, incomplete runs, warnings, stale inputs, and cleanup failures.
A saved receipt never replaces execution.

Run it again after any change to candidate inputs.
Keep its states and temporary copies outside the checkout.
Keep the existing tests, static checks, removal controls, review cap, and owner gates.
A model result does not establish implementation correspondence.
Semantic review still checks domain meaning, abstraction suitability, and the model relation.

## Missing adoption

An old CLI, missing model, absent witness, or missing tool blocks delivery.
Prepare the required artifacts and tooling inside the authorized scope.
Do not report a clean stop while a required obligation is missing.
Do not reset a ledger or growth baseline to start again.
The repo's adoption PR must add required CI and its matching companion gate.
Keep an existing CI-pin stop visible until an authorized installation transition resolves it.
