# ADR history, proof ownership, and migration

## Which facts belong in ADRs, the domain model, and executable controls?

### Takeaway

Keep durable choices in ADRs, terms in the glossary, and constraints in executable controls.
Add one ADR for the mandatory proof contract and preserve unrelated accepted decisions.

### Cited Findings

| Evidence | Finding | Source |
|---|---|---|
| E1 | Nygard records significant architectural choices through context, decision, status, and consequences. His numbering never reuses a number. Superseded records remain available. | Michael Nygard, [`Documenting Architecture Decisions`](https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions) |
| E2 | Evans gives each model an explicit bounded context. Shared terms connect the model with team activity. Aggregate roots own whole-aggregate invariants. | Eric Evans, [`DDD Reference`, pages 2, 3, and 16](https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf) |
| E3 | astack requires three ADR tests: costly reversal, a surprising choice, and real alternatives. It puts terms in a glossary and constraints in types or tests. | [Writing skill](../../marketplace/plugins/astack/skills/write-docs/SKILL.md), [ADR reference](../../marketplace/plugins/astack/skills/write-docs/references/adr.md) |
| E4 | The ADR format has stable numbered decision headings. A replacement preserves the old body and links both records. Notes correct words without changing a decision. | [ADR reference](../../marketplace/plugins/astack/skills/write-docs/references/adr.md) |
| E5 | The domain skill keeps the glossary free of specifications and implementation decisions. It adds context maps only when the repository has several contexts. | [Domain skill](../../marketplace/plugins/astack/skills/domain-modeling/SKILL.md) |
| E6 | The plan checker resolves an ADR citation through a file and a matching decision heading. It does not examine accepted or superseded status there. | [Plan checker, `adrResolves`](../../src/astack/plan/check.ts) |
| E7 | ADR 0004 D3 makes CLI and CI checks independent of hook profiles. Minimal affects only STE, type, and comment quality groups. | [ADR 0004](../../docs/adr/0004-portable-review-and-hook-profiles.md) |

### Inferences

The mandatory proof policy passes the existing ADR tests.
It changes delivery cost, evidence retention, CI dependencies, and migration duties.
Its alternatives include a standalone check, a profile switch, and a hook.
E3 and E7 support a new decision that preserves the existing hook separation.

Record these facts in the new ADR:

- The owner requirement and the workflows that it covers.
- The distinction between delivery work and read-only questions.
- The responsible bounded context and its aggregate root.
- The evidence contract and the commands that enforce it.
- The alternatives, their costs, and the reason for the selected shape.
- The finite-model and implementation-test limits.
- The migration contract, failure states, and rollback effect.
- The decisions that the new ADR preserves or replaces.

Keep tool versions, model bounds, commands, and current results in the proof contract.
Keep delivery status, review rounds, and current blockers in the PR or tracker.
An ADR links these artifacts but does not copy their current contents.

Keep accepted meaning immutable.
Use an appended note for a path correction when the choice still holds.
Use a new ADR when the choice changes.
Preserve the old body, number, and decision headings.
Link the new ADR from the old record and index.
Link the old record from the new ADR.

Never reuse a deleted or rejected decision number.

For a partial replacement, identify the exact old decision clauses.
Keep other clauses in force and append the replacement link beside the old record.
Mark the whole old record superseded only when no clause remains in force.
This partial-replacement rule needs an explicit format addition.
The current format mainly describes whole-record supersession.

The proof checker must resolve an effective decision reference.
It must reject an unknown clause, a missing replacement, or a supersession cycle.
It must distinguish a historical citation from a claim that a decision remains in force.
E6 shows why a heading-only check cannot establish that distinction.

### Gaps

No source establishes that DDD requires TLA+ or category theory for every change.
That mandate comes from the owner requirement.
The final ADR needs the owner's accepted policy, rather than an attributed DDD rule.

## What is the smallest coherent proof domain and enforcement design?

### Takeaway

Use one `ChangeProof` aggregate in a change-assurance bounded context.
Require one standalone checker that runs TLC now and feeds the existing delivery gates.

### Cited Findings

