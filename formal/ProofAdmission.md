# ChangeProof admission

This record holds the proof sections of the admission gate.
[ADR 0005](../docs/adr/0005-every-change-carries-domain-and-formal-proof.md) D3 governs fresh model execution, and its sections moved here on 2026-11-22.
[ADR 0006](../docs/adr/0006-internal-composition-records-follow-domain-effects.md) D2 keeps its own law sections.

### Formal claim

`admitChangeProof` owns admission for a parsed ChangeProof and fixed AdmissionFacts.
Let `P`, `N`, and `R` denote judged positive, named negative, and restored-positive evidence.
Let `I0` and `I1` denote the candidate snapshots before and after execution.

```tla
Admitted => DomainValid and CategoryValid and ControlsValid
         and P = Complete and N = ExpectedViolation and R = Complete
         and States(P) = States(R)
         and Head(I0) = Head(I1) and Digest(I0) = Digest(I1)
```

The [admission model](ProofAdmission.tla), `formal/ProofAdmission.tla`, holds `AdmitSafe` and `FailureIsTerminal`.
TLC also examines progress under weak fairness of `Next` with the [configuration](ProofAdmission.cfg).
The finite model has six validation stages and bounded evidence outcome classes.
It abstracts validator internals and treats judged tool evidence as inputs.

The base observation holds one of seven manifest observations: one, fallback, several, none, merged, held and beside.
`OneManifestPerChange` states that an admitted proof read one manifest.

Several, none and merged stop at schema. Held and beside stop at base.
Only a run with `--base` can observe none or merged.
An ordinary governing reference needs no proof record. A ratified reference needs its proof record.

### Category composition

`ciProofRecords` also maps a parsed ChangeProof to permitted paths or a refusal, with fixed base and committed file observations.
It adds no composition operator.

The pure arrows use a fixed error type `Rejection`.

```data
parseChangeProof : Text -> Result<ChangeProof, Rejection>
admitForFacts    : ChangeProof -> Result<Admitted, Rejection>
admitForFacts(p) = admitChangeProof(p, fixedFacts)
candidate       = parseChangeProof >=> admitForFacts
```

`>=>` preserves a failed parse and calls admission only for a parsed value.
[ADR 0017](../docs/adr/0017-law-claims-run-on-code.md) D1 gives its laws, and the `result-monad-laws` control examines them on code.

Tool execution stays in the I/O edge.
The declared order is the judge order positive, negative, restored, as in `ProofAdmission`.
`astack check proof` starts the three TLC runs together with `runModel`.
It reads each end with `ended` and judges the runs in that order with `judgePositive` and `judgeNegative`.
A stop in that order kills the live runs and removes their temp roots.
The notation does not add a runtime monad wrapper.

### Implementation correspondence

| Model concept | Concrete contract |
|---|---|
| Validation stages | `parseChangeProof` and `checkReferences` reject missing domain, category, and control evidence |
| `manifest` | `chooseManifest` gives one, fallback, several, none or merged, and `staleManifests` gives held or beside |
| `RunPositive` | `judgePositive` requires complete checked-state evidence |
| `RunNegative` | `judgeNegative` requires the named violation and a counterexample |
| `RunRestored` | `admitChangeProof` requires the restored run and matching state counts |
| `current` | `admitChangeProof` compares candidate heads and input digests |
| `Admit` | A successful admission produces the typed receipt |

These links describe the abstraction relation.
They do not establish refinement of all TypeScript behavior.
`snapshot` binds the bytes of each file, the staged index, and the Git mode of each regular file.

Initialized submodules apply the same rules to their HEAD, index, and files, including nested submodules.
An empty uninitialized submodule binds its gitlink and empty state.
A populated submodule without a readable checkout blocks admission.
The model's `InputChange` represents a change to any of those inputs.

Let `D(R)` denote the digest of the index and recorded worktree entries of repository `R`.
Git path records must be valid UTF-8.
Link targets use base64 so their bytes cannot insert entry delimiters.
Each entry separates its path with NUL and ends its metadata with a line break.

For a child checkout `C`, its parent entry records `(Head(C), D(C))`.
Each initialized child uses the same rule.
Under the no-collision assumption, equal snapshots preserve the recorded data at every finite depth.
The finite model abstracts this structure as `current`.
The [admission implementation](../src/astack/change-proof/admission.ts) remains subject to its executable controls.

### Verification

The [CI record contract](ci-proof-records.md) defines the narrow metadata classification.
`formal/CiProofRecords.tla` and `formal/CiProofRecords.cfg` check `CiRecordsSafe` and `CurrentProofRequired`.
`.astack/ci-proof-records-coverage.json` binds its executable CLI controls.

[The proof matrix](../.astack/proof-coverage.json) links the contract to implementation controls.
The registry negative of the model in `formal/models.json` must give its named violation.
A parse error or another violation does not satisfy that obligation.
The unchanged positive model must pass again.
Current results belong to CI and proof receipts, so this record does not copy a transient pass result.

`bun run check` runs the proof once, after the lint, type, build and scan gates and before the suite.
`bun run test` runs only the suite.
