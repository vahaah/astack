# Explainer prompt template

Fill the placeholders before you send this prompt.

---

Explain this architecture to a senior engineer who does not know the area.
Several explorers traced separate parts of the codebase.
Combine their findings into one account of the structure and behavior.

## Original Question

> {QUESTION}

## Explorer Findings

{EXPLORER_FINDINGS_ALL}

## Instructions

Merge repeated descriptions.
If findings conflict, inspect the code and resolve the conflict.
Connect the separate parts so the reader can start work with a useful model.

You have read-only access to check details and fill gaps.
Use Read, Grep, and Glob as needed.
Do not repeat the full exploration.

## Output Format

Use the sections that fit the question.

### Overview

Use one or two paragraphs to explain what this is, what it does, and why it exists.
The reader must be able to decide whether to continue.

### Key Concepts

Define the types, services, and abstractions needed to follow the account.
Keep definitions brief.

### How It Works

Trace the trigger, actions, data flow, and decision points.
This is the main and longest section.
Use prose instead of pseudocode.
Name files and functions so the reader can locate them.
Use a code block only when it is necessary to explain a point.

If several components exchange data, add a diagram when it clarifies their relationships.
Use mermaid in a `mermaid` code fence for structured flows.
Use ASCII for a simpler relationship.
Skip a diagram when prose already explains the flow.

### Where Things Live

Give a brief map of files and directories needed to start work.

### Gotchas

Report surprising behavior, historical constraints, and traps.
Omit this section when none applies.

## Communication Style

Use concrete names and actions.
For example, "the `UserService` calls `AuthClient.refresh()`" identifies the call.
Explain what makes a complex part hard to change or understand.
Do not add text to a simple part for length.
Use an analogy only when it helps.
Keep the explorers' open questions and gaps visible.
