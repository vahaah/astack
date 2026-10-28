# Design red flags

Screen each candidate before synthesis.
Use a red flag to revise or reject the shape.

## Shallow module

A shallow module exposes a large interface and hides little complexity.
Judge depth by the capability and policy hidden relative to the interface size.
Prefer a small interface with substantial behavior behind it.

A deep module differs from a deep call chain.
The call chain spreads knowledge across layers.
The module concentrates capability behind one interface.

Look for these signs:

- Callers must coordinate several methods for one operation.
- Public options expose internal stages or implementation choices.
- Callers must learn the implementation as well as the interface.

## Information leakage

Information leakage makes several modules depend on one internal decision.
A shared representation, policy or protocol detail then needs coordinated edits.

Public re-exports of transport or wire types cause leakage.
Parse external data into domain types behind the interface.
Keep storage schemas, framework objects and protocol details private.

## Temporal decomposition

Temporal decomposition groups modules by execution order rather than the knowledge they own.
Separate load, validate, transform and save stages often repeat a representation and its invariants.

Group code by domain knowledge and ownership.
Methods that run at different times can share a module when they protect the same decisions.

## Pass-through method

A pass-through method forwards the same arguments to another method with the same shape.
It adds a layer without hiding complexity.

Remove the method or move responsibility to a module that completes the operation.
Keep a forwarding seam only when it adds policy, adaptation or a distinct abstraction.

## Split ownership

Several modules write the same state or keep separate copies.
An agent that edits one writer may miss the others.
Their rules can then diverge.

Give each piece of state one owner.
Other modules read it or ask that owner to change it.

## Two ways to do one task

Several supported ways let an agent copy whichever one it finds first.
Each way then gains more callers.

Keep one way to do the task.
Move callers from the others in the same change that deletes them.

## Importable internals

If callers can import internals, an agent can take that shortcut because it compiles.
The internals then become part of the interface.

Make internal imports from outside the module fail the build.

## Hand-synced list

Several lists of the same items require edits in every copy.
An agent that sees one list updates only that list.

Keep one list and derive the others.
If derivation is impossible, make disagreement fail the build.
