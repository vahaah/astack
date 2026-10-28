# Bug fix

You own the task, plan, review, and verification.
Delegate investigation and the fix to subagents.
Stay in the lead.
Choose each subagent's model and effort for the job under the Subagents rules.

When astack is installed, load `astack:coding-guide` and `astack:coding-rules` with the Skill tool before step 1.
Follow the coding guide's daily workflow.
Tell each delegate to load `astack:coding-rules` before its first edit.
Its root-cause and failing-check rules apply through steps 2 to 5.

Tie every shipped line to runtime evidence.
A change that "might help" is a hypothesis, not a fix.
Do not ship it.
When evidence refutes a hypothesis, revert the changes that it motivated.
Ship only the smallest change that the evidence justifies.

1. Reproduce the failure yourself on the matching surface through the control skill from Non-negotiables. This rule takes priority over a debug or instrumentation protocol that asks the user to reproduce it. First drive the control surface as far as it can go. Ask the user only when that surface still cannot reach the target. State the specific reason. If direct reproduction fails, synthesize the trigger, tighten the conditions, or instrument until the failure occurs.
2. Find the cause through binary search. Form candidate hypotheses. Use `how` over the affected subsystem and `why` for regression history to inform them. On each pass, choose the split that removes the most remaining possibilities. Get runtime evidence. Eliminate refuted hypotheses until one remains. When state is unclear, instrument or log it while the code runs. Read the actual results instead of guessing. Use `/loop` for a long or stubborn investigation. Confirm the surviving mechanism with runtime evidence before the architect/interrogate fan-out in step 3.
3. Plan the fix. If it crosses a function boundary, use `architect` first. Delegate implementation to a subagent with a specific scope. Use the configured bug-fix model, which defaults to `sonnet`.
4. Verify on the same surface. The original reproduction must now pass. Flag an inconclusive result or a result from the wrong surface. Neither is a pass. Unit tests show branch behavior, not the absence of the bug.
5. Run the failing check before the fix. Record its output. Commit the failing check together with the fix, so every commit is green. Use `astack:tdd` when the bug has a cheap, correct local test path. Skip that test path when it is expensive, needs extensive integration, or is unclear. Follow [Sequence Work into Verifiable Units](../../principles/references/sequence-verifiable-units.md). Show the failing run before the passing run in Verification.
6. Run Opening a PR.

## Tickets

File a ticket when the tracker lacks one or part of the fix must wait.
Use `/astack:write-ticket` when astack is installed.
Otherwise, use the tracker's bug template.
`astack:write-ticket` holds that template and its rubric.
The astack hook refuses a new issue that lacks the template's headings.

## Reply

State what was broken, its root cause, the fix, and how you verified it.
Paste the failing reproduction output, then the passing output, verbatim.
