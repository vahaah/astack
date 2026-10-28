---
name: "astack-coding-rules"
description: "Use before writing, changing or reviewing code in any repo. It holds the house rules on change size and the scope fence, root-cause fixes, types, system edges and reader load. It also covers design vocabulary, tests, comments, gates and per-repo overlays. A delegate or reviewer loads only this skill. The session that owns the ticket also loads astack-coding-guide for the daily workflow."
---

# Coding rules

`<skill-dir>` in a command below is the folder that holds this SKILL.md.

These rules apply to the ticket owner, its delegates and its reviewers whenever they write, change or review code.
The always-on coding rule is their short form.
This skill adds the reasons and the edge cases.
`astack-coding-guide` gives the owner's daily workflow from `/astack-plan` to the merged PR.
A stricter repo rule wins.
See "Per-repo overlays" below.

## Principles these rules build on

The rules use the principles in `astack-principles`.
Their source credit is pstack.
The summary here is enough to apply each principle.
For the full index, run `astack skill-path astack:principles`.
Read the path it prints.
For one principle, run `astack skill-path astack:principles references/fix-root-causes.md`, with the reference name you need.
Read that reference in full.
If `astack` is not on the Bash PATH, run `"<skill-dir>/../../bin/astack"`.
Exit 1 means the skill or reference is unavailable.
Then the summary remains the rule.

| Principle | Summary |
|---|---|
| `laziness-protocol` | Make the smallest change that solves the problem. Put each decision in one place. |
| `subtract-before-you-add` | Remove dead code and redundant guards before you build on top. |
| `fix-root-causes` | Reproduce, ask why until you reach the cause, and fix it there and at every instance of the pattern. |
| `type-system-discipline` | Make illegal states unrepresentable, brand primitives, parse external data, and never lie to the compiler. |
| `boundary-discipline` | Validate where data crosses into the system, trust types inside, and keep business logic pure. |
| `model-the-domain` | Encode the domain in a data structure instead of conditionals spread across files. |
| `minimize-reader-load` | Count the layers a reader must trace and the state they must hold, and cut both. |
| `migrate-callers-then-delete-legacy-apis` | Move every caller to the new internal API and delete the old one in the same change. |
| `test-behavior-not-implementation` | Call the code as its users do and assert the exact result they see. |
| `encode-lessons-in-structure` | Turn a correction you keep repeating into a type, test, lint or script. |
| `prove-it-works` | Check the real artifact, not a proxy, before you call the work done. |
| `sequence-verifiable-units` | Split work into small units that each end green, and order commits so they prove the change. |

`astack-types` gives the house type and FP rules and what enforces each one.
`references/typescript.md` adds the Zod forms and more examples.

## Keep the change small and fenced

Make the smallest change that meets the ticket's acceptance criteria.
The reviewer must check each extra line.
The next reader must trace it.

The scope fence lists the files and tests that the change must edit to meet those criteria.
Inside the fence, you can delete dead code or inline a wrapper with one caller.
You can also turn a comment's constraint into a type or a test.
Outside the fence, file a ticket.
Leave that code alone.
The fence sets the limit on refactoring during the task.

Match the code patterns that the repo uses.
Do not copy its comment patterns.
New and changed lines follow the comments rule, even in a file with long comments.
If your change makes an existing comment false, delete it in the same commit.
When a keep clause covers it, correct it instead.
Clean up other old comments only in a PR for that purpose.

A repo can be midway through someone else's migration, such as a schema library major version.
Migrate only the lines you already change for the task.
File a ticket for the rest.
For an internal API replacement, run `astack skill-path astack:principles references/migrate-callers-then-delete-legacy-apis.md`.
Read the path it prints.
Move every caller to the new API in the same change that deletes the old API.
If that is too wide for one PR, plan it with `/astack-plan` as expand, migrate, contract.

One plan is one PR.
A PR can serve more than one ticket.
Split a PR only when the owner says so.
Put follow-ups in the open PR.
Each plan step is one commit in that PR.

Order the work so you can check each step.
Remove first.
Then add shared setup, such as types and test helpers.
Add the feature after that.

A bug fix and a review or hardening finding follow one rule. A fix can add a test or script that fails for the reported reason. Run the failing check before the fix. Record its output. Then commit the test or script together with the fix, so every commit is green. The PR's Verification shows the failing run first, then the passing run. Each finding owns its commits. No commit holds two findings. Never commit a saved transcript.

## Fix the root cause