| Evidence | Finding | Source |
|---|---|---|
| E8 | Current formal-model guidance is optional unless an owner or profile requires it. It separates model checks from implementation tests. | [Formal-model reference](../../marketplace/plugins/astack/skills/plan/references/formal-models.md), [Formal-model runbook](../../docs/runbooks/formal-models.md) |
| E9 | The model reference records bounds, assumptions, commands, explored states, and a planted defect. Generated model outputs stay outside the checkout. | [Formal-model reference](../../marketplace/plugins/astack/skills/plan/references/formal-models.md) |
| E10 | `check spec-drift` reads criterion and control inventories independently. It checks declared links but does not run tests or establish semantic coverage. | [Spec-link reference](../../marketplace/plugins/astack/skills/pr-review-hardening/references/spec-links.md), [Command](../../src/astack/cli/commands/check/spec-drift.ts) |
| E11 | Hook dispatch allows missing decoded events. It converts a handler exception into an absent verdict, then treats that verdict as allow. | [Hook dispatcher, `verdictFor`, `judgeEach`, and `judge`](../../src/astack/hook/dispatch.ts) |
| E12 | Hook quality presets affect marked handlers. CLI checks remain separate. An unknown root profile section fails profile validation. | [Hook policy](../../src/astack/hook-profile.ts), [Profile validation, `sectionProblems`](../../src/astack/profile.ts) |
| E13 | Hardening gates support path filters and optional commands. The existing `proof` block controls PR comments and unclean-stop actions. It does not define formal evidence. | [Hardening schema](../../src/astack/pr-review-profile.ts), [Gate reference](../../marketplace/plugins/astack/skills/pr-review-hardening/references/gate.md) |
| E14 | Hardening requires both a successful exit and the expected final result line for its head and CI checks. The launcher can exit zero without a runtime. | [Hardening skill, head check and preflight](../../marketplace/plugins/astack/skills/pr-review-hardening/SKILL.md) |

### Inferences

#### Domain ownership

`ChangeProof` owns the evidence needed to judge one candidate change.
It does not own product domain objects, reviewer judgment, or merge authority.
`ReviewRun` keeps its cap, findings ledger, and fixed growth baseline.
It refers to a checked `ChangeProof` through its input digest and contract version.
The product context owns its glossary, accepted decisions, model, and implementation behavior.
The assurance context checks declared evidence against the candidate inputs.

Use one pure rule module with file and process adapters.
DDD does not require new class hierarchies or folders for every noun.
E2 and E5 support explicit terms and invariant ownership.
They do not justify layers that only pass values through.

#### Proposed aggregate contract

The following fields describe a new contract.
They do not describe an existing command or schema.

| Part | Required content |
|---|---|
| Identity | Contract version, change name, base identity, and candidate input digest |
| Scope | Complete changed-path inventory, affected contexts, and obligations for each path |
| Domain | Glossary paths, context names, aggregate owners, and effective ADR decision references |
| Composition | Typed objects and arrows, claimed compositions, and the applicable law obligations |
| Abstraction | Concrete-to-model relation, transition matches, preserved properties, and omitted behavior |
| Model | TLA+ module, configuration, dependencies, finite bounds, fairness assumptions, and named properties |
| Negative control | Named temporary mutation, target property, and expected counterexample classification |
| Implementation controls | Criterion IDs, control IDs, source paths, commands, and exact expected outcomes |
| Results | Fresh tool identities, input digest, exits, property outcomes, and state counts |
| Limits | Unmodeled effects, unrun controls, and conclusions that the evidence cannot establish |

The authored manifest holds the scope, definitions, artifact paths, and control requirements.
The runner computes the candidate identity and results in a receipt outside the checkout.
The manifest stores neither its own digest nor the commit hash that will contain it.
The input digest includes the manifest itself and every model dependency.

Each internal brief and handoff includes its context, composition claim, abstraction relation, and proof reference.
It states the changed obligations and current evidence status.
It can reference shared definitions rather than copy the whole contract.
An incomplete handoff names the incomplete obligations.
The policy must never prevent a requested pause or safe stop.

The aggregate has these invariants:

