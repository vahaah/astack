# Formal domain proof composition

PR 13 must require one `ChangeProof` for every change workflow, including docs and configuration. The record must link domain meaning, category claims, ADR decisions, models, and executed controls. A required standalone `astack check proof` must run pinned TLC for current inputs and a named negative control. Existing gates must supply separate behavior or document evidence for those inputs. Internal briefs and handoffs must cite the record and state unfinished obligations. Read-only questions have no delivery change to prove.

## One aggregate links distinct proof duties

`ChangeProof` owns the admission invariants for one candidate change in a change-assurance bounded context. Product contexts retain their terms, rules, and code. `ReviewRun` retains its findings ledger, review cap, and fixed growth baseline. Merge authority remains with existing owner gates.

Evans defines bounded contexts and aggregate ownership. He does not require TLA+ or category theory. ([DDD Reference](https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf))

Two designs differ in their enforcement authority:

| Design | Concrete trade-off |
| --- | --- |
| Required aggregate and standalone CI checker | Works without hooks or a planning session. Requires a runner and repository adoption. Select this design. |
| Hook-led mandatory policy | Requires complete client event coverage and failure handling. Current dispatch can allow missing decoded events and handler failures. |

The hook limitation comes from local source inspection in the supplied notes. Hooks can give early feedback. They cannot supply the only delivery gate. A profile switch also creates an unwanted opt-out. ([Local enforcement findings](<../research_notes/Formal domain proof composition/adr_migration.md>))

This proposed record sketch is not an implemented schema:

```text
ChangeProof {
	version, scope: { base, changedPaths, obligations },
	domain: { contexts, terms, owners, effectiveDecisions },
	category: { objects, arrows, carrier, effects, identity, composition, equality, laws },
	abstraction: { hiddenRule, callerFacts, relation, transitionMatches, exclusions, alternatives, deletionTest },
	model: { module, config, dependencies, bounds, assumptions, fairness, properties },
	controls: { criterionIds, controlIds, commands, expected },
	negative: { name, mutation, property, diagnostic }, limits
}
Receipt { version, base, head, inputDigest, tools, outcomes, counts }
```

Each changed path needs an obligation, a model relation, and a control. Every claimed property must resolve to a configured property and an executed control. Reuse the existing criterion inventory and spec-drift links. Add model-property and composition references without another criteria list. The current spec-drift check validates declared links but does not execute controls or establish semantic coverage. ([Traceability findings](<../research_notes/Formal domain proof composition/adr_migration.md>))

The runner hashes the manifest, changed inventory, source inputs, complete model dependencies, configuration, and tool lock. It compares inputs before and after execution. Receipts stay outside the checkout. The manifest never stores its own digest or the hash of the commit that holds it.

## Domain meaning constrains lawful composition

Every brief and handoff names the record, assigned scope, permitted effects, domain terms, decisions, criteria, abstraction relation, and evidence status. Shared definitions keep these messages short. An incomplete handoff identifies the remaining obligations and permits a safe pause.

