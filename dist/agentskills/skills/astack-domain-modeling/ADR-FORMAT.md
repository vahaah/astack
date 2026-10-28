# ADR format

ADRs live in `docs/adr/`.
Their file names use sequential numbers, such as `0001-slug.md` and `0002-slug.md`.
Create the directory when the first decision needs an ADR.

## Template

When `astack-write-docs` is available, load it and use its ADR format.
The title states a claim that becomes true when the decision takes effect.
Number decisions `D1`, `D2` and onwards.
Cite them as `ADR NNNN D2`.
Add an index entry to `docs/adr/README.md`.
Both formats use the same three tests below.

When `astack-write-docs` is unavailable, use this minimum format:

```md
# {A claim that is true once the decision is in force}

{1-3 sentences: what's the context, what did we decide, and why.}
```

One paragraph can be enough.
Record the decision and its reason.
Do not add sections only to fill a template.

## Optional sections

Add an optional section only when it contributes useful information.
Most ADRs need none.

- Status frontmatter can help when a decision changes later. Use `proposed | accepted | deprecated | superseded by ADR-NNNN`.
- Considered Options records rejected alternatives when their rejection needs a lasting explanation.
- Consequences records downstream effects that a reader would not expect.

## Numbering

Find the highest number in `docs/adr/`.
Use that number plus one.

## When to offer an ADR

All three conditions must hold:

1. A later reversal would cost substantial work.
2. A future reader would find the code surprising without the reason.
3. The decision chose between real alternatives for specific reasons.

Skip an easily reversed decision.
Skip an obvious choice that needs no explanation.
Skip a choice with no real alternative.

### What qualifies

- A system structure can qualify. Examples are a monorepo and an event-sourced write model with a Postgres read projection.
- Communication between contexts can qualify. One example uses domain events between Ordering and Billing instead of synchronous HTTP.
- A technology choice can qualify when replacement would take a quarter. Examples include a database, message bus, auth provider or deployment target.
- Ownership and scope can qualify. One example gives the Customer context ownership of customer data and permits other contexts to hold IDs only.
- A deliberate departure from the expected approach can qualify. One example chooses manual SQL over an ORM for a specific reason.
- A constraint absent from the code can qualify. Examples prohibit AWS for compliance or require responses under 200ms for a partner contract.
- A rejected alternative can qualify when the reason is not obvious. Record subtle reasons for choosing REST over GraphQL before someone proposes GraphQL again.
