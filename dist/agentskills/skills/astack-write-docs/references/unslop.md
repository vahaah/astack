# Unslop

Remove AI writing patterns from text.
Inspect the patterns below.
Rewrite affected passages while preserving meaning and the intended tone.

## Patterns to detect and fix

Rule numbers are stable IDs used by other skills.
Leave a gap when removing a rule.

### Content

3. Remove superficial phrases ending in "-ing". Examples include "highlighting", "ensuring", "reflecting", "showcasing" and "fostering". Delete them or replace them with sourced facts.
5. Replace vague attributions such as "Experts believe", "Industry reports suggest" and "Some critics argue" with a named source. Otherwise delete the claim.

### Language

7. Replace AI vocabulary with plain words. Examples include "additionally", "crucial", "delve", "enduring", "enhance", "fostering", "garner", "interplay", "intricate", "pivotal", "showcase", "testament", "underscore" and "vibrant". Also remove abstract uses of "landscape" and "tapestry".
8. Prefer is or has to ornate substitutes such as "serves as", "stands as", "boasts" and "features".
9. State the point directly instead of using "Not just X, but Y".
10. Use the natural number of items. Do not force ideas into groups of three.
11. Give each thing one name. Do not cycle between protagonist, main character, central figure and hero for the same person.
12. Use "from X to Y" only for a meaningful scale. Otherwise list the topics directly.

### Style

13. Remove long dashes. Use periods or commas. Do not substitute parentheses, shorter dashes or hyphens. End a separate thought with a period.
14. Use a colon before a list or example, rather than as a sentence connector. Replace comparison scaffolding with the direct point. For example, state that plain English describes when the scheduler must fire.
15. Use bold text selectively. Do not bold every proper noun or acronym.
16. Replace inline bold-label lists with prose when the label repeats the sentence. "Performance: Performance improved" repeats itself. A lead-in that names an item and adds new detail can remain. For example, "Schema in TypeScript. Tables live in one file."
17. Use sentence-case headings.
18. Remove decorative emoji from headings and bullets.
19. Use straight quotation marks.

### Communication artifacts

20. Delete chatbot phrases such as "I hope this helps!", "Let me know if", "Of course!", "Certainly!" and "Found the smoking gun!".
22. Answer directly. Remove flattery such as "Great question! You're absolutely right!".

### Filler

23. Replace "in order to" with "to" and "due to the fact that" with "because". Delete "it is important to note that".
24. Reduce stacked hedges such as "could potentially possibly be argued that it might" to one accurate word, such as may.
25. Replace generic conclusions such as "The future looks bright" with specific facts or plans.

### Jargon

26. Replace abstract metaphors with concrete words. Examples include "substrate" with base, "wedge in" with add, "vector" with way or method, and "evacuate" with move out. Inspect "wedge", "locus", "vantage", "nexus", "primitive" as a noun, "API surface", "bedrock", "modality", "paradigm", "north star" and "flywheel". Also inspect figurative uses of "harness" and "scaffolding". Replace "gold-plating" with more than the job needs. For a figurative ratchet, use the mechanism's actual name or a limit that only tightens. Replace "endgame" with the last phase.

### Plain speech

27. State the mechanism or number rather than a feeling. Replace "the database stays close at hand", "SQL you can read" and "types that follow your schema" with concrete facts. Examples include "`.toSQL()` returns the exact string sent to the database" and "a column rename fails the build". Ask what the sentence tells the reader to do or know. Remove it when no concrete instruction or fact remains. Remove generic sentences that could appear unchanged in another project's documentation.
28. Split a sentence that requires rereading. Give each sentence one idea. Remove clauses when splitting does not solve the problem.
29. Prefer active voice. Look for is, are, was or were followed by a past participle. Name the actor, such as "the compiler validates queries". Use passive voice when the actor is unknown or irrelevant.
30. Remove adverbs or replace weak verbs. Replace "runs quickly" with a measured result or "is fast". Replace "significantly improves" with the measured change.
31. Prefer plain words. Replace "utilize" and "leverage" with use, "facilitate" with help, "numerous" with many, and "in the event that" with if.
32. Replace mannered prose with literal language. Inspect aphorisms, rhetorical fragments, personified code, figurative verbs and stock framing. Examples include "wire it or delete it", "the plan holds it", "rides along", "stands on" and "a dial worth turning". Replace the last example with "a parameter worth varying". Rule 26 covers metaphor nouns.
33. Restore articles, verbs and full sentences in compressed prose. Remove symbol-based shorthand and unexplained abbreviations. For example, state that the parser rejects a bad date, exits with code 2 and writes nothing. Make readers read rather than decode.
