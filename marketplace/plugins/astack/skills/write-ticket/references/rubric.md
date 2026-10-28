# Ticket rubric

The rubric has ten points.
Each point passes, fails or does not apply.
File a ticket only when every applicable point passes.
There is no partial credit or total score.
A failure requires a correction or a question.

Check personal data before scoring.
Reject a ticket containing a person's name, email address, phone number, customer company name or customer quote.
Replace that data with a role or ID.
Alternatively, link the source behind access control.

## Scorecard format

Give each point one line with evidence or its missing information:

```
1 Title          pass  "CSV export drops rows whose name contains a comma"
2 Problem        fail  Summary names no role. Who runs the export?
3 Outcome        pass
4 Criteria       fail  "export works properly" is not checkable
5 Scope          n/a   bug
6 Bug report     pass
7 Verification   fail  the regression check names no test or script
8 Links          pass  project set, related issue linked
9 Size           pass  one PR, 2 criteria
10 Outcome only  pass
```

## The points

### 1. The title states the outcome or the defect

Pass a feature title that names who can do what.
Pass a bug title that states the wrong behavior and its condition.
Pass a refactor, subtraction or plan-session title that uses a verb phrase, such as "Remove the in-memory export path".
Pass a decision title that states its question, such as "Which queue backs webhook retries".

Check the 80-character limit.
Exclude bracket prefixes, ticket keys, session codes and dates.
Exclude bucket words such as "Updates", "Tidy-up", "Follow-ups from", "Phase" and "Misc".
For a bug, make sure the title agrees with the reproduction steps.

Failures include "Members page updates", "[bug] Export doesn't work" and "Follow-ups from the export review".

### 2. The problem names who is affected and why it matters now

Pass `## Problem` when it names a role and the cost of waiting.
That cost can be a deadline, risk, blocked team or count.
For a bug, `## Summary` must name the affected role and frequency.
For a decision, `## Problem` must state the question and the team, phase or milestone it blocks.

Check for a role noun, such as admin, operator or API client, and a concrete impact.
For a decision, the blocked team, phase or milestone supplies the impact.
A requirements list without a problem fails.
So does a video link without context.

### 3. The outcome is observable

Pass `## Outcome` when a user or operator can confirm the result without reading code.
For a bug, apply that rule to `## Expected`.
For behavior-preserving work, accept a developer check that could fail.
Examples include a pin test or a plan session's `Proof.` command.
For a decision, require the answer's form and recorded location.
Forms can include a chosen option, measured number or ratified sketch.
"Works" or "doesn't work" alone fails.

### 4. The acceptance criteria are testable

Require at least one checkbox under `## Acceptance criteria`.
Each line must be checkable by a test, query or walkthrough as a named role.
Reject subjective words such as easy, clean, intuitive, better, properly or fast without a number.
Keep each criterion independent.
For bugs, require a regression check that fails before the fix.

"Edits are easy to spot" fails.
"Edited fields show the previous value on hover" is checkable.

### 5. Scope and non-goals are stated

Apply this point to features, umbrellas, maps and decisions.
Mark it not applicable for bugs.
Require an Out list with at least one item under `## Scope`.
Each exclusion must name something a reader could reasonably expect in scope.
Reject filler exclusions.
"Review all placeholders in the system" fails without scope limits.
Otherwise each review can add more work.

### 6. The bug report is complete

Apply this point to bugs only.
Require numbered steps from a stated starting condition.
Require `## Expected` and `## Environment`.
Require `## Actual` with error text or an evidence link.
The reader must be able to follow the steps without a question.
The title must describe their observed result.

A URL and video alone fail.
A root cause with `file:line` references also fails without steps and an expected result.

### 7. Verification is named

Require `## Verification` to name the proof and its checker.
Examples include a test suite, sign-in role, preview URL with screenshots or a metric after deployment.
The named check must be capable of failure.
"QA will test it" fails.

For bugs, use the regression check under `## Acceptance criteria` as verification.
It must name a test or script and the role or environment that reruns the steps.

A ticket rendered by `astack plan-ticket` uses a fixed checker line.
The implementer runs Verify and the reviewer checks its result.
Pass when that command can fail.

### 8. The ticket is linked

Require a project when the tracker uses projects.
Require a parent when the ticket belongs to larger work.
Link duplicates, related tickets and designs.
Do not upload designs in place of their links.
A GitHub repo without GitHub Projects needs no project.

In Linear, inspect `get_issue` with `includeRelations: true` for the project, parent and relations.
Search for duplicates before passing this point.

### 9. The ticket is right-sized

Require one independently useful outcome that one PR can deliver.
Require seven or fewer acceptance criteria.
For an umbrella or map, apply this limit to every child and require one overall parent outcome.
For a decision, require one question.

Reject session, PR or bucket checklists in the description.
Reject unrelated fixes collected in one ticket.
Split such work into an umbrella with children.
A ticket with five bugs and a polish pass fails.
So does a follow-ups ticket that grows after every review.

### 10. The ticket states the outcome, not the solution

Exclude code, `file:line` references and procedural edits outside `## Constraints`.
A prototype snippet can express a decision such as a state machine or schema.
Put that snippet under `## Constraints` with a prototype link.
The implementer must remain free to choose any approach that meets the criteria.
Record a fixed constraint with its reason under `## Constraints`.

"In `exportMembers`, wrap the name in quotes on line 88" fails.
Use a criterion such as "A name that contains a comma stays in one cell".

## When a point cannot pass

Do not invent the missing information.
Ask one requester question per failing point.
State what you would write if they agree.
Points 2, 4, 5 and 7 often need information only the requester can supply.
