---
name: "astack-to-questionnaire"
description: "Create a questionnaire for someone whose knowledge the user needs to make a decision."
license: "MIT"
metadata:
  astack-version: "0.1.0"
  source: "astack, adapted from mattpocock/skills"
  disable-model-invocation: "true"
---

# Create a questionnaire

Create a Markdown questionnaire for one recipient who knows something the user cannot answer alone.
The user can send it for asynchronous answers or complete it with the recipient during a meeting.

Interview the user about the recipient and the information they need back.
Do not interview them about the subject they cannot answer.
Write questions that connect the recipient's knowledge to the user's decisions.

1. Ask about the recipient's role, expertise and relationship to the user in one exchange. Use those facts to choose the tone and required context. Finish this step when you know what the recipient knows that the user does not.

2. Ask which specific decisions or facts the user needs from that person in one exchange. Finish with a concrete list of actions or decisions the answers must permit.

3. Write questions for every need identified in step 2. Follow the document structure below. Save `to-questionnaire-<slug>.md` in the current directory, using a slug from the topic. In a repo, save it under `docs/plans/` instead. Report the path. Finish when the file exists and a question covers every need from step 2.

## Document structure

Write a discovery questionnaire for a recipient who has context the user lacks.
Put the most important questions first, because asynchronous answers may permit only one exchange.
When there are more than a few questions, group them by theme under `##` headings.
Keep one idea in each question.
Place an answer stub immediately below it.
Explain why the question matters only when it could be misunderstood or receive an unhelpful answer.
Use this template:

<questionnaire-template>

```markdown

# <Questionnaire title>

**Purpose:** why this questionnaire exists and the decision riding on it.

**From:** <the user>, **To:** <the recipient>, **How your answers will be used:** <where they go>

## Context

One paragraph orienting a recipient who wasn't in the user's head. Enough to answer well, not a page.

## How to answer

Deadline and rough effort. Partial answers and "I don't know" are useful: flag anything you're unsure of rather than skipping it.

## <Theme heading>

One `##` section per theme. Under each, its questions, most-important-first. Every question is one idea, never compound, with an answer stub directly beneath, and a one-line _why this matters_ only where the question could be misread or invite a throwaway answer.

<question-example>
### What load is the system expected to handle at launch?

_Why this matters: it decides whether we provision for burst traffic now or defer it._

>
</question-example>

## Anything else?

A closing catch-all: anything we didn't ask that we should know?

```

</questionnaire-template>
