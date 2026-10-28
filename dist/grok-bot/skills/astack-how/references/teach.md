# Teach

Explain what a thing is, how it works, and why it has that shape.
Follow the person's pace.
The goal is understanding without changes to the product.

Read `../SKILL.md` and the path from `astack skill-path astack:why`.
Follow both skills in full from this thread because only the user can invoke them by name.
Combine their findings into one plain explanation.
You may reword freely for teaching, but preserve `why`'s confidence language.
Its uncertainty is part of the evidence.

## Choose what to explain

Use the conversation to identify the person's purpose and existing knowledge.
They may plan a change, review code, debug behavior, or learn the subsystem.
Do not quiz them about facts already available in context.
Skip what they already know and give depth to their question.

Read code to get oriented, then let `how` and `why` investigate.
Do not repeat their work.
For a subsystem, run both in parallel with their first spawns in one message.
For a small change, one may suffice.

Keep `why` narrow unless the reasons are the point of the question.
Put the limit in its request, such as git plus one or two named sources.
`why` must record skipped categories under its own contract.

## Start with the definition

Name the thing with its common term and say what it is.
Then connect it to this repo and explain its behavior, reasons, and edge cases.
Walk through the user's action when that makes the behavior clearer.
A list of functions and constants is reference material, not a teaching explanation.

Give the smallest complete answer first, usually one or two sentences.
Then stop and let the person respond.
Add detail when they ask.
Do not print framing labels, previews, or stock summaries.

## Follow the person's pace

Keep the exchange conversational.
Offer more depth or another topic, then follow their choice.
Do not quiz them or ask them to repeat the explanation.
Do not print `Pause` or announce which sentence they must understand.
Do not label a part as important or difficult.
When a pause is useful, stop the response.

For a one-shot run without a live human, give a complete explanation.
Put any offer of more detail at the end.

## Show each relationship

Open the diff, source, or debugger when it explains the point faster.
Use a diagram when it helps more than prose.

For three or more moving parts, use a short series of diagrams.
Redraw the last diagram and add one part at each step.
Do not introduce all parts at once or save the only diagram for the end.

For A to B to C, first draw A to B.
Then redraw it with C.
Then add the return path or next part.

Use mermaid when labels explain a flow or structure.
For layout, overlap, scroll position, or before-and-after state, draw a simple SVG sketch with short labels.
Publish the sketch with the Artifact tool when available.
Otherwise use a small ASCII sketch in a code block.
Add parts in steps for sketches too.
A single simple point needs no figure.

## Use plain prose

Follow `astack-write-docs` and `astack skill-path astack:write-docs references/unslop.md`.
Write as you would speak to a colleague.
Keep the mechanism and remove filler.
Preserve necessary confidence limits.
Do not replace a mechanism with a metaphor or preview.

For example, virtualization can render visible items separately from loading their data.
When an item leaves the buffer, the app can remove both its DOM node and loaded data.
That explains the mechanism directly.

Use normal sentence case, periods, and at most one or two commas per sentence.
Split clauses that accumulate.
Give each concept one name.
Avoid mirror sentences and polished closing claims.
Treat these instructions as directions, not headings to print.

Reply with the explanation itself.
Lead with the main point, then explain what it is, how it works, and why.
Name useful follow-up questions for `how` or `why`.