1. Every changed path has a stated obligation and a relevant model relation.
2. Every claimed property resolves to a model property and an implementation or document control.
3. Every named domain term and effective ADR clause resolves inside the declared context.
4. Every claimed composition declares its input and output types.
5. Every claimed abstraction names the concrete behavior that it represents.
6. Fresh results bind to the same inputs that the checker inspected.
7. A selected negative control fails for the named property and expected reason.
8. A completed proof has no missing, skipped, stale, or unreadable required result.
9. A result states its bounds and never promotes model success into implementation conformance.

Use the existing spec-drift inventory format for criterion-to-control links.
Add model-property and composition references in the proof contract.
Do not create a second list of acceptance criteria.
The checker also compares declared scope with the real changed-path inventory.
That extra check addresses the current matrix's explicit-scope limit in E10.

#### Competing enforcement shapes

| Shape | Cost and limitation | Recommendation |
|---|---|---|
| Required standalone `check proof` | Needs a runner, contract parser, tool pin, and CI adoption. It works without a hook or planning session. | Select this as the authority. |
| New profile policy field | Needs both profile schemas, rendering, companion migration, fallbacks, and legacy handling. A default-off field violates the mandate. | Omit the switch. Add only required location metadata if fixed paths prove insufficient. |
| Required hook | Needs event coverage, fail-closed error rules, and client support. Current dispatch can allow decode and handler failures. | Use only for early feedback. Never make it the sole authority. |
| Saved pass receipt validator | Cheap to run, but a receipt does not execute the current model or current controls. | Use receipts for reporting and comparison only. |

The proposed command runs the pinned TLC tool on the declared module and config.
It runs the negative control in a temporary copy.
It runs the normal model again after that control.
It validates current inventories, references, scope, and abstraction metadata.
Existing CI test gates run the linked implementation controls.

The delivery result requires both fresh model execution and fresh control execution.
A saved `pass` field cannot substitute for either result.

Return a structured result with the contract version, checker identity, input digest, and complete required outcomes.
Require the expected result shape and a successful process exit.
Missing stdout, unsupported contract versions, missing Java, and an unknown command fail the gate.
E14 shows why exit zero alone is insufficient.

Hash the declared source inputs, configuration, dependencies, and changed-path inventory.
Compare the input digest before and after execution.
Keep result outputs outside that source digest to avoid a self-reference.
Do not permit the exclusion of arbitrary source paths as result outputs.
A changed base, model, config, implementation, or tool pin invalidates the previous result.

#### Every change workflow

Planning creates the proof obligations before implementation.
Bug, hotfix, review-fix, documentation, and configuration routes create the same contract when no plan exists.
Resume and refresh revalidate the candidate identity before they reuse any evidence.
PR creation, `pr-review-hardening`, and Shipping require the same fresh proof gate.
Read-only questions, source inspection, and research do not claim delivery completion and stay outside these gates.

For a code change, model the affected state, ownership, order, or failure contract.
For configuration, model the affected selection, permission, or deployment contract.
For documentation, model the procedure or contract that the changed text specifies.
Run document controls for commands, examples, references, and consistency where they apply.

For a spelling-only change, reuse the relevant accepted model and state the preserved semantic relation.
Still run that model and the relevant document controls.
Do not accept a generic retry example merely because TLC can execute it.

The relevance check needs review judgment.
A path link, nonempty file, or state count cannot establish meaningful correspondence.
Require a named plausible defect and a negative control that exposes it.
Reject a stock model with no explanation of the changed obligation.
Do not claim that this rule proves the meaning of arbitrary prose.

### Gaps

The current source has no mandatory proof command or aggregate schema.
The proposed runner, input-digest rules, and fresh test-result interface need implementation and adversarial tests.
This research ran no TLC model, implementation test, or delivery gate.
Repository artifacts can show declared claims and observable tool results.
They cannot prove an agent's private thought process or universal implementation correctness.

## How can existing repositories adopt the mandate without weaker controls?

### Takeaway

Release the checker first, then migrate companion-owned profiles through one reviewable repository PR at a time.
Missing evidence of adoption blocks delivery.

### Cited Findings

