# Epistemics

Code shows behavior, but it does not prove why that behavior exists.
Reasons can appear in commits, PRs, tickets, docs, and conversations.
Those records can be incomplete, biased, missing, or contradictory.
Match confidence to the actual evidence.

## Assign one confidence tier

Every claim needs one tier.
That tier determines its section and wording.

### 1. Direct

An explicit written source answers why.
It must state the reason instead of leaving you to infer intent from code.

Examples include an author's PR description of a pagination defect or a ticket that names a required customer request.
A code comment can state an upstream API limit.
A design doc can state why persistence ruled out an alternative.
A chat message can explain why unreliable tests caused a change.

Use confident present-tense wording with a citation beside the claim.
For example, "This exists because X."

### 2. Supported

Several indirect items converge on the same conclusion without one source stating it explicitly.
A performance PR, a performance label, and changes to one hot path can support the same reading.
Several tests for large inputs can provide another pattern.
An author's related commits can connect work to an incident.

State that the conclusion comes from combined evidence.
Cite each item and explain its contribution.
For example, "The evidence points strongly to X: [the specific pieces]."

### 3. Inferred

This is a reasonable interpretation of context without explicit support for the conclusion.
It remains your reading of the record.

An error's production timing and a same-day merge can suggest a hotfix.
A retry count can match a convention elsewhere without proving why the author chose it.

Use qualified wording and show the reasoning.
For example, "Given A and B, C seems likely because D."

### 4. Speculative

This is a plausible hypothesis with weak evidence and equally plausible alternatives.
Present it when it could help the user identify the reason, but label the uncertainty.

For example, a browser workaround may relate to an old bug without a record from that time.
A threshold may match an SLA without a document that connects them.

Use wording such as "One possibility is X, but we have no direct evidence."
Place these claims with other `Competing Hypotheses`.

### 5. Unknown

You searched and found no answer.
That is a valid result.
Name the sources, queries, and coverage.

For example, "We searched X, Y, and Z and found no evidence of why."
A useful report identifies the actual tickets, PR range, or literal-value search that returned no reason.
An unexplained statement that you could not find out is less useful.

## Match words to confidence

Words that assert intent or success need Direct or Supported evidence and an adjacent citation.
These include `because`, `the reason is`, `was designed to`, `fixes`, `addresses`, `solves`, and `the team decided`.
Do not use those assertions to present an inference as fact.

Qualify interpretation in `What We Can Reasonably Infer`.
Useful terms include `appears to`, `seems to`, `likely`, `suggests`, `is consistent with`, and `one reading is`.
Other options include `plausibly`, `may have been`, and `the evidence points toward`.
Preserve these limits when you edit the answer.

Avoid claims introduced with `obviously`, `clearly`, or `of course`.
Avoid dismissive `just` and personal-belief framing such as `I think` or `I believe`.
Describe what the evidence suggests instead.

## Do not invent reasons

Do not justify code from its current apparent usefulness.
The original reasons may be obsolete or wrong.
Do not assume that the author chose the right design and work backward to defend it.
A repeated pattern may come from copied code rather than a decision.
Missing evidence does not prove that a concern never existed.

## Test the user's hypothesis

A user can suggest a reason in the question, such as performance.
Treat that reason as one candidate.
Check it independently instead of confirming it by default.
If evidence supports it, cite that evidence.
If not, state the limit and present what the record supports.

## Preserve contradictions

Show conflicting sources with both citations.
Do not choose the account that makes the story simpler.
A ticket can name a business requirement while a PR describes code cleanup.
Both may explain the work, or one may be wrong.
Let the user assess that conflict.

## Name missing evidence

An unknown answer tells the user where the record ends.
It can identify a useful next person to ask, such as the author, product owner, or team lead.
The user can also decide that further investigation has too little value.

For each gap, name the question, searched sources, queries, and result.
Distinguish no results from unrelated results.
Do not fill a gap with a confident guess that could drive a wrong decision.

## Check the final answer

Before delivery, check every claim in `What We Found` and `What We Can Reasonably Infer`.
Attach its citation or move it to inference or hypotheses.
Make its wording match the tier.
Do not use code as proof of its own intent.

Include `What We Don't Know`.
If that section has no gaps, check whether the record is unusually complete or the investigation omitted a limit.
