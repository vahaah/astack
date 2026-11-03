# Mandatory TLA+ and trustworthy execution

## What does a TLC result establish?

### Takeaway

TLC evaluates the selected finite model against the configured properties.
A completed run does not establish that executable code implements that model.
[Lamport and others, section 2.2](https://lamport.org/pubs/spec-and-verifying.pdf), [AWS, pages 72-73](https://cdn.amazon.science/67/f9/92733d574c11ba1a11bd08bfb8ae/how-amazon-web-services-uses-formal-methods.pdf)

### Cited findings

- TLC explores reachable states of a finite instance. Its configuration supplies that instance. Random simulation is a separate mode.
  [Lamport and others, section 2.2, pages 1-2](https://lamport.org/pubs/spec-and-verifying.pdf)
- TLC checks safety and liveness properties. A safety counterexample contains a finite trace. Liveness checks also examine cycles.
  [Lamport and others, section 2.2](https://lamport.org/pubs/spec-and-verifying.pdf)
- Weak fairness requires an action eventually to occur when it remains enabled. Strong fairness also covers repeated enablement with interruptions.
  [Specifying Systems, section 8.6, printed page 106](https://lamport.azurewebsites.net/tla/book-02-02-27.pdf#page=122)
- Lamport defines implementation through implication between behavior specifications. A refinement mapping relates the variables of the two specifications.
  [Specifying Systems, section 5.8, printed pages 62-64](https://lamport.azurewebsites.net/tla/book-02-02-27.pdf#page=78)
- TLC stores state fingerprints. A collision can omit reachable states. TLC reports estimates for fingerprint collisions.
  [Specifying Systems, section 14.3.3, printed page 244](https://lamport.azurewebsites.net/tla/book-02-02-27.pdf#page=260)
- AWS reports that checked designs do not establish code correspondence. Its engineers retain code checks and use model invariants to improve assertions.
  [AWS, "Most Frequently Asked Question", pages 72-73](https://cdn.amazon.science/67/f9/92733d574c11ba1a11bd08bfb8ae/how-amazon-web-services-uses-formal-methods.pdf#page=7)

### Inferences

When TLC completes without errors, report this result.
"The pinned checker completed this finite model. It found no violation of the named properties under the stated assumptions."
Keep the model bounds, assumptions, fairness, and collision estimates beside the result.
The source basis is the distinction between finite instances, specification refinement, and code correspondence above.

Use separate evidence for each claim:

| Claim | Evidence | Limit |
| --- | --- | --- |
| These bytes were checked | Input hashes and fresh process records | Hashes do not establish meaning |
| These model properties passed | Completed TLC run | Applies to the checked finite model |
| The model represents this change | Reviewed mapping from obligations to states and actions | Requires engineering judgment |
| Implementation behavior follows the model | Tests through public seams, assertions, or an explicit refinement argument | Example tests are not a general refinement proof |
| Every change route requires evidence | Required CI check and checks at workflow exits | Does not expose private reasoning |
| The design works outside the bounds | A separate proof or justified abstraction argument | A larger finite run alone does not prove this |

Treat this table as an evidence policy proposal.
The cited sources establish the boundaries, not this astack policy.

### Gaps

No source establishes that notation, a model file, or a TLC pass guarantees a complete statement of requirements.
No reviewed source supports an automatic semantic coverage score for arbitrary code or prose.
This note checks sources and local text only.
It does not execute TLC or validate a runner.

## How can every change workflow require relevant TLA+ evidence?

### Takeaway

Require a `ChangeProof` for every change workflow, including documentation and configuration changes.
Require a model that represents the current change or its explicit preservation obligation.
This requirement comes from the assignment.
Its technical boundary follows from specification refinement and code correspondence.
[Specifying Systems, section 5.8](https://lamport.azurewebsites.net/tla/book-02-02-27.pdf#page=78), [AWS, pages 72-73](https://cdn.amazon.science/67/f9/92733d574c11ba1a11bd08bfb8ae/how-amazon-web-services-uses-formal-methods.pdf#page=7)

### Cited findings

- AWS describes an incremental process that refines parts of prose designs into PlusCal or TLA+.
  It also describes data models with semantic invariants.
  [AWS, page 72](https://cdn.amazon.science/67/f9/92733d574c11ba1a11bd08bfb8ae/how-amazon-web-services-uses-formal-methods.pdf#page=7)
- TLC processes the configured invariant and property names.
  Defining an operator in a module does not select that operator as a checked property.
  [SpecProcessor.java, `processConfig` and `processConfigInvariants`](https://github.com/tlaplus/tlaplus/blob/5a47802b5c391f59ecdd44117981f4ff8c0656ba/tlatools/org.lamport.tlatools/src/tlc2/tool/impl/SpecProcessor.java)
- The current local runbook makes models optional unless the repo requires them.
  Its example represents a bounded retry process.
  [Local runbook](../../docs/runbooks/formal-models.md), [local module](../../examples/formal/RetryBudget.tla), [local configuration](../../examples/formal/RetryBudget.cfg)

### Inferences

Adopt the required `ChangeProof` design.
The following list proposes policy.

Each proof needs these fields:

- The changed obligations and affected public or artifact behavior.
- The model module, configuration, dependency closure, and input hashes.
- The finite bounds and the excluded behavior.
- The configured domain invariants and any temporal properties.
- The mapping from obligations to model actions, properties, and implementation tests.
- The positive run and the exact expected negative control.
- The assumptions, fairness claims, and correspondence limits.

Use a domain invariant in addition to a type invariant.
Require a temporal property when the change claims progress.
Do not add artificial liveness claims to a static preservation check.
These requirements address the configured-property boundary in `SpecProcessor`.

Use these models for different change classes:

| Change | Relevant model obligation | Required correspondence evidence |
| --- | --- | --- |
| Domain behavior | Permitted transitions preserve the named business rule | Map modeled actions to public operations and behavior tests |
| Configuration | Parsed configuration states admit only permitted combinations | Bind current parsed inputs and test the real parser |
| Normative documentation | Defined rule transitions preserve the stated obligations | Review the extracted rules against the changed text |
| Editorial documentation | A before/after transformation preserves selected stable contract data | Bind both extracted inputs and test the extractor |

An editorial check establishes preservation of the selected data only.
It does not establish equivalence of all natural-language meaning.
If you cannot state an adequate obligation, keep the change incomplete.
Do not create a documentation exemption.

Reuse an existing model only when the correspondence review covers the current change.
Run it with current inputs and the full dependency closure.
A fresh retry example cannot establish evidence for unrelated `ChangeProof` admission rules.

For astack's own change, model the actual `ChangeProof` states and admission rules.
Include missing fields, stale inputs, wrong violations, interrupted runs, valid evidence, and rejection paths.
Require that readiness implies every admission condition.
Test the real admission function against representative accepted and rejected inputs.
The self-model does not establish the correctness of subprocess control or output parsing.

The alternatives have these trade-offs:

| Design | Benefit | Defect or cost |
| --- | --- | --- |
| Required change-specific model and correspondence | Meets the requested universal requirement | Needs review judgment and bounded modeling effort |
| Required stock workflow model only | Small fixed execution cost | Cannot establish the changed domain or artifact obligation |
| Optional models for selected changes | Reduces model work | Conflicts with the requested universal requirement |
| Full code refinement for each change | Stronger correspondence argument | Requires proof machinery and a larger implementation scope |

### Gaps

This research does not measure the cost to write models across all change classes.
The cited industrial experience covers selected systems, not a universal all-change policy.
The runner can enforce artifact presence and execution controls.
Review must judge relevance, abstraction choices, assumptions, and correspondence.

## What is a small fail-closed TLC runner contract?

### Takeaway

Use one trusted runner with fixed arguments, a pinned checker digest, isolated temporary copies, and explicit result classification.
Require the intended property violation in the negative control.
The source facts below support the proposed controls.

### Cited findings

- The documentation of the tools requires Java 11 or later.
  [TLA+ tools README, "Use"](https://github.com/tlaplus/tlaplus/blob/master/README.md#use)
- The SHA-1 checksum of `tla2tools.jar` is `bee4a54f3ee3d4afc347c3240ec2d9e93b075104` in release `v1.7.4`.
  Its release metadata supplies no SHA-256 digest.
  [Release checksums](https://github.com/tlaplus/tlaplus/releases/tag/v1.7.4), [release API, jar asset `digest`](https://api.github.com/repos/tlaplus/tlaplus/releases/tags/v1.7.4)
- That release fixes a defect in liveness analysis with more than one worker.
  [Release changelog](https://github.com/tlaplus/tlaplus/releases/tag/v1.7.4)
- The CLI selects the execution mode, metadata directory, and worker count.
  A run without recovery starts fresh.
  [Current tools, "Command-Line Options"](https://github.com/tlaplus/tlaplus/blob/master/general/docs/current-tools.md), [pinned `TLC.handleParameters`](https://github.com/tlaplus/tlaplus/blob/5a47802b5c391f59ecdd44117981f4ff8c0656ba/tlatools/org.lamport.tlatools/src/tlc2/TLC.java)
- Tool records use `@!@!@STARTMSG <code>:<class> @!@!@` and `@!@!@ENDMSG <code> @!@!@`.
  [MP.java, `getMessage`, `STARTMSG`, and `ENDMSG`](https://github.com/tlaplus/tlaplus/blob/5a47802b5c391f59ecdd44117981f4ff8c0656ba/tlatools/org.lamport.tlatools/src/tlc2/output/MP.java)
- The pinned codes include model-check mode `2187`, success `2193`, final statistics `2199`, and finished `2186`.
  [EC.java, `TLC_MODE_MC`, `TLC_SUCCESS`, `TLC_STATS`, and `TLC_FINISHED`](https://github.com/tlaplus/tlaplus/blob/5a47802b5c391f59ecdd44117981f4ff8c0656ba/tlatools/org.lamport.tlatools/src/tlc2/output/EC.java)
- Safety violations map to exit `12`. Temporal violations map to exit `13`.
  Parser, evaluator, assumption, deadlock, and assertion failures have other classifications.
  [EC.java, `ExitStatus.errorConstantToExitStatus`](https://github.com/tlaplus/tlaplus/blob/5a47802b5c391f59ecdd44117981f4ff8c0656ba/tlatools/org.lamport.tlatools/src/tlc2/output/EC.java)
- Invariant diagnostics `2107` and `2110` include the invariant name.
  Temporal diagnostic `2116` does not name the violated property.
  [MP.java, invariant and temporal violation cases](https://github.com/tlaplus/tlaplus/blob/5a47802b5c391f59ecdd44117981f4ff8c0656ba/tlatools/org.lamport.tlatools/src/tlc2/output/MP.java)
- Final statistics include generated states, distinct states, and queued states.
  The finished message also occurs through finalization after a failure.
  [ModelChecker.java, `printSummary`](https://github.com/tlaplus/tlaplus/blob/5a47802b5c391f59ecdd44117981f4ff8c0656ba/tlatools/org.lamport.tlatools/src/tlc2/tool/ModelChecker.java), [TLC.java, `process`](https://github.com/tlaplus/tlaplus/blob/5a47802b5c391f59ecdd44117981f4ff8c0656ba/tlatools/org.lamport.tlatools/src/tlc2/TLC.java)
- The cleanup option deletes the state root before execution when recovery is absent.
  [TLC.java, `cleanup` branch](https://github.com/tlaplus/tlaplus/blob/5a47802b5c391f59ecdd44117981f4ff8c0656ba/tlatools/org.lamport.tlatools/src/tlc2/TLC.java)
- TLC can load Java overrides through the module resolver.
  `TLCSet` can terminate a run.
  [TLAClass.java, `loadClass`](https://github.com/tlaplus/tlaplus/blob/5a47802b5c391f59ecdd44117981f4ff8c0656ba/tlatools/org.lamport.tlatools/src/tlc2/tool/impl/TLAClass.java), [current tools, `TLCGet` and `TLCSet`](https://github.com/tlaplus/tlaplus/blob/master/general/docs/current-tools.md)

### Inferences

The following contract is a policy recommendation.
It is not an existing upstream runner standard.

#### Checker and process

1. Pin the jar URL, release, approved SHA-256, and matching source revision in one reviewed tool lock.
2. Compare the jar with the published release checksum before you accept that lock.
3. Distinguish a locally computed SHA-256 from an upstream-published digest.
4. Compare the jar digest with the lock before every execution.
5. Require an approved Java runtime. Java 17 is a practical initial policy for this task.
6. Fail on a missing runtime or checker. Do not silently download another release or skip the gate.
7. Spawn Java directly with an argument array. Do not use a shell or a manifest-supplied command.
8. Construct a minimal environment. Exclude ambient Java options, classpaths, and TLA library overrides.
9. Set one worker, a fixed seed, a heap cap, an output cap, and a wall-clock deadline.
10. Kill and reap the process after a deadline or output-cap failure. Classify the result as incomplete.

Use this argument shape:

```text
java <heap-cap> -XX:+UseParallelGC -cp <verified-jar> tlc2.TLC
  -tool -modelcheck -workers 1 -seed 1 -lncheck final
  -metadir <owned-state-directory> -config Change.cfg Change.tla
```

Set `cwd` to the temporary model directory.
Do not accept extra flags from the proof manifest.
Do not use simulation, recovery, warning suppression, or disabled deadlock detection.
These restrictions use the pinned CLI and current tool documentation above.

#### Inputs and checked obligations

Hash the actual changed inputs, model, configuration, and complete module closure.
Compare the hashes again before you report success.
Reject missing files, symbolic links, paths outside the allowed root, and unexpected dependencies.
Copy only declared files into fresh positive and negative directories.

Start with a restricted configuration grammar.
Require an explicit specification and checked invariant names.
Require declared temporal property names for progress claims.
Reject unchecked names and unknown directives.
Initially reject state constraints, action constraints, symmetry, views, operator overrides, and checkpoint settings.
Any later support needs a reviewed extension of the contract.

Allow only reviewed standard modules and declared local TLA+ dependencies.
Reject Java classes, extra jars, local replacements of standard modules, and runtime-control operators.
Initially reject imports from the `TLC` module, including `Print`, `PrintT`, and `TLCSet`.
The source basis is `SpecProcessor`, `TLAClass`, and the documented `TLCSet` behavior.
This restriction does not create a hostile-code sandbox.

#### Positive result

Require all of these conditions:

- The process exits with `0` and no signal.
- The output contains valid, complete tool records for mode, success, statistics, and finish.
- The final distinct-state count is positive.
- The final queue count is zero.
- The output contains no error, checker-bug, or warning records.
- A temporal claim has records for temporal analysis and its completion.
- The current input hashes still match.

A success phrase or the finished record alone cannot satisfy this contract.
Reject missing, truncated, contradictory, or unknown error output.
These rules combine the exit mapping with `MP` and `ModelChecker` output.

#### Exact negative control

Declare the target module, original text, replacement text, expected property, and expected diagnostic.
Require exactly one occurrence of the original text.
Apply exactly one replacement in the negative copy.
Keep the positive source and property definitions unchanged.

Prefer a mutation that makes an invalid modeled transition reachable.
Review its relationship to the named obligation.
An invariant replacement with `FALSE` tests only the execution mechanism.
It does not test the domain rule.

For an invariant control, require exit `12` and the declared diagnostic `2107` or `2110`.
Require the exact invariant name and a counterexample state or trace.
For a temporal control, require exit `13`, diagnostic `2116`, and a temporal counterexample.
Configure exactly one temporal property in that control.
The generic temporal message cannot identify a name among several checked properties.
This distinction follows from the pinned `MP` cases and `EC.ExitStatus` mapping.

Reject syntax errors, evaluator failures, unrelated violations, and resource failures.
Reject a countermodel with no violation.
Do not treat arbitrary nonzero exits as successful controls.
Hash the negative copy.
Make sure that the positive inputs remain unchanged.

#### Evidence, cleanup, and runner tests

Capture output directly from the fresh Java process.
Report input hashes, checker digest, runtime version, arguments, bounds, checked names, counts, outcomes, and limits.
Never substitute a stored transcript, a fabricated process result, or a fixture runner for executable model evidence.
Parser unit tests can use fixtures.
Runner acceptance tests must also invoke the real pinned checker.

Keep metadata under the owned temporary root.
Remove that root in a final cleanup block after success, violation, timeout, or parser failure.
Make sure that removal completes before you report complete cleanup.
The cleanup flag does not replace this final cleanup contract.

Test runner failures for missing checks, wrong jar bytes, stale inputs, and wrong invariant names.
Test malformed output and absent expected violations.
Also test timeout termination and cleanup after failure.
These controls test plausible failures in the proposed runner contract.

### Gaps

The release metadata does not supply an upstream SHA-256 for the selected jar.
A reviewed lock needs that value before enforcement.
This research does not measure timing or memory needs.
Set resource caps from the small self-model, then keep failures explicit.

A contributor can change both a model and its claimed mapping.
Required review must examine that correspondence.
Tool output records are a protocol, not an authenticated proof against a hostile model or a compromised runner.
The gate can establish observed execution and artifact requirements within its trusted execution environment.
It cannot show how an author privately derives a model or establish complete semantic coverage.