| Evidence | Finding | Source |
|---|---|---|
| E15 | The renderer writes `.astack/profile.json` from companion configuration. It checks fallback key coverage and rejects unsupported fallback settings. | [Renderer, `renderAstackProfile` and review-profile checks](../../scripts/lib/render.ts) |
| E16 | Apply supports new worktrees and follow-up update commits. Branch overlays replace gates, CI-only gates, parity configuration, and the hardening profile. | [Apply argument handling](../../scripts/apply.ts), [Overlay validation](../../scripts/lib/projects.ts) |
| E17 | CI parity maps pull-request jobs to gates. It checks paths, steps, environment, services, order, and supported tool pins. | [CI parity, `checkCiParity`](../../scripts/lib/ci-parity.ts) |
| E18 | Write-mode apply requires committed astack and companion sources. Update verifies worktree ownership and cleanliness, then records source provenance. | [Project apply, `committedSource`, `worktreeProject`, and `updateInWorktree`](../../scripts/lib/project-apply.ts) |
| E19 | Hardening freezes its profile for the run. Interrupted runs resume their findings ledger. The fixed first-review record survives resumes and new runs. | [Hardening skill](../../marketplace/plugins/astack/skills/pr-review-hardening/SKILL.md), [Review reference](../../marketplace/plugins/astack/skills/pr-review-hardening/references/review.md) |
| E20 | The fallback requires every key that it reads. Its command gates cannot silently replace missing mandatory commands. | [Fallback](../../templates/pr-review-hardening.stub.FALLBACK.md), [Fallback key schema](../../src/astack/pr-review-profile.ts) |
| E21 | After a setup branch merges, the install guide uses a new branch for later updates. Apply never amends or force-pushes an update. | [Install guide](../../docs/install-repo.md), [Project apply](../../scripts/lib/project-apply.ts) |
| E22 | The hardening `tools` schema currently names only Bun and Supabase. The normal formal-model runbook does not install the checker. | [Hardening schema, `GATE_TOOLS`](../../src/astack/pr-review-profile.ts), [Formal-model runbook](../../docs/runbooks/formal-models.md) |
| E23 | The CI-pin preflight stops on setup-version changes that do not meet its `ci_proof` conditions. That mode still requires current-head CI proof. | [CI-pin reference](../../marketplace/plugins/astack/skills/pr-review-hardening/references/ci-pins.md) |

### Inferences

#### Migration contract

1. Land the proof ADR, schema, runner, workflow routes, and synthetic migration fixtures in astack.
2. Update the fallback and portable builds in that same source change.
3. Add a capability check that rejects older CLIs before any delivery gate can pass.
4. Validate missing evidence, malformed inputs, stale digests, irrelevant models, and broken negative controls with synthetic cases.
5. Record migration status in the owner tracker, outside public source configuration.
6. Update each companion project profile and each branch overlay that has separate CI.
7. Preview each apply result with its explicit companion and overlay selection.
8. Create one setup or update PR for the repository.
9. Add the required CI proof job, matching review gate, pinned runner, and initial relevant proof artifacts in that PR.
10. Run fresh repository gates and examine the required check on the current PR head.
11. Merge only under the existing merge grant.
12. Read back the merged CI and installed capability before you select the next repository.

These steps describe future authorized migration work.
This note does not authorize edits to the companion or any product repository.

Use existing required gate fields rather than a `formal.enabled` switch.
Set the proof gate to apply to every diff.
Keep its command mandatory and its dependency checks explicit.
Require migration validation to reject an absent proof gate, narrower path scope, and `optional: true` for that gate.
Old profiles do not receive a permanent exemption.
A new workflow reports that migration is required when metadata or capability is missing.

CI must install a release that contains the checker.
Local installed plugins and repository CLI dependencies can differ.
An updated instruction alone cannot make an old CI binary understand a new command.
Require both the capability result and the fresh proof result.
Do not interpret an unsupported command as a skipped check.

Until its adoption PR merges, a repository remains unadopted.
Old installed instructions can still omit the check.
Report that limit until the required CI check blocks a merge.

