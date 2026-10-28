# Refactoring

You own the contract.
The structure changes, but behavior does not.
Feature adds behavior, while Bug fix corrects it.

If cleanup reveals a missing feature or real bug, split that work out.
Ship the structural change first against the pinned contract.
A redesign is allowed when you name it and route to Feature.
Use `figure-it-out` for large work or changes across many parts of the codebase.
This playbook covers focused or medium changes.

When astack is installed, load `astack:coding-guide` and `astack:coding-rules` with the Skill tool before step 1.
Follow the coding guide's daily workflow.
Tell each delegate to load `astack:coding-rules` before its first edit.
Its scope fence and migration rules apply through steps 4 and 5.

1. Pin the behavior contract first. Use `how` over the affected subsystem to learn that contract. Before moving structure, capture current behavior with a characterization test, snapshot, or equivalence harness. Write the pin first when coverage is missing. Typecheck and lint do not pin behavior.
2. Name the missing structure under [Model the Domain](../../principles/references/model-the-domain.md). Keep plain code when its shape is already clear and local. The new shape must remove branches or invalid states instead of adding indirection.
3. Name the target shape. State the module layout, types, and call graph you would choose today. Follow [Foundational Thinking](../../principles/references/foundational-thinking.md) and [Redesign from First Principles](../../principles/references/redesign-from-first-principles.md). If that target crosses a function boundary, use `architect` to explore shapes in parallel before the move.
4. Subtract before adding the new shape. Delete dead code, wrappers with one caller, redundant validators, and orphan references first. Follow [Subtract Before You Add](../../principles/references/subtract-before-you-add.md). Ship the smallest change that reaches the target shape, under [Laziness Protocol](../../principles/references/laziness-protocol.md). Revert speculative cleanup that "might help".
5. Move in small steps that keep the behavior pin green. For an API change, migrate every caller and delete the old API in the same wave. Follow [Migrate Callers Then Delete Legacy APIs](../../principles/references/migrate-callers-then-delete-legacy-apis.md). Keep no compatibility shims or parallel old and new paths within one PR. With astack installed, plan a migration that exceeds one PR through `/astack:plan` as expand, migrate, contract. Compare every rename with the actual files. Renames can miss strings, prose, and references back to the old name. Delegate mechanical edits to a subagent on the configured refactoring model, which defaults to `sonnet`. Give it the file paths, names to move, and behavior to preserve. Choose its model and effort for the job under the Subagents rules.
6. Prove unchanged behavior on the real artifact, not through "it compiles". Follow [Prove It Works](../../principles/references/prove-it-works.md). For a larger change, use an equivalence check. Examples include a script comparing old and new outputs, a recorded baseline replay, or a smoke run through the matching control skill.
7. Verify that the change is worth keeping through reduced reader load. Follow [Minimize Reader Load](../../principles/references/minimize-reader-load.md). Revert the change when it lowers reader load nowhere.
8. Rebase into small ordered commits. Put subtraction first, then the new shape, then any further cleanup. Follow [Sequence Work into Verifiable Units](../../principles/references/sequence-verifiable-units.md). Keep each slice green before the next. Run Opening a PR.

## Reply

Report the changed structure, pinned contract, equivalence proof, and reader-load delta.
State what shipped and what you reverted.
Add no new behavior.
