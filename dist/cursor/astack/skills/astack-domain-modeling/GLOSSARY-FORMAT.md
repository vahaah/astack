# CONTEXT.md format

## Structure

```md
# {Context Name}

{One or two sentence description of what this context is and why it exists.}

## Language

**Order**:
{A one or two sentence description of the term}
_Avoid_: Purchase, transaction

**Invoice**:
A request for payment sent to a customer after delivery.
_Avoid_: Bill, payment request

**Customer**:
A person or organization that places orders.
_Avoid_: Client, buyer, account
```

## Rules

- Pick one term for each concept. List competing terms under `_Avoid_`.
- Define what the concept is in one or two sentences. Do not replace its definition with a list of actions.
- Include only terms specific to the project's domain. Exclude general programming concepts such as timeouts, error types and utility patterns.
- Before adding a term, check whether it belongs to this context rather than general programming.
- Group related terms under subheadings when useful. Keep a flat list when all terms belong to one area.
- Add `_Code_: <symbol>` after a term that maps to one code symbol. The symbol name is not an implementation detail.

## Single and multiple contexts

A repo with one context has one root `CONTEXT.md`.
A repo with multiple contexts has a root `CONTEXT-MAP.md`.
The map lists each context, its location and its relationships:

```md
# Glossary Map

## Contexts

- [Ordering](./src/ordering/CONTEXT.md): receives and tracks customer orders
- [Billing](./src/billing/CONTEXT.md): generates invoices and processes payments
- [Fulfillment](./src/fulfillment/CONTEXT.md): manages warehouse picking and shipping

## Relationships

- **Ordering → Fulfillment**: Ordering emits `OrderPlaced` events; Fulfillment consumes them to start picking
- **Fulfillment → Billing**: Fulfillment emits `ShipmentDispatched` events; Billing consumes them to generate invoices
- **Ordering ↔ Billing**: Shared types for `CustomerId` and `Money`
```

Use the existing files to select the structure:

- If `CONTEXT-MAP.md` exists, read it to locate the contexts.
- If only a root `CONTEXT.md` exists, use one context.
- If neither exists, create a root `CONTEXT.md` when you resolve the first term.

For multiple contexts, select the context that matches the topic.
Ask when the topic does not identify one clearly.
