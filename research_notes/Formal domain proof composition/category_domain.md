# Category theory, domain models, and composition

## Which category model fits ordinary TypeScript?

### Takeaway

Require an inspectable category record for each change.
Describe the actual types, composition rule, effects, equality, and law witnesses.
Do not require each change to claim a monad.

The smallest useful model has ordinary total functions, a fixed-error `Result`, and explicit sequential async code.
The model needs no runtime FP framework.

### Cited findings

- A category has objects, morphisms, identities, and composition.
  Its composition has identity laws and is associative.
  A functor maps objects and morphisms.
  It preserves identities and composition.
  See Definitions 3.6 and 3.35 in [Fong and Spivak, "Seven Sketches in Compositionality"](https://dspivak.net/7Sketches.pdf).
- Moggi separates values of type `A` from computations of type `T(A)`.
  His Kleisli category keeps the base objects and uses arrows `A -> T(B)`.
  Its identity is `eta`, rather than the ordinary value identity.
  `T(A) = A + E` models exceptions.
  See Definitions 1.2, 1.3, and Example 1.4 in [Moggi, "Notions of computation and monads"](https://maxsnew.com/docs/moggi91.pdf).
- Wadler defines a monad through a type constructor, unit, bind, and three laws.
  His identity monad has `M(A) = A`, identity unit, and function application as bind.
  His exception bind propagates a failure and skips the next function.
  See Sections 2.5 to 2.7 and 3 in [Wadler, "Monads for functional programming"](https://homepages.inf.ed.ac.uk/wadler/papers/marktoberdorf/baastad.pdf).
- GHC states identity and composition laws for `Functor`.
  It states left identity, right identity, and associativity for `Monad`.
  It also requires agreement between the related operations.
  See the class contracts in [GHC's `GHC.Internal.Base`](https://raw.githubusercontent.com/ghc/ghc/master/libraries/ghc-internal/src/GHC/Internal/Base.hs).
- ECMAScript calls the Promise executor during construction.
  Promise resolution adopts a callable `then` through a queued job.
  A callback exception can reject the next Promise.
  See [Promise construction](https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-promise-executor), [resolution](https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-promise-resolve-functions), and [reaction jobs](https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-newpromisereactionjob).
- The current rules require code in plain TypeScript.
  They also require one shared `Result`.
  They reject higher-kinded encodings, transformer stacks, and new helpers before three real chains exist.
  See [the type skill](../../marketplace/plugins/astack/skills/types/SKILL.md).
  The [law reference](../../marketplace/plugins/astack/skills/types/references/laws.md) requires only laws that the function has by design.

### Inferences

#### A small mathematical interpretation

This table proposes an internal interpretation of the cited definitions.
It does not describe a new production API.

| Part | Plain functions | Fixed-error `Result` |
|---|---|---|
| Base objects | Selected sets of valid domain values | The same base objects |
| Morphism from `A` to `B` | A pure total function `A -> B` | A pure total function `A -> Result<B, E>` |
| Identity at `A` | `id_A(a) = a` | `eta_A(a) = { ok: true, value: a }` |
| Composition | `(g o f)(a) = g(f(a))` | `(f >=> g)(a) = bind(f(a), g)` |
| Equality | The same domain value for each valid input | The same success value or failure value for each valid input |
| Effect | None | Expected failure as a value |

Use `o` for ordinary composition and `>=>` for left-to-right Kleisli composition.
State that convention once in the record.

The record describes a diagram inside a category.
It need not enumerate all identities and composites as code exports.
Its mathematical model includes those arrows.

A TypeScript function signature does not establish purity or totality.
Throws, divergence, mutation, getters, and external state can violate the chosen interpretation.
State each relevant assumption.
Do not equate TypeScript with `Set` without these limits.

For a fixed `E`, define the success-mapping endofunctor `R_E` as follows:

```text
R_E(A) = Result<A, E>
R_E(f)(Ok(a)) = Ok(f(a))
R_E(f)(Err(e)) = Err(e)
eta_A(a) = Ok(a)
bind(Ok(a), f) = f(a)
bind(Err(e), f) = Err(e)
```

`Ok` and `Err` name mathematical cases in this note.
Production code can keep its existing `{ ok, value, error }` form.
No helper implementation follows from this notation requirement.

The record must fix the error type of a claimed monad.
For chains with different errors, name their common union and the function that puts each error into it.
An implicit switch from fail-fast errors to accumulated errors changes the composition rule.

Use these equations only when their assumptions hold:

| Claim | Equation | Useful evidence |
|---|---|---|
| Ordinary left identity | `id_B o f = f` | The same input produces the same output |
| Ordinary right identity | `f o id_A = f` | The same input produces the same output |
| Ordinary associativity | `(h o g) o f = h o (g o f)` | Pure total functions with compatible types |
| Functor identity | `R_E(id_A) = id_R_E(A)` | Both success and failure cases |
| Functor composition | `R_E(g o f) = R_E(g) o R_E(f)` | A real map implementation and its property test |
| Monad left identity | `bind(eta(a), f) = f(a)` | Success values and a function that can fail |
| Monad right identity | `bind(m, eta) = m` | Both success and failure values |
| Monad associativity | `bind(bind(m, f), g) = bind(m, a => bind(f(a), g))` | Initial failure, intermediate failure, final failure, and success |

Associativity permits a change of parentheses.
It does not permit a change of order.
It does not establish commutativity, idempotence, transactions, or safe parallel execution.

The first-failure rule is an operational property of this `Result` definition.
It is useful evidence, but it does not replace all three monad laws.

#### A concrete typed example

This synthetic example owns its data definitions.
An application must import canonical types and its shared `Result`.
The caller parses the input shape first.
The quantity check is a domain rule.

```ts
type Result<A, E> =
	| { readonly ok: true; readonly value: A }
	| { readonly ok: false; readonly error: E };

type DraftOrder = {
	readonly kind: "draft";
	readonly quantity: number;
};

type ConfirmedOrder = {
	readonly kind: "confirmed";
	readonly quantity: number;
};

type SavedOrder = {
	readonly kind: "saved";
	readonly quantity: number;
};

type OrderError =
	| { readonly kind: "invalid_quantity" }
	| { readonly kind: "store_unavailable" };

function confirmDraft(
	draft: DraftOrder,
): Result<ConfirmedOrder, OrderError> {
	if (!Number.isSafeInteger(draft.quantity) || draft.quantity < 1) {
		return { ok: false, error: { kind: "invalid_quantity" } };
	}
	return {
		ok: true,
		value: { kind: "confirmed", quantity: draft.quantity },
	};
}

async function placeOrder(
	draft: DraftOrder,
	saveConfirmed: (
		order: ConfirmedOrder,
	) => Promise<Result<SavedOrder, OrderError>>,
): Promise<Result<SavedOrder, OrderError>> {
	const confirmed = confirmDraft(draft);
	if (!confirmed.ok) return confirmed;
	return saveConfirmed(confirmed.value);
}
```

This notation has these claims:

```text
Context: Ordering
Objects: DraftOrder, ConfirmedOrder, SavedOrder
E = OrderError
confirmDraft: DraftOrder -> R_E(ConfirmedOrder)
saveConfirmed: ConfirmedOrder -> Promise<R_E(SavedOrder)>
placeOrder: DraftOrder -> Promise<R_E(SavedOrder)>

confirmDraft effects: expected failure only
saveConfirmed effects: one storage write, expected storage failure, possible defect rejection
placeOrder order: confirmDraft, then saveConfirmed only after success

Mathematical lift: lift(r) = Promise.resolve(r)
Composed expression: lift(confirmDraft(draft)), then success-only saveConfirmed
```

The lift describes the async return behavior.
It does not require a new wrapper in production.

Test the public `placeOrder` behavior at its real persistence seam.
An invalid quantity must produce `invalid_quantity` and no write.
A valid quantity must produce the exact saved order and exactly one persisted row.
A storage failure must remain `store_unavailable`.
A defect rejection must follow the declared edge policy.

#### Limits of `Promise<Result>`

`Promise<Result<A, E>>` has two failure channels.
`Err(E)` is a value.
Promise rejection is a separate completion.
The signature does not show a complete effect system.

Use the existing return type and early return.
Record storage, network, clock, randomness, cancellation, and rejection behavior beside the signature when relevant.
Do not infer that async means I/O.
Do not infer that a plain return type means purity.

For a restricted model, define `T_E(A)` as eventual `Result<A, E>` outcomes.
Use a fixed error type, total callbacks, and no undeclared effect.
Every operation must settle with a `Result`.
Compare outcomes under a fixed environment.
Exclude Promise object identity, scheduling, and elapsed time from that equality.
Then success-only sequential bind has the intended `Result` equations at that observation level.

Do not extend that conclusion to arbitrary native Promises.
Thenable adoption prevents an unrestricted `A -> Promise<A>` interpretation for all JavaScript values.
I/O effects also require a model that includes their observations.
Trace evidence for one workflow does not establish universal monad laws for external services.

For an actual effectful chain, name the allowed observation:

```text
Observation: final Result plus ordered storage writes
Environment: the same initial database state and controlled dependencies
Excluded: Promise identity and microtask count
Evidence: success, first failure, storage failure, and defect rejection
Limit: these runs do not prove all external-service behaviors
```

#### Counterexamples that expose weak designs

These review examples follow the stated equations.

| Bad composition | Counterexample | Defect exposed |
|---|---|---|
| Recover every `Err` inside a supposed bind | `bind(Err(e), eta)` becomes a success | Right identity fails |
| Add a counter or log entry inside the supposed identity | The result value stays equal, but the declared trace grows | The chosen equality hides an effect |
| Change an error inside a supposed success-only map | Mapping `id` changes `Err("quota")` | Functor identity fails |
| Start both operations before checking the first result | A failed reservation still starts the notification | Sequential fail-stop behavior fails |
| Use `Promise.resolve` as unrestricted wrapping | `Promise.resolve(Promise.resolve(1))` resolves to `1` | The value wrapper adopts nested Promises |
| Assume floating-point addition is a monoid | `(1e16 + -1e16) + 1` differs from `1e16 + (-1e16 + 1)` | Associativity fails |
| Reorder authorization and a write | The write happens before permission is known | Associativity did not permit this reorder |

### Gaps

- This research does not prove that an application function is pure or total.
  A reviewer must inspect its dependencies and implementation.
- Property tests cover their generated inputs.
  They do not prove an unrestricted mathematical law.
- The typed example is a proposal.
  This note does not claim a compiler or application gate result for it.
- Native Promise timing, cancellation, and external failure need a chosen semantic model.
  No universal law claim follows from the return type alone.

## How does category notation fit DDD and abstraction design?

### Takeaway

A mathematical category and a DDD bounded context answer different questions.
Keep domain names in production and attach mathematical notation to the internal change contract.

### Cited findings

- Evans defines a bounded context as the limit within which a particular model applies.
  His ubiquitous language connects the domain model, team communication, and code.
  His context map identifies models and their explicit translations.
  See "Bounded Context", "Ubiquitous Language", and "Context Map" in [Evans, "DDD Reference"](https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf).
- Wlaschin separates domain objects from transfer objects between contexts.
  His conversion at the input validates the domain constraints.
  His output conversion can deliberately remove private information.
  See [Wlaschin, "Serializing your domain model"](https://fsharpforfunandprofit.com/posts/serializing-your-domain-model/).
- Wlaschin distinguishes his error-handling recipe from a claim that bind alone establishes a monad.
  He ties a monad claim to its laws.
  See [Wlaschin, "Railway Oriented Programming"](https://fsharpforfunandprofit.com/rop/).
- Wlaschin limits `Result` to expected control flow in his critique.
  See [Wlaschin, "Against Railway-Oriented Programming"](https://fsharpforfunandprofit.com/posts/against-railway-oriented-programming/).
- Milewski's Writer example needs an empty output and an associative output combine operation.
  Those constraints make its composition and identity work.
  See [Milewski, "Kleisli Categories"](https://bartoszmilewski.com/2014/12/23/kleisli-categories/).
- The current domain skill gives terms one glossary home.
  It proposes an ADR for costly reversal, a choice that needs explanation, and real alternatives.
  See [the domain-modeling skill](../../marketplace/plugins/astack/skills/domain-modeling/SKILL.md).
  The current rules for code separate a system edge, a bounded context, and a module seam.
  See [the rules for code](../../marketplace/plugins/astack/skills/coding-rules/SKILL.md).

### Inferences

#### Separate mathematical structure from domain meaning

A category specifies legal arrows and composition laws.
A bounded context specifies where domain terms and rules have a consistent meaning.
Neither definition supplies the other.

A context can contain many typed objects and many useful categorical models.
One mathematical category can also describe types from several contexts.
Neither case permits a bypass of their domain translations.

`Customer` in Ordering can mean something different from `Customer` in Billing.
A compatible storage shape does not establish compatible domain meaning.
Record the context and glossary reference for each affected object.

An integration adapter is not automatically a functor.
A functor maps both objects and arrows.
It must preserve identities and composites.
Use "translation" when only a concrete conversion exists.

Do not infer a round trip for a conversion that removes private data.
The valid claim can be a projection or a stated information-loss rule.
Do not infer domain correctness from algebraic laws.
A consistently wrong price rule can still compose lawfully.

#### Record an abstraction decision

Require a small design entry even when the chosen implementation adds no abstraction.
State the rule that the interface hides and the facts its callers must know.
State each effect, error, order constraint, and resource lifetime.
Name a real alternative and the reason for the choice.

Apply the existing deletion test.
If each caller stays as simple after you inline the layer, keep the code inline.
Do not create a generic algebra interface to satisfy the notation requirement.

Pure work has an honest record:

```text
Carrier: ordinary pure functions
Effect: none
Identity: id_A(a) = a
Composition: ordinary function composition
Applicable laws: category identity and associativity
Monad claim: none required
Reason: this change adds no effect carrier or bind operation
Witness: the actual pure signatures and the relevant behavior test
```

The identity monad can explain that case mathematically.
It does not justify a new runtime wrapper or a claim that each function is a monad.
The monad is the constructor and its lawful operations.
A function can be one arrow in the chosen model.

For docs or configuration changes, describe the affected artifacts and their stated contracts.
Use source references instead of invented runtime symbols.
State when runtime composition is unchanged.
Link the diff evidence.
Do not claim that a changed document is an identity transformation merely because it has no runtime code.

An unchanged ADR history still needs a decision check.
List the relevant accepted decisions, or state that the search found none.
Create a new ADR only when the existing qualification test passes.
Record a new decision that supersedes the accepted decision when the change reverses it.

#### Competing contract designs

| Design | Benefit | Cost or failure |
|---|---|---|
| Mandatory prose alone | Low syntax cost and space for domain judgment | A validator cannot reliably check missing links, incompatible claims, or stale evidence |
| Required `ChangeProof` data plus small linked witnesses | Checkable structure, actual symbols, explicit limits, and one handoff record | Review still decides whether the model and abstraction are correct |
| New FP interfaces and a diagram language | More syntax for generic algebra claims | Extra runtime design, duplicate types, and weaker domain names without proof of need |

Recommend the required `ChangeProof` record.
Use ordinary JSON for the record and ordinary TypeScript for typed witnesses.
Keep arrow notation as small text fields for inspection.
Do not create a second type language inside those strings.

### Gaps

- The sources do not prescribe an astack record format.
  The proposed format is an engineering inference.
- Algebra does not decide whether two context terms have the same meaning.
  Domain review must decide that claim.
- The proposed contract does not decide ADR thresholds for each repository.
  The current skill provides that local rule.

## What must the internal ChangeProof handoff contain?

### Takeaway

Make the category and design record mandatory in every change workflow and internal handoff.
Make each law claim conditional on explicit applicability, assumptions, and evidence.

Three fixed monad-law labels on every change can cause false claims.
A lawful `Result` implementation needs those laws.
Pure renames, document corrections, and async workflows with I/O need different claims.

### Cited findings

- A monad requires the three stated laws, not bind syntax alone.
  See [Wadler, Section 3](https://homepages.inf.ed.ac.uk/wadler/papers/marktoberdorf/baastad.pdf) and [GHC's class contracts](https://raw.githubusercontent.com/ghc/ghc/master/libraries/ghc-internal/src/GHC/Internal/Base.hs).
- A functor claim requires preserved identities and composition.
  See [Fong and Spivak, Definition 3.35](https://dspivak.net/7Sketches.pdf).
- Existing astack rules put domain names in production and category names in laws and review.
  See [the type skill](../../marketplace/plugins/astack/skills/types/SKILL.md).
  Existing docs rules give terms, decisions, behavior, and history separate homes.
  See [the docs skill](../../marketplace/plugins/astack/skills/write-docs/SKILL.md).

### Inferences

#### Proposed required record

Use one `ChangeProof` aggregate with six required parts.
The outer aggregate must also refer to the required TLA+ models.
The TLA+ researcher owns that part of the contract.

| Part | Required contents |
|---|---|
| Subject | Change scope, exact base and head, and affected behavior or artifact contracts |
| Domain | Bounded contexts, glossary terms, invariants, translations, and relevant ADR history |
| Category | Objects, actual arrows, carrier, effects, identity, composition, equality, and applicability of laws |
| Design | Chosen interface, hidden rule, alternatives, deletion test, and unresolved review questions |
| Evidence | Linked typed witnesses, law or behavior checks, results, assumptions, and known limits |
| Handoff | Assigned scope, allowed effects, required artifacts, acceptance criteria, and unresolved owner decisions |

These names describe a data contract.
They do not define a new abstraction language.

The category subtree can use this shape:

```json
{
	"category": {
		"model": "A diagram of selected total domain functions",
		"objects": [
			{
				"name": "DraftOrder",
				"context": "Ordering",
				"source": "src/ordering/order.ts",
				"symbol": "DraftOrder",
				"meaning": "An order that has no confirmation"
			},
			{
				"name": "ConfirmedOrder",
				"context": "Ordering",
				"source": "src/ordering/order.ts",
				"symbol": "ConfirmedOrder",
				"meaning": "An order with a valid quantity"
			}
		],
		"arrows": [
			{
				"symbol": "confirmDraft",
				"source": "src/ordering/order.ts",
				"from": "DraftOrder",
				"to": "ConfirmedOrder",
				"signature": "DraftOrder -> Result<ConfirmedOrder, OrderError>",
				"carrier": "result",
				"errorType": "OrderError",
				"effects": []
			}
		],
		"composition": {
			"rule": "Success-only bind with unchanged failure propagation",
			"identity": "eta_A(a) = Ok(a)",
			"equality": "Equal domain success values or equal OrderError values",
			"assumptions": ["Pure total callbacks", "Fixed OrderError union"],
			"witness": "tests/ordering/order-composition.test.ts"
		},
		"claims": [
			{
				"law": "monad-right-identity",
				"applicability": "applicable",
				"expression": "bind(m, eta) = m",
				"evidence": ["order-result-laws"]
			},
			{
				"law": "functor-composition",
				"applicability": "not_applicable",
				"reason": "The change adds no map implementation or map rewrite",
				"witness": "The scoped diff and existing Result definition"
			}
		],
		"limits": ["Property tests do not prove every runtime input"]
	}
}
```

This excerpt illustrates the shape.
It is not a complete valid record.
A claimed monad also needs left identity and associativity entries.
The full record must resolve every source and evidence reference.
The sample paths identify a synthetic application.

`effects` lists external effects.
`carrier` and `errorType` state failure and async structure.

An applicability entry must contain a reason and a witness.
It must not silently suppress the required category record.
For unchanged helpers, link their existing law evidence.
Do not add duplicate tests.

For a new map, require the two functor laws.
For a new bind or unit, require the three monad laws and agreement with the existing map.
For ordinary pure functions, state ordinary composition and the absence of an effect carrier.
For an async workflow, state its order, expected failures, rejection policy, and observed effects.

#### What a validator can examine

The validator can reject missing required parts, empty object lists, unresolved references, and stale base or head evidence.
It can require a carrier, equality, effects, and an applicability decision for every claimed operation.
It can make sure that source paths and linked witness files exist.
It can run declared checks and record their counts and exit status.

Compile a TypeScript witness for arrow compatibility.
Import the actual functions and canonical types in that witness.
Do not compare free-text signatures as a substitute for the compiler.
Do not add casts, `any`, an HKT interface, or a custom composition library.

The validator can require a linked domain term and ADR check.
It can reject a law claim that has no evidence.
It can require all three laws when the record claims a monad.
It can require a changed abstraction to include alternatives and its deletion test.

Use at least one negative fixture for each rejection class.
Pair an accepted record with records that omit a required field, break a reference, or claim an unsupported law.
Use an incompatible typed composition as a compiler negative control.
Keep the fixtures synthetic.

#### What remains semantic review

Review must decide whether the chosen model matches the code.
That includes purity, totality, complete effects, valid equality, correct domain terms, and adequate assumptions.
Review must also inspect whether a cited test imports the actual subject and asserts its exact behavior.

A schema can validate `effects: []`.
It cannot establish the absence of I/O or hidden state from that declaration.
A successful test run can be evidence for a law.
It cannot establish unrestricted quantification over all programs or external environments.

A record can require a visible brief, artifact, witness, and handoff.
It cannot establish how a model privately reasoned.
Do not name that guarantee in the contract or the report.

#### Required internal messages

Each initial brief identifies the `ChangeProof` record and relevant domain objects, arrows, invariants, decisions, and acceptance criteria.
Each delegate receives its permitted effects and the checks it must return.
Each handoff cites the updated record and separates observed evidence from remaining claims.

The same record applies to features, defects, refactors, docs, CI, reviews, and `astack:pr-review-hardening`.
The workflow changes which operations and laws apply.
It does not change whether the record is required.

Use short summaries in internal messages.
Keep the complete notation in the linked artifact.
Do not copy the entire model into each message.

#### Evidence and inference ledger

| Item | Status | Consequence |
|---|---|---|
| Category, functor, and monad definitions | Primary-source evidence | Use their actual laws when making those claims |
| `Result` as `A + E` with success unit and failure propagation | Primary-source model plus direct specialization | Fix `E` and use the stated equations |
| Promise execution, adoption, and rejection | Primary-source specification | State the observation model and rejection limit |
| Contexts and ubiquitous language | Primary-source domain design | Keep context meaning distinct from type compatibility |
| Existing astack limits against FP frameworks | Current local convention | Add no runtime framework to satisfy internal notation |
| Required six-part `ChangeProof` | Engineering inference | Validate the record while retaining semantic review |
| A law's applicability to a particular change | Review judgment with witnesses | Require a reason for each decision |
| Universal correctness of a function or external service | Unproved | Do not claim it from schema or sampled evidence |
| A model's private reasoning | Unobservable through this contract | Require inspectable outputs only |

### Gaps

- The final aggregate schema and CI command belong to the parent change.
  This note proposes the category and abstraction obligations.
- This note does not select a TLA+ state model or a model-checker configuration.
  The separate formal-methods research owns those decisions.
- A runtime probe passed five assertions for eager parallel calls, Promise adoption, and the numeric associativity counterexample.
  Those observations do not prove the complete proposed contract.
- Full repository gates did not run for this research note.
  The parent must validate the implemented contract and its negative fixtures.
