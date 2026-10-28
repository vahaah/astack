# Technical writing

Write so a tired engineer understands on the first read.
Apply all four layers below.
Three rules take precedence over those layers:

- Remove a word when the sentence keeps its meaning without it. Replace "in order to" with "to". Delete "it is important to note that".
- Prefer short everyday words. Use "use", "help" and "do" rather than "utilize", "facilitate" and "perform". Keep a longer word only when its precision justifies it.
- If a rule makes a sentence worse, find another wording or leave the sentence unchanged. A mechanical result has failed the writing task.

Use the codebase's vocabulary.
Write the actual symbol, file, flag or command rather than a synonym.
Use words that a developer would say aloud.
Do not invent jargon.
Prefer "move", "delete" and "a budget that only decreases" over "evacuate", "ratchet" and "endgame".
Define an established pattern when first naming it.
If you find a new abstract metaphor, propose its plain replacement in your reply with the diff.
Propose that addition for `unslop`'s abstract-metaphor rule.
Do not edit that catalog as part of the writing review.

## Vary the rhythm

Correct prose can still sound mechanical when every sentence has the same length or lacks a specific point.

- Vary sentence length. Use short sentences for emphasis. Use longer sentences for a fact with its condition or consequence.
- Keep one thought per sentence without forcing one sentence length. Split separate thoughts. Keep one longer thought together when it remains clear.
- In explanation, assess trade-offs instead of listing options without judgment. Keep reference material factual.
- Name a concrete effect. Prefer "a column rename fails the build" over "schema changes can cause issues".

## Pick the mode first (Diátaxis)

Give each document one mode.
Choose whether it serves action or understanding.
Then choose whether it serves learning or work.

| Purpose | Learning | Work |
|---|---|---|
| Action | Tutorial | How-to |
| Understanding | Explanation | Reference |

Apply this choice to a whole document or an individual sentence.

### Tutorial

Teach through visible action.
The author is responsible for the learner's success.
Open with what the learner will build.
Each step must produce a visible result early and often.
State the expected output, prompt change or log line.
Keep explanation to one clause and a link.
Use concrete commands in "we" form, such as "First, do x. Now, do y."

### How-to

Solve the person's task rather than demonstrate a machine operation.
Assume competence.
Keep steps focused on action.
Link background, digressions and completeness material elsewhere.
Permit choices and judgment with conditions such as "If you want x, do y."
Name the task, such as "How to calibrate the radar array", rather than "Radar array calibration".

### Reference

Describe facts for lookup.
Exclude instructions, persuasion and opinion.
State facts, options, limits and errors without hedging.
Mirror the structure of the thing described.
Place material where readers expect to find it.
Generate it from code when possible.

### Explanation

Explain one bounded topic that readers can understand away from the product.
The title must make sense after an implied "About".
Start from a concrete why question.
Include relevant design decisions, history, constraints and alternatives.
Opinion belongs in explanation rather than the other modes.

Keep modes separate.
Link reference tables from tutorials instead of embedding them.
Keep tutorial guidance out of reference.
Keep arguments out of how-to procedures.

## Write sentences to the reader (Google developer style)

- Address the reader as "you" in the present tense. Reserve "will" for an actual later event.
- Name the actor and action, such as "the compiler checks". Use passive voice only when the actor is unknown or irrelevant.
- Write instructions as commands, such as "Click Submit". State facts directly. Avoid "should be done".
- Put the condition before its action. For example, "To delete the document, click Delete."
- State the common case first. Put exceptions after it.
- Use ordinary, informed speech. Exclude buzzwords, figurative language and "please" from instructions. Exclude "simply", "easy" and "quickly" from procedures.
- Do not announce future support in advance. Vary the opening phrase of consecutive sentences.
- Use descriptive link text, such as a page title. Never use "click here". Prefer a short local explanation when it avoids another lookup.
- Give headings the main point. Use sentence case, one h1 and consecutive heading levels. Use verb phrases for tasks and noun phrases for concepts.
- Number sequences. Use bullets for other lists. Introduce each list with a complete sentence. Keep entries parallel.
- Format code as code. Bold UI element names. Use serial commas. For an incomplete list, state that limitation instead of adding a Latin abbreviation.

## Load statements one at a time (STE rules)

- Give each sentence one instruction or one thought.
- Limit instructions to 20 words. Limit descriptions to 25 words.
- Put a warning or condition before the protected action. For example, "If hot oil touches your skin, injuries can occur."
- Keep articles. "Remove the backup file" is clearer than "Remove backup file".
- Give each word one meaning and role. If check means inspect, do not also use it to mean restrain.
- Use one word for an action throughout the document. Keep start rather than alternating it with initiate.
- Write direct commands rather than passive narration. Use "Install the component" rather than "the component must be installed".
- Avoid words ending in "-ing" where possible.

## Prevent ambiguous readings (Global English)

- Place only and not next to the words they modify. "Only fails on growth" differs from "fails only on growth".
- Break long noun strings into phrases that state their relationship. Use "the script that checks the proto-import budget".
- Give every pronoun one clear referent. Repeat the noun when necessary. Do not use this or which for an entire preceding clause.
- Keep verbs in parallel clauses. State what Phase 2 does instead of relying on Phase 1's verb.
- Keep structural words such as that. "Make sure that the switch is off" is clear. Do not reduce clarity for word count.
- Repeat articles when they distinguish separate objects. "The client and the host" identifies two things.
- Clarify the grouping of and and or. Use both, either or an explicit if-then form when needed.
- Use periods instead of semicolons. Replace a long dash with a new sentence.
- Make parenthetical text grammatical or give it a separate sentence. Do not form plurals with "(s)".
- Replace prose slashes with explicit choices. Write "a, b, or both".
- Give each thing one name throughout the document. Do not alternate gate, ratchet and budget check for the same object. Preserve correct existing wording when the meaning has not changed.
- Exclude idioms, colloquialisms, Latin abbreviations and metaphors.

## Voice and repo specifics

- Apply `write-docs` and its `unslop.md` catalog to each document. The catalog owns AI vocabulary, filler, hedging and formatting patterns.
- Apply every layer except Diátaxis to PR bodies and commit messages. Keep a PR body readable within one minute. Link long logs, SHA lists and metric tables rather than pasting them.
- Use the product's copy guidelines for UI strings. They are not documentation.
- Indent code snippets with tabs. Use real paths. Verify every count and tree at the landing commit. Include the command that regenerates it.

## Worked example

Before:

> Configuration of the proto import ratchet budget script parameters is performed via budget.json. Note that it's important to remember that running with --write, which updates the committed budget to reflect the current count, should only be done when lowering it. If exceeded, CI fails.

After:

> `budget.mjs` reads the committed budget from `budget.json` and counts the files that import protos. If the count exceeds the budget, CI fails. Run `budget.mjs --write` only to lower the budget.
