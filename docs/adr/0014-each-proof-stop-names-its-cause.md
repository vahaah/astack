# 0014. Each proof stop names its cause and the rule section of its stage

Status: Accepted
Date: 2026-11-22
Ticket: none
Supersedes: none

## Context

`astack check proof` stopped with a stage and a short message, and an agent often had to read the bundled CLI to find the cause.
`parseTlcRecords` split TLC output on a line feed only, so a copy with CR LF line ends gave 0 records.
It also dropped each line outside a record, so a SANY parse error stopped with only `exited 150 with error 3002`.

A broken invariant stopped with its exit code and error codes, and the negative line printed only a state count.
The state count also counted the loop back record of a temporal trace as a state.
`snapshot` hashed each candidate entry into one digest, so the stale stop printed only two digests.
A run past the deadline dropped its stdout, so the stop could not tell how far TLC got.

## Decisions

### D1. A model stop names its cause

The TLC reader splits lines on CR LF or LF and keeps the text outside records.
A 3002 stop names the module, the first SANY line and column and its message line.

A failed run names its invariant or temporal property and prints each state record as a numbered step.
A loop back step names its state. The trace shows at most 20 steps, each cut at 200 characters, then a count of the rest.
A run past the deadline keeps its stdout. The stop gives the distinct state count and the time of the last complete progress record.

#### Formal claim

`formal/ProofAdmission.tla` adds the inputs that change during the runs, the inputs that a stale stop names and the section that each stop names.
`formal/ProofAdmission.cfg` holds the new invariants with the earlier ones.
`StaleStopNamesPaths` states that a stale stop names each changed input, and at least one.
`StopNamesSection` states that each stop names the proof contract section of its failed stage.
The model takes the TLC output and the Git reads as true. It does not model TLC or Git.

#### Category composition

`judgePositive` maps a `RunEnd` to `Counts` or a refusal text.
`judgeNegative` maps a `RunEnd` to a `Violation` with its trace, or a refusal text.
Both judges call `parseTlcRecords`, which maps TLC text to its records and the lines outside them.

`snapshot` maps the changed paths of a candidate to a `Snapshot` with one line for each entry.
`admitChangeProof` maps `AdmissionFacts` to `Admitted` or a `Rejection`, and `staleInputs` names the entries that differ.
`prove` in `src/astack/cli/commands/check/proof.ts` calls them in that order and stops at the first refusal. That file is the typed witness.
This change adds no composition operator, map, functor or monad.

#### Implementation correspondence

| Model concept | Concrete contract |
|---|---|
| `changed` | `snapshot` keeps the hash of the index, the hash of the ratification history and the line of each entry |
| `named` | `staleInputs` returns each entry that differs, and `admitChangeProof` prints at most 10 and a count of the rest |
| `section` | `stop` in `proof.ts` writes the `STAGE_SECTIONS` heading of the stage to stderr |
| `RejectPositive` | `judgePositive` names the broken claim, the SANY location or the last progress record |

These links describe the abstraction relation.
They do not establish refinement of all TypeScript behavior.

#### Verification

`.astack/proof-coverage.json` links CP-17 to CP-21 of `docs/reference/change-proof-contract.md` to executable controls.
The TLC fixtures in `tests/fixtures/tlc/` are real runs of the pinned tla2tools 1.7.4 with synthetic paths.
The CLI controls use real temporary Git repositories that change the index or a file mode during the runs.
The named mutation removes the changed inputs from the stale stop in `RejectEvidence`, and it must violate `StaleStopNamesPaths`.
The restored model must give the same positive counts.

### D2. A stale stop names each changed input

`astack check proof` still binds each candidate file, as ADR 0005 D3 says.
The stale stop names each changed path, at most 10 and a count of the rest.
It names the index or the ratification history when one of them changed.

### D3. Each stop names the proof contract section of its stage

Each stop writes one stderr line with the section of `proof-contract.md` that holds the rule of its stage.
The line names the file through `astack skill-path`, because a package install of the CLI holds no skill files.
The stdout stop line stays the same, because scripts read the last stdout line.

## Consequences

An agent can repair most proof stops from the stop output alone.
A stale stop tells the agent which file changed, so the agent can stop a dev server or restore a gate rewrite.
Each new stage needs a heading in `STAGE_SECTIONS`, and a test fails when the heading is missing.
The negative line is longer, because it prints the trace of the counterexample.

## Alternatives considered

- A new `--explain` flag. Rejected because it only repeats the reference.
- Leave gate rewrite paths out of the digest. Rejected because it goes against ADR 0005 D3.
- A second stdout line for the section. Rejected because it changes 28 pinned stop lines.
- Print only the state count of a trace. Rejected because the agent cannot see the path to the broken claim.
