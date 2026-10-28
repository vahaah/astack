---
name: "astack-domain-modeling"
description: "Build a project domain model. Use when you discuss terminology, change CONTEXT.md, or record or edit an ADR."
metadata:
  astack-version: "0.1.0"
---

# Domain modeling

Build the domain model during design work.
Challenge unclear terms.
Test relationships with concrete edge cases.
Record each resolved term and qualifying decision when the discussion settles it.
Reading an existing glossary for vocabulary does not require this skill.

## File structure

Most repos have one context:

```
/
├── CONTEXT.md
├── docs/
│   └── adr/
│       ├── 0001-event-sourced-orders.md
│       └── 0002-postgres-for-write-model.md
└── src/
```

A root `CONTEXT-MAP.md` identifies a repo with multiple contexts.
The map links each context to its files:

```
/
├── CONTEXT-MAP.md
├── docs/
│   └── adr/                          ← system-wide decisions
├── src/
│   ├── ordering/
│   │   ├── CONTEXT.md
│   │   └── docs/adr/                 ← context-specific decisions
│   └── billing/
│       ├── CONTEXT.md
│       └── docs/adr/
```

Create a missing glossary when you resolve the first term.
Create `docs/adr/` when the first decision needs an ADR.
Do not create empty files in advance.

Use `CONTEXT.md` for the glossary.
If the repo already has a `GLOSSARY.md` and no `CONTEXT.md`, keep `GLOSSARY.md`. In that case, use `GLOSSARY-MAP.md` wherever this skill names `CONTEXT-MAP.md`.

## During the session

### Check terms against the glossary

Flag a term that conflicts with `CONTEXT.md` as soon as the user uses it.
State the existing definition and the conflicting meaning.
Ask the user which meaning applies.
For example, "The glossary defines cancellation as X. Do you mean X or Y?"

### Resolve unclear terms

Propose one precise term when a word has several meanings.
For example, "Does account mean Customer or User? Those are separate concepts."

### Test concrete scenarios

Test each proposed domain relationship with specific scenarios.
Include edge cases that expose unclear limits between concepts.

### Check claims against the code

Check the code when the user states how the system works.
Report a contradiction and ask which behavior is correct.
For example, "The code cancels whole Orders. Does the model also permit partial cancellation?"

### Update the glossary immediately

Update `CONTEXT.md` as soon as a term is resolved.
Use [GLOSSARY-FORMAT.md](./GLOSSARY-FORMAT.md).
Do not collect resolved terms for a later batch.

Keep `CONTEXT.md` as a glossary.
Exclude specifications, scratch notes and implementation decisions.
A term can end with `_Code_: <symbol>` to identify its code symbol.
That optional line is the only content beyond the term's definition and vocabulary guidance.

### Offer ADRs only when needed

Offer an ADR only when all three conditions hold:

1. A later reversal would cost substantial work.
2. A future reader would find the code surprising without the reason.
3. The decision chose between real alternatives for specific reasons.

If any condition fails, do not offer an ADR.
Use [ADR-FORMAT.md](./ADR-FORMAT.md) for a qualifying decision.