Reproduce the failure before you change code.
Use a failing test, a script, or a saved transcript of the failing run.
Ask why until the answer gives a fact about the design rather than another symptom.
Fix the cause there.
Search for the same pattern.
Fix every instance inside the fence.
File a ticket for the rest.

None of these is a fix. Each one hides the failure and leaves the cause in place.

- An optional chain or null guard at the line that crashed.
- A `catch` that swallows the error, or logs it and carries on.
- `as any`, `as unknown as T`, or a non-null `!`.
- `@ts-ignore`, `@ts-expect-error`, or a lint suppression on a correctness rule.
- A retry, a sleep, or a longer timeout.
- A skipped or deleted test, or an assertion made weaker until it passes.
- A snapshot regenerated without reading the diff.

A guard is correct only when absence is legal and the type permits it.
Then the guard parses a valid case.

Sometimes you need new instrumentation or several hypotheses to find the deciding fact.
Then propose a cheap, always-on signal that shows that fact directly.
Examples are a log field, a metric and a test.

## Make wrong states fail to compile

`astack-types` holds the type and FP rules.
They cover unions with full matches, brands and types from the schema that owns the shape.
They also cover `any`, casts, `!`, total functions, errors as values and a pure core.
They cover laws as property tests and limits against over-engineering too.
Load it before you write or review TypeScript or Swift.
Each rule names the tool that enforces it.
The astack type hook denies a change that adds an `any`, an unsafe cast, a `!` or a compiler suppression.

Use `type` for unions, intersections, mapped types and anything derived with `z.infer`.
Use `interface` for a plain object contract, especially one that other code extends or implements.
Do not convert between them outside the task's scope.

In new code, use `z.uuid()`, `z.email()` and `z.url()` rather than forms such as `z.string().uuid()`.
Zod 4's `z.uuid()` rejects IDs that are not RFC 9562 UUIDs.
Use `z.guid()` for any 8-4-4-4-12 hex ID.
In a repo still on Zod 3, follow the repo and the migration rule above.

## Validate at the system edge

Three words get confused in review. Use each for one thing only.

- A system edge is where data enters or leaves the process. Edges are request handlers, RPC and tool inputs, environment variables, files, queues, database rows and third-party responses.
- A bounded context is a domain area with its own model and language. A repo may enforce the dependencies between contexts with a test.
- A seam is where a module's interface lives. At a seam you can change behavior without editing the code there. Callers and tests cross the same seam, and an adapter at a seam lets you swap in a fake or a second backend.

Do not write "boundary" on its own. Say which of the three you mean.

At a system edge, parse raw input into a domain type.
Return a typed error when the input does not fit.
Inside the system, trust the types.
Do not validate again there.
Do not pass transport, storage or framework types to the rest of the code.
Keep business rules in pure functions that the edge calls.
Then you can test them without the framework.

Database rows count as an edge unless the repo generates row types from the schema and checks them in CI.

## Keep reader load low

A new reader traces layers to find where a value comes from and what can change it.
They must also remember the state.
Count both costs.
Cut both.

- Inline a wrapper with one caller, an adapter with one implementation and no test fake, and a layer that only passes arguments through.
- Keep a layer that the repo enforces with a test or a lint. An example is a dependency-direction test between route, service and data layers, or between bounded contexts. That layer is a decision. Keep the code inside it thin instead.
- Prefer return values to mutation, locals to fields, and fields to module state. Derive a value instead of syncing two copies.
- Name an invariant once, at the edge that establishes it, not in every consumer.
- Search for an existing helper before you write one. Two helpers for one job means a reader must learn both.
- Treat a file past about 1,000 lines as a smell. The same ad hoc `if` on one field in several files is a smell too. So is a second boolean that must stay in sync with the first.

Names state intent.
If a name needs a comment, rename it.
Put units in names, such as `timeoutMs`.
Name booleans as predicates, such as `isArchived` and `hasAccess`.

## Use one design vocabulary

- A module is any unit with an interface and an implementation: a function, a file, a package.
- The interface is everything a caller must know to use it, including errors, ordering and side effects.
- A public API is an export that other packages import from its package's entry point, or an HTTP or RPC route that clients call. An export that only its own package imports is not one.
- Depth is how much a module hides behind its interface. A deep module has a small interface and does a lot. A shallow module makes the caller learn almost as much as the implementation holds.
- The deletion test asks whether complexity would reappear in each caller if you deleted the module and inlined its code. If not, the module is shallow, so inline it.

## Test behavior, not implementation

