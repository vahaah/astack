# Domain docs

These rules describe how engineering skills use the repo's domain documents during exploration.

## Read domain documents before exploration

- Read the root `CONTEXT.md` for a repo with one context.
- If a root `CONTEXT-MAP.md` exists, read it first. Read each linked `CONTEXT.md` relevant to the topic.
- The glossary is `GLOSSARY.md` instead when the repo already uses that name. Keep its existing `GLOSSARY-MAP.md` map name.
- Read relevant ADRs in `docs/adr/`. In a repo with multiple contexts, also inspect `src/<context>/docs/adr/`.

Proceed silently when these optional files do not exist.
Do not report their absence or propose empty files in advance.
`/astack-domain-modeling` creates them when the discussion resolves a term or a qualifying decision.
`/astack-grilling` and `/astack-improve-codebase-architecture` can invoke that skill.

## File structure

A repo with one context normally uses this layout:

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

A repo with a root `CONTEXT-MAP.md` uses multiple contexts:

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← system-wide decisions
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← context-specific decisions
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## Use the glossary's vocabulary

Use each term as `CONTEXT.md` defines it whenever you name a domain concept.
This includes issue titles, refactor proposals, hypotheses and test names.
Avoid synonyms that the glossary rejects.

If a concept is absent, check whether you invented language that the project does not use.
Reconsider an invented term.
Record a real vocabulary gap for `/astack-domain-modeling`.

## Flag ADR conflicts

State explicitly when your output contradicts an ADR.
Explain why the decision needs reconsideration instead of silently replacing it.
For example, "This contradicts ADR-0007 on event-sourced orders. The new constraint justifies reopening that decision."
