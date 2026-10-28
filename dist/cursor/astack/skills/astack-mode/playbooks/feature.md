# Feature

You own the design, plan, review, and verification.
Delegate implementation.
Stay in the lead.

When astack is installed, load `astack-coding-guide` and `astack-coding-rules` before step 1.
Follow the coding guide's daily workflow.
Tell each code delegate to load `astack-coding-rules` before its first edit.
A delegate cannot ask the user.
Put the test seams agreed by the plan, ticket, or user in each code delegate's brief.
If nobody agreed a seam, ask the user first.
Only when nobody can answer, choose a seam from the ticket's Verification or acceptance criteria.
Put that seam in the brief.
Name it in the PR's Verification.

1. Use `how` over the affected subsystem.
2. Use `architect` to explore designs in parallel.
3. Write the throughput checkpoint as four todo items. Keep an item with `n/a: <reason>` when it does not apply. Examples include one file or no fan-out. Never drop the item.
   - Blocking first steps. Run gates before fan-out.
   - Independent workstreams. Parallelize disjoint files, services, or layers. Serialize shared writes.
   - Shared mutable state. Split the target by default under [Separate Before Serializing Shared State](../../astack-principles/references/separate-before-serializing-shared-state.md). Serialize only for real invariants.
   - Smallest safe decomposition. State why one worker is best when you choose that shape.
4. Delegate code to a subagent with a specific scope and the configured feature model, which defaults to `sonnet`. Name the file paths, data shape, organizing structure, and success criteria before the delegate writes logic. Follow [Model the Domain](../../astack-principles/references/model-the-domain.md). Prefer a state machine over scattered booleans, a table/registry over branching, or a typed model over repeated shape assumptions. Choose each subagent's model and effort for the job under the Subagents rules. Use `arena` when several implementation shapes are valid, such as error handling, abstraction layers, or test structure. Its runners expose alternatives, and its cross-judge guards the choice. This delegation is mandatory, with no skip-with-reason escape. Laziness Protocol cannot override it, because the gain is review separation rather than fewer lines. A subagent forbidden to spawn, or at depth 3 without an Agent tool, owns the diff directly with the same review separation. Do not send a "standing by" reply that waits on a nested agent. Follow Comments. Make precise edits. For files derived from upstream, read the source again to ground the change. Apply shared-primitive improvements to every consumer. Verify each consumer. Commit often.
5. Verify on the matching surface. Flag an inconclusive result or a result from the wrong surface. Neither is a pass.
6. Rebase into small, ordered commits. Stack follow-ups. Follow [Sequence Work into Verifiable Units](../../astack-principles/references/sequence-verifiable-units.md). Build, verify, and commit each small unit before the next.
7. For a contested design, use `interrogate` in the Review step of Opening a PR. It must read the code after the slop pass.
8. Run Opening a PR.

Give code-coupled work, such as one feature or migration, to one owner with the checkpoint in its brief.
That owner delegates internally after the blocking phase.
Use parent-level fan-out for independent artifacts, such as audits, cross-subsystem investigations, or competing experiments.
Rewrite the checkpoint at phase boundaries.
Spawn a fresh owner instead of chaining interrupts.

## Tickets

File a ticket for a follow-up, separate slice, or tracker entry that the repo requires.
Use `/astack-write-ticket` when astack is installed.
Otherwise, use the tracker's feature template.
`astack-write-ticket` holds the template and its rubric.
The astack hook refuses a new issue that lacks the template's headings.

## Reply

State what you built, what you chose and why, the throughput checkpoint, and open decisions.
Use tables for design alternatives.