Call the code as its users do, with one concrete input, and assert the literal result or effect. A test that still passes when every imported function returns `undefined` tests nothing. Rewrite it or delete it.

| Shape | Why it fails | Write this instead |
|---|---|---|
| `toBeDefined`, `toBeTruthy`, `not.toThrow`, `toBeGreaterThan(0)` | Passes for almost any output | Assert the exact value |
| `toHaveBeenCalled`, `toEqual([])` with nothing else | Proves a call or an absence, not a result | Assert the payload the fake received, or pair the absence with a presence on another input |
| `expect(f(a)).toBe(f(a))` | The code under test computes the expected value | Write the expected literal |
| Restated constant, config default or prompt string | Tests the copy, not the code | Test the code that reads the constant, with one input |
| One row for each member of a class, such as each refused character | Each row guards the same branch | One row for each class, plus its boundaries |
| A type guard over each member of a union, or a check that the compiler makes | The compiler or the framework already fails | Delete it |

Put the intent in the test name or the `test.each` case name.
Do not put it in a comment above an assertion.
When a test needs a production value as input, import it.
Examples are a limit and a key.
Do not assert that a constant equals itself.

Write few tests.
Make each one guard a defect.
Write a test only for a behaviour that a plausible defect breaks and that no other test guards.
Test one case for each equivalence class, plus its boundaries.
Prefer one table test with a few representative rows to many single tests.
A small module needs a few tests, not dozens.
Each extra test adds work to later changes.
A reader must read it and keep it green.

Mutation testing finds weak assertions.
It can also cause test bloat.
A mutant that survives needs a new test only when a developer can make that defect by mistake.
A reviewer who asks for a test names that defect.
Delete a test that cannot fail for a real defect in the PR that finds it.

A feature slice starts with a failing test under `astack-tdd`.
Use a seam that the plan, the ticket's Verification or the user agreed.
The session that owns the ticket puts that seam in each code delegate's brief.
When nobody agreed one, the owner asks the user.
Sometimes nobody can answer, as in an unattended run or for a delegate whose brief names no seam.
Then take a seam from the ticket's Verification or acceptance criteria.
Name it in the PR's Verification or in your report.
If `astack-tdd` is unavailable, write that failing test yourself before the code.

A bug fix starts with a check that fails for the reported reason, as "Fix the root cause" says. Write a test when a cheap, correct seam exists, as `astack-tdd` describes. Otherwise use a script or a saved transcript of the failing run, and never add a shallow test just to have one. The test or script goes in the same commit as the fix, as "Keep the change small and fenced" says. The PR's Verification shows the failing run first, then the passing run. Never commit a saved transcript.

Fake only what you cannot run or control locally.
Examples are a paid third-party API, the clock and randomness.
Assert what the fake received.
Do not mock the database or the file system in tests.
Run them with a local test database and a temporary directory.
Type-level tests in `*.test-d.ts` files are fine.

## Write no comments

Write no comment by default. pstack's Comment Sicko keep list is the only standard, and the comments rule quotes it. A comment stays only when it is one of these, or when it matches a repo keep pattern:

- A license or legal header.
- Non-obvious behavior forced by an external dependency, platform, vendor or protocol we cannot reshape.
- `prettier-ignore`, or a lint suppression whose rule is faulty, pedantic or style-only.
- A doc comment that defines a public API contract.
- An issue or RFC link that explains a constraint code cannot express.

A surprise in your own code is not a reason to comment.
Rename, extract, or retype until the behavior is obvious.
Encode a constraint in a type, test or lint when it can enforce the constraint.
History, ticket keys, review rounds and dates go in the commit message or the PR.
A lasting reason goes in an ADR, as `/astack-write-docs` describes.
A SQL `comment on` statement is schema metadata, not a code comment.

A kept comment fits in 2 lines. A doc comment on a public API fits in 12. A legal or license header keeps its full text and has no length limit.

Delete a comment that no keep clause covers.
Never shorten it to pass.
For a covered comment over the limit, keep the lines that state the external constraint.
Move the rest to a name, a type, a test or an ADR.

The astack hook denies comment classes that no keep clause covers.
They are narration, provenance tags, `file:line` references, the file's own path, banners and commented-out code.
They also include comments that only restate adjacent code, and correctness or safety suppressions.
The hook denies an added block over 2 lines, or over the repo's `maxCommentLines`.
A license header passes at any length when each part split by blank lines holds a license line.
The astack README names the license lines and the headers that pass.
A repo keep pattern passes only inside the line limit.