Objects denote sets of valid values or artifact contracts. Arrows reference actual functions or document transformations. State identity, composition, effects, equality, assumptions, and applicable laws. Categories require associative composition and identities. Functors preserve both. ([Seven Sketches, Definitions 3.6 and 3.35](https://dspivak.net/7Sketches.pdf))

Use ordinary composition for pure total functions. For fixed `E`, a `Result` arrow has shape `A -> Result<B,E>`. Its identity returns `Ok(a)`. Success-only bind preserves `Err(e)`. A monad claim requires left identity, right identity, and associativity. ([Moggi](https://maxsnew.com/docs/moggi91.pdf), [Wadler, Section 3](https://homepages.inf.ed.ac.uk/wadler/papers/marktoberdorf/baastad.pdf))

Associativity permits different parentheses, not different effect order. With `Promise<Result>`, record rejection separately from expected failure. Promise construction and thenable adoption add behavior beyond that return type. ([ECMAScript Promise construction](https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-promise-executor), [Promise resolution](https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-promise-resolve-functions))

The category record remains mandatory for pure work, docs, and configuration. It can state unchanged runtime composition and give law applicability reasons with witnesses. Do not call each function a monad. Compile compatible arrows with canonical types. Require both functor laws for a changed map. Require monad operations to agree with the existing map.

Test changed law-bearing helpers without duplicate tests. Keep ordinary TypeScript and the shared `Result`. Each abstraction entry names the hidden rule, facts callers need, alternatives, and deletion test. Reject a new layer when callers stay equally clear without it. Context meaning, purity, totality, complete effects, and suitable equality require semantic review. ([Category and abstraction analysis](<../research_notes/Formal domain proof composition/category_domain.md>))

Record the proof policy in a new ADR. Preserve accepted decision bodies and numbers. Link replacements in both directions. Nygard keeps superseded records available. ([Documenting Architecture Decisions](https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions))

Keep terms in glossaries, constraints in controls, and current outcomes in receipts. Keep the existing whole-ADR supersession format. Use narrowly scoped decisions and preserve accepted bodies and replacement links. Preserve unrelated decisions, including CLI independence from hook profiles. A heading-only citation check cannot establish semantic applicability. ([ADR findings](<../research_notes/Formal domain proof composition/adr_migration.md>))

## Fresh execution supports bounded claims

TLC checks reachable states of a configured finite model. A completed run does not establish correspondence with executable code. ([TLC paper, Section 2.2](https://lamport.org/pubs/spec-and-verifying.pdf), [AWS formal-methods experience, pages 72-73](https://cdn.amazon.science/67/f9/92733d574c11ba1a11bd08bfb8ae/how-amazon-web-services-uses-formal-methods.pdf#page=7))

Require a change-specific obligation or an explicit preservation relation. Domain changes model affected transitions. Configuration changes model permitted combinations. Normative docs model their procedure or contract. Editorial docs bind extracted before-and-after contract data. That extraction proves only the selected preservation claim.

An unrelated retry example cannot satisfy these duties. Delivery stays incomplete without an adequate obligation.

Require a domain invariant beyond type correctness. Add a temporal property when the change claims progress. State finite bounds, excluded behavior, assumptions, and fairness. TLC checks configured property names, not every defined operator. ([SpecProcessor](https://github.com/tlaplus/tlaplus/blob/5a47802b5c391f59ecdd44117981f4ff8c0656ba/tlatools/org.lamport.tlatools/src/tlc2/tool/impl/SpecProcessor.java))

Pin the checker release, reviewed SHA-256, matching source, and Java policy. Label a locally computed digest correctly. The supplied release evidence provides SHA-1 rather than an upstream SHA-256. ([Release v1.7.4](https://github.com/tlaplus/tlaplus/releases/tag/v1.7.4), [Release metadata](https://api.github.com/repos/tlaplus/tlaplus/releases/tags/v1.7.4))

Spawn Java directly with fixed arguments and a minimal environment. Use fresh temporary copies, one worker, fixed seed, and explicit resource caps. Reject simulation, recovery, undeclared dependencies, Java overrides, runtime-control operators, and unsupported configuration directives. Kill and reap incomplete processes. Remove temporary state after every outcome. These controls define a proposed runner, not a hostile-code sandbox. ([Runner analysis](<../research_notes/Formal domain proof composition/tla_enforcement.md>))

Require exit zero, complete mode/success/statistics/finish records, positive distinct states, zero queued states, and no warnings or errors. Temporal claims also require completed temporal analysis. A finish message alone is insufficient. ([TLC output codes](https://github.com/tlaplus/tlaplus/blob/5a47802b5c391f59ecdd44117981f4ff8c0656ba/tlatools/org.lamport.tlatools/src/tlc2/output/EC.java), [ModelChecker summary](https://github.com/tlaplus/tlaplus/blob/5a47802b5c391f59ecdd44117981f4ff8c0656ba/tlatools/org.lamport.tlatools/src/tlc2/tool/ModelChecker.java))

For the admission self-model, propose `AdmitStaleProof`. Mutate one freshness guard and expect `ReadyRequiresCurrentInputs` to fail. Require one exact mutation match in a temporary copy. Preserve the checked property definition. Require exit `12`, diagnostic `2107` or `2110`, the exact invariant name, and a counterexample.

Syntax failures and unrelated violations fail the control. A temporal control needs exit `13` and one configured property because diagnostic `2116` omits its name. ([Exit classification](https://github.com/tlaplus/tlaplus/blob/5a47802b5c391f59ecdd44117981f4ff8c0656ba/tlatools/org.lamport.tlatools/src/tlc2/output/EC.java), [Diagnostics](https://github.com/tlaplus/tlaplus/blob/5a47802b5c391f59ecdd44117981f4ff8c0656ba/tlatools/org.lamport.tlatools/src/tlc2/output/MP.java))

Run positive, negative, then unchanged positive models. Execute linked public-seam controls separately on the same inputs. Test the real runner against stale inputs, bad digests, wrong violations, malformed output, timeout, and cleanup failure. Stored transcripts can test parsers. They cannot replace current TLC execution.

Model readiness against missing fields, stale inputs, interrupted runs, wrong controls, and valid evidence. Test the actual admission function with matching cases.

## Adoption preserves review and CI controls

Release the ADR, schema, runner, routes, fallback, portable builds, and synthetic migration cases together. Require capability detection and structured success output. Old CLIs, missing tools, skipped controls, stale receipts, and unsupported commands fail delivery. Formal guidance was optional at the research baseline. The selected implementation adds a mandatory executable gate. ([Current implementation findings](<../research_notes/Formal domain proof composition/adr_migration.md>))

Planning, bugs, hotfixes, refactors, review fixes, PR creation, hardening, and Shipping use the same contract. Resume and refresh invalidate evidence when candidate inputs change.

Migrate each repository through one adoption PR. Update its committed companion profile and every branch overlay with separate CI. Preview apply with the explicit companion and overlay. Upgrade repository and CI CLI pins. Add the required proof job, matching unrestricted gate, dependencies, and initial relevant proof.

Keep Java and TLC in explicit prerequisites initially. The current hardening tools schema supports only Bun and Supabase. Match setup, environment, paths, and pins through CI parity. Reject a proof gate with narrower paths or `optional: true`. ([Migration findings](<../research_notes/Formal domain proof composition/adr_migration.md>))

Current ci-pins rules can stop mixed CI/tool adoption. `ci_proof` does not admit tool-version changes or mixed non-CI proof artifacts. Define an explicit installation-migration transition before adoption. Keep the current stop until that transition exists. Implement the reviewed transition rule in astack before its use.

Record its scope, old and new CLI identities, tool pins, profile digests, and preserved ledger. Require all gates and every required `pull_request` check on the current candidate head. Never waive a required gate or use old-head CI. Verify installed capability and merged CI before the next repository. External required-check settings also need verification. ([CI-pin and adoption limits](<../research_notes/Formal domain proof composition/adr_migration.md>))

Do not edit a frozen hardening configuration in place. Preserve findings, recurrence history, iteration usage, review cap, and first-review growth baseline. Invalidate dependent evidence and rerun affected deterministic gates. Start no extra review beyond the cap. If the transition cannot preserve these records, retain principled incompletion. Never present that stop as clean. ([Hardening state findings](<../research_notes/Formal domain proof composition/adr_migration.md>))

## Conclusion

The owner must accept the installation-migration transition before a blocked adoption can proceed. External required-check changes need the responsible owner's grant. Removing enforcement requires an explicit policy reversal and a new ADR.

| Evidence class | Available evidence | Limit |
| --- | --- | --- |
| Primary facts | Linked formal-method, category, domain, ADR, and tool sources | They do not prescribe this astack policy. |
| Local inspection | Three supplied research notes | No repository delivery gates ran for this synthesis. |
| Local probe | Category note reports five assertions | These observations do not establish general laws. |
| Examples | Record sketch, the notes' typed example, and named self-model control | These examples have no compiler or TLC result. |
| Proposed design | Aggregate, runner, admission rules, migration transition | This synthesis ran no TLC and created no adoption PR. |

Review must judge relevance, domain meaning, abstraction, and implementation correspondence. Repository rules can require visible artifacts and observed execution. They cannot enforce private model reasoning.

## Implementation follow through

PR 13 now contains the required proof command, domain glossary, governing ADRs, internal record contract, and CI integration.
The implementation keeps whole-ADR supersession instead of a new clause resolver.
It preserves CI-pin stops and review state during adoption.
Remote required-check settings remain a separate owner action.

[ADR 0005](../docs/adr/0005-every-change-carries-domain-and-formal-proof.md) states the admission invariant and its implementation relation.
[ADR 0006](../docs/adr/0006-internal-composition-records-follow-domain-effects.md) gives the typed arrows and Result law explanation.
Both link their formal claims to executable models, configurations, and controls.
The checker rejects missing integrated sections and unresolved function or artifact references.

The repository self-proof ran pinned TLC on current inputs.
Its positive and restored runs each checked 45 distinct states.
Removing the freshness guard produced the named `AdmitSafe` violation with a 10-state counterexample.
The same model checks bounded left identity, right identity, and associativity for Result.
The typed composition witness passed the repository compiler.
The first integrated delivery check passed 3,761 tests, lint, types, validation, scans, client builds, and the required proof gate.
Later delivery results remain in PR and CI evidence.

These results do not remove the model/code boundary described above.