Pin TLC through the proof runner's dependency contract.
Examine its artifact identity and Java requirement locally and in CI.
The existing `pr-review-hardening` tools map cannot accept arbitrary new tools.
Either keep these checks in explicit prerequisites or extend tool-pin support deliberately.
Mirror the chosen setup in CI parity.

For an overlay, add the proof job to that branch's CI and its companion review profile.
Use `--overlay <branch>` on updates when the branch requires that overlay.
A top-level gate change alone cannot establish overlay adoption.
E16 and E17 support this separate verification duty.

A migration that changes tool setup must also satisfy the CI-pin preflight.
The existing preflight can stop such work before review.
Define an explicit installation-migration path if the adoption change cannot satisfy that policy.
Keep the current stop visible until that path exists.
Do not bypass the preflight or claim that an old CI result proves the new setup.
E23 makes this a migration-design obligation.

#### Active hardening runs

Do not rewrite a frozen run configuration during migration.
Stop an active run with its actual incomplete result when the new mandatory gate cannot run.
Keep its findings ledger, recurrence history, iteration usage, and first-review record.
Resume only through an explicit configuration transition that records the old and new profile digests.
Rerun affected proof and deterministic gates on the new candidate.
Invalidate evidence that depended on the old configuration.

Do not reset the iteration count or growth baseline to get a clean result.
The new proof gate cannot start an extra review beyond the existing cap.

This note proposes a configuration-transition mechanism.
The current `pr-review-hardening` instructions freeze the configuration and do not define this migration transition.
If the implementation cannot preserve that state, report principled incompletion and retain the records.
Never silently create a replacement ledger.

#### Failure controls

| Failure | Required behavior |
|---|---|
| Missing proof metadata or model | Fail with the missing path or field. |
| Missing tool or old CLI | Fail the capability or prerequisite check. |
| Minimal hook preset or no hooks | Run the same mandatory CLI and CI gate. |
| Stale source input | Reject the receipt and run against the current input digest. |
| Negative control passes | Fail because the claimed property lacks the declared control. |
| Negative control fails for another reason | Fail because the expected property violation did not occur. |
| Linked implementation control skips | Keep delivery incomplete. A marker is not an execution result. |
| Model succeeds without a code relation | Fail the required contract relation. Review its relevance. |
| CI job is absent or advisory | Keep adoption incomplete. Preserve the existing merge guard. |
| Active run reaches its review cap | Stop with the existing incomplete decision. Keep proof failures visible. |
| Gate writes source files | Fail the read-only gate rule. Keep generated model output in a temporary folder. |
| Owner requests a pause | Stop safely and hand off incomplete obligations. Do not claim a proof pass. |

#### Evidence and inference ledger

| Claim | Basis | Bound |
|---|---|---|
| ADR history needs preserved superseded records | E1, E3, E4 | Established source guidance and existing astack convention. |
| A proof root should own whole-contract invariants | E2, E5 | Proposed domain application, not a requirement from Evans. |
| Hooks alone cannot establish mandatory proof | E7, E11, E12 | Verified current architecture. No client runtime was exercised. |
| A standalone runner is the smallest coherent authority | E8 through E14 | Design judgment based on the existing separation. |
| Trace links do not establish executed or adequate tests | E10 | Verified checker contract and command behavior by source inspection. |
| Companion and overlay migration must match CI | E15 through E18, E22, E23 | Verified source contracts. No private project inventory was inspected. |
| Migration must preserve caps and ledgers | E19, E20 | Existing controls plus a proposed explicit transition. |
| One repository PR can adopt runner, CI, and evidence together | E16 through E22 | Practical rollout proposal. No adoption PR was created. |
| Repository evidence cannot guarantee private reasoning | Observable inputs and outputs only | Scope of the proposed assurance contract. |

### Gaps

The private companion and product repositories were outside this research scope.
Their profile versions, CLI pins, CI rules, active ledgers, and migration count remain unverified.
If required-check settings live outside repository files, the owner must set them there.
Do not report migration complete until that check blocks merges on the intended branch.
Removal of the runner or the CI requirement removes enforcement.
Record that rollback as a policy reversal with a new ADR and explicit owner approval.
