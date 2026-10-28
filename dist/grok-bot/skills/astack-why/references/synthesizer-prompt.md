# Synthesizer prompt template

Fill the placeholders before you send this prompt.

---

Answer the user's why question from the investigators' historical evidence.
They searched source control, tickets, docs, chat, infrastructure, errors, analytics, and code comments.
Cite what the record supports and preserve what it cannot establish.

## The Question

> {QUESTION}

## The Code Anchor

Target files: {FILES_WITH_LINE_RANGES}

Key symbols: {SYMBOLS}

## Investigator Findings

{ALL_INVESTIGATOR_FINDINGS}

## Sources That Weren't Searched

{SKIPPED_SOURCES_WITH_REASONS}

## Epistemics Framework

Read `references/epistemics.md` in full before you write.
Follow these rules:

1. Give every claim one tier: `Direct`, `Supported`, `Inferred`, `Speculative`, or `Unknown`.
   Match its section and wording to that tier.
2. Cite every Direct or Supported claim with a PR, ticket, URL, permalink, commit, or `file:line`.
3. Qualify Inferred and Speculative claims.
   Use terms such as `appears to`, `likely`, `suggests`, or `one possibility is`.
4. Never use code as evidence of its own intent.
5. Record gaps without invented explanations.
6. Test a hypothesis from the user's question as a candidate, not an accepted answer.

## Instructions

1. Read every investigator result and weigh its evidence yourself.
   Investigators return material, not final conclusions.
2. Merge repeated references to the same PR, ticket, or doc into one clear citation.
3. Show conflicting items together instead of choosing a preferred account.
4. Find each claim's evidence and confidence tier.
   State Direct evidence plainly with a citation.
   Explain an inference and qualify it.
   Label speculation and put claims without evidence in gaps.
5. Check uncertain citations against source or MCP tools.
   Verify that the item exists and supports the claimed text.
   Do not write files, commit, or change external state.
6. Leave unanswered questions open.
   Do not turn weak evidence into a confident answer that the user might act on.

## Output Format

Use this exact structure.

---

### The Question

Restate the question in one or two sentences.

### The Code in Question

Give file paths, line ranges, and key symbols in two or three lines.

### What We Found

Give claims with textual evidence and precise citations:

- `[Direct]` {Claim}. Source: [PR #123](url), ticket ID, or file:line. {Short quote or paraphrase.}
- `[Supported]` {Claim}. Evidence: {items and each item's contribution}.

`[Direct]` means explicit evidence from one source.
`[Supported]` means several indirect items converge on a conclusion.

### What We Can Reasonably Infer

For each interpretation, show the evidence and reasoning step.
Use qualified wording such as `appears to`, `likely`, `suggests`, or `is consistent with`.

- `[Inferred]` {Qualified claim}. Reasoning: {specific evidence and inference step}.

Omit this section if there is nothing to infer.

### Competing Hypotheses

When several explanations fit, present them without forcing a winner.
For each one, give:

- Hypothesis: {one sentence}
- Evidence for: {specific items}
- Evidence against or missing: {counterevidence or unmet conditions}

Omit this section when the record supports one clear answer.

### What We Don't Know

Name specific gaps instead of a general statement of uncertainty.
For each missing reason, give searched sources and exact queries.
Include unanswered questions, empty searches, unavailable sources with reasons, and people who might know but are unavailable to ask.

### Sources Consulted

Report actual coverage so the user can redirect the search.
Use one line for each investigator or skipped category:

- Source control history: files, commit count, PR numbers, and searched comments.
  If absent, report the gap explicitly because git and `gh` are expected sources.
- Issue / ticket tracker: ticket IDs and queries, or the reason it was not searched.
- Long-form documents: titles and queries, or the reason it was not searched.
- Real-time team chat: channels, time ranges, and queries, or the reason it was not searched.
- Infrastructure observability: dashboards, monitors, metrics, logs, traces, or incidents, or the reason it was not searched.
- Error / exception tracking: issues, events, or releases, or the reason it was not searched.
- Product analytics warehouse: fully qualified tables, time windows, and relevant counts, percentiles, or first-seen and last-seen times.
  If absent, give the reason it was not searched.

For a missing MCP, state that no matching source was available in this environment.
Do not report unavailable access as an empty search.

### Confidence Summary

Use one or two sentences to state overall confidence and material limits.
Distinguish direct reasons, inferred thresholds, and unanswered questions.
Name absent evidence or unavailable categories that limit the answer.

---

## Check before returning

1. Give every `What We Found` claim a citation or move it to inference or hypotheses.
2. Match wording to tiers.
   Direct claims can assert a reason, while inferred claims need qualification.
3. Preserve every observed contradiction.
4. Check that `What We Don't Know` names real gaps.
   If it is empty, verify that coverage supports that result.
5. Test the user's suggested explanation against evidence.
6. Remove code-only claims about intent.
7. Reduce confidence when evidence is weak.

The reader must be able to distinguish facts, interpretations, and missing evidence.
Make the answer useful for follow-up with the author, engineering lead, or product owner.
Do not make it sound more decisive than the record permits.
