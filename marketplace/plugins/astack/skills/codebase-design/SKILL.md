---
name: codebase-design
description: "Use a shared vocabulary to design deep modules. Apply it to module interfaces, deepening candidates, seam placement, testability, and code that agents must navigate. Other skills use it as a design reference."
---

# Codebase Design

Design deep modules with substantial behavior behind a small interface.
Place the interface at a clear seam and test through it.
Use this vocabulary whenever you design or restructure code.
Depth gives callers more capability, maintainers more locality, and tests a useful interface.

## Glossary

Use these terms consistently.
Do not replace them with "component", "service", "API" or an unspecified "boundary".

Module means anything with an interface and implementation.
It can be a function, class, package or slice across tiers.
Avoid "unit", "component" and "service" for this meaning.

Interface means everything callers must know to use a module correctly.
It includes types, invariants, ordering, errors, required configuration and performance.
"API" and "signature" are too narrow because they describe only the type-level part.

Implementation means the code inside a module.
Distinguish it from Adapter.
A Postgres repository can have a small adapter and large implementation.
An in-memory fake can have a large adapter and small implementation.
Use "adapter" for the role at a seam and "implementation" for its contents.

Depth measures capability per unit of interface that a caller or test must learn.
A deep module has substantial behavior behind a small interface.
A shallow module's interface is nearly as complex as its implementation.

Seam, in Michael Feathers's sense, is a place where behavior can change without edits at that location.
It is the location of a module's interface.
Its placement is a separate decision from the implementation behind it.
Avoid "boundary" alone.
Specify a system edge, bounded context or seam.

Adapter means a concrete implementation of an interface at a seam.
It names the role, not the contents.

Leverage is the capability that depth gives callers per unit of interface they learn.
One implementation can support N call sites and M tests.

Locality concentrates changes, bugs, knowledge and verification in one place rather than across callers.
One fix then applies wherever the module is used.

## Deep vs shallow

A deep module has a small interface and substantial implementation:

```
┌─────────────────────┐
│   Small Interface   │  ← Few methods, simple params
├─────────────────────┤
│                     │
│  Deep Implementation│  ← Complex logic hidden
│                     │
└─────────────────────┘
```

A shallow module has a large interface and little implementation.
Avoid that shape:

```
┌─────────────────────────────────┐
│       Large Interface           │  ← Many methods, complex params
├─────────────────────────────────┤
│  Thin Implementation            │  ← Just passes through
└─────────────────────────────────┘
```

Ask these questions about an interface:

- Can it need fewer methods?
- Can the parameters become simpler?
- Can the module hide more complexity?

## Principles

- Depth belongs to the interface. A deep module can contain small parts that support mocks or replacement. Those parts stay private. Internal seams serve its own tests. The external seam is its interface.
- Apply the deletion test. If deleting a module removes complexity, it was a pass-through. If that complexity moves into N callers, the module was useful.
- Test through the interface. Callers and tests cross the same seam. A need to test beyond it can reveal the wrong module shape.
- One adapter gives a hypothetical seam. Two adapters give a real seam. Introduce a seam only when something actually varies across it.

## Designing for testability

Choose interfaces that support direct tests:

1. Accept dependencies instead of creating them internally.

   ```typescript
   // Testable
   function processOrder(order, paymentGateway) {}

   // Hard to test
   function processOrder(order) {
     const gateway = new StripeGateway();
   }
   ```

2. Return results instead of producing side effects.

   ```typescript
   // Testable
   function calculateDiscount(cart): Discount {}

   // Hard to test
   function applyDiscount(cart): void {
     cart.total -= discount;
   }
   ```

3. Keep the interface small. Fewer methods need fewer tests. Fewer parameters need simpler setup.

## Relationships

- A Module has exactly one Interface for its callers and tests.
- A Module's Depth is measured against that Interface.
- A Seam is the location of the Interface.
- An Adapter satisfies the Interface at a Seam.
- Depth produces Leverage for callers and Locality for maintainers.

## Rejected framings

- Ousterhout's ratio of implementation lines to interface lines rewards implementation padding. Use capability per unit of interface instead.
- The TypeScript `interface` keyword or a class's public methods do not define the full Interface. Include every fact that callers need.
- "Boundary" can also mean a DDD bounded context. Use "seam" or "interface" when that is the intended meaning.

## Going deeper

- [DEEPENING.md](DEEPENING.md) covers dependency categories, seam discipline and replacement of old tests for a chosen cluster.
- [DESIGN-IT-TWICE.md](DESIGN-IT-TWICE.md) compares structurally different interfaces through parallel subagents. Judge depth, locality and seam placement.
