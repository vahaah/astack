# CI proof-record classification

The CI classifier distinguishes required proof metadata from product source changes.
It grants a review mode. It does not grant proof success, a clean stop, or merge authority.
ADR 0005 D4 governs coordinated adoption and preserves review and CI authority.
ADR 0005 D3 keeps fresh model execution mandatory.

### Formal claim

[criterion:ci-proof-records] Classify only CI changes with unchanged tool setups and narrowly checked current proof records.
The default manifest must parse completely and name the actual merge base.
Its committed proof records must be regular UTF-8 Markdown files under `formal/`.
They must contain the four required proof sections and valid references.
The records cannot also serve authority, implementation, witness, glossary, matrix, listed source, or model roles.
The classifier reads the committed matrix and refuses missing or malformed data.
Changed source, models, controls, arbitrary docs, and tool versions remain blocked.

`formal/CiProofRecords.tla` models this classification under `formal/CiProofRecords.cfg`.
`CiRecordsSafe` states that every `ci_proof` result has eligible inputs.
`CurrentProofRequired` states that delivery still requires independent current proof.
`delivery` means only that these two prerequisites hold. Other review and merge checks remain outside the model.
The finite cases include four diff classes and seven record checks, with one invalid record check at a time.
Tool equality, base movement, and proof success each have two values.
The safety model claims no fairness, progress, eventual CI success, or full implementation refinement.

### Category composition

`ciProofRecords` has one pure arrow over a parsed ChangeProof, fixed base, and committed file observations.
Its result is either permitted metadata paths or a refusal.
Structural equality compares those paths or the refusal reason.
The CLI edge reads Git objects and composes the result with its existing CI and tool checks.
No custom composition operator, map, functor, or monad is introduced.
The eight law declarations are inapplicable to this single-arrow change.
Typed CLI controls call the actual parser and classifier under the normal TypeScript check.

### Implementation correspondence

The committed manifest parser supplies the model's `schema` and `base` observations.
Strict Git blob reads supply `regular` and `utf8`.
The shared proof-record validator supplies `sections`.
The role inventory supplies `roles`, and the restricted path rule supplies `path`.
The changed path partition supplies `kind`.
Existing setup comparisons and moved-base checks supply `tools` and `movedBase`.
`Classify` represents the metadata admission rule within the existing CI classification.
`CheckProof` represents the independently required proof gate, including its named negative and restored run.
The model assumes these observations are truthful. CLI controls and review establish that correspondence separately.
Deleting this helper would repeat the same proof metadata policy inside the CLI's Git effects.

### Verification

.astack/ci-proof-records-coverage.json links the criterion and executable control.
Run the focused CLI controls against real temporary Git repositories.
The three-file case must fail before the repair and enter `ci_proof` afterward.
Source edits, role collisions, malformed records, false bases, invalid bytes, unsafe modes, and changed tools must stop.
Working-tree edits cannot replace committed evidence.
Run the existing CI pin suites to retain their refusal and moved-base behavior.

The named mutation drops the role separation check during `Classify`.
It must violate `CiRecordsSafe` with a counterexample.
The unchanged positive run must pass again with matching counts.
No static classification result can replace current proof or exact-head hosted CI.
