# ADR format

An ADR records a decision and the reason that the code cannot show.
ADRs live in `docs/adr/`.

## When to write one

All three conditions must hold:

1. A later reversal costs substantial work, such as a data migration, a public API change or a vendor switch.
2. Without the reason, a future reader finds the code surprising and can undo the choice.
3. The decision chose between real alternatives for specific reasons.

When a condition fails, write no ADR.
Put an enforceable constraint in a type or a test, and a term in `CONTEXT.md`.
Put change history in the commit or the PR.

## Name and number the file

- Use `docs/adr/NNNN-<kebab-case-claim>.md`, such as `docs/adr/0012-exports-stream-rows.md`.
- Use the highest existing number plus one. Never reuse a number, also the number of a rejected ADR.
- Add a row with its linked number, its title and its status to `docs/adr/README.md`.

## Template

````md
# 0012. Exports stream rows to the client instead of building the file in memory

Status: Accepted
Date: 2026-03-04
Ticket: ABC-123
Supersedes: none
Amends: none

## Context

The facts and forces of today, with real paths and symbols.

## Decisions

### D1. Exports write each row to the response as the query returns it

One or two sentences that state the decision as a fact.

## Domain and effects

Terms. Export

```domain
context Billing
agg  Export @ src/billing/export.ts: ExportState
inv  EX1 Export: an export sends each row once
step streamRows : ExportQuery -> ExportRow[]
law  L1 EX1 each row of the query reaches the response once   check: prop export-rows-once
rung R3
```

## Consequences

What gets easier and harder, and the follow-up work.

## Alternatives considered

- Build the file in memory, then send it. Rejected because an export of 2 million rows used 3 GB of memory.
````

## Write each part

- State the title as a claim true after the decision takes effect. Keep it within 120 characters. "Exports stream rows to the client" qualifies. "Export architecture" is only a topic.
- Set Status to `Proposed` or `Accepted`. Only a later change sets `Superseded by NNNN` or `Deprecated`.
- Write `none` or the numbers in `Supersedes:` and `Amends:`, such as `Amends: 0005 D5`. `Ticket:` is optional.
- Give each decision a `### Dn.` heading that states a fact. Start at `D1`. Never renumber or reuse a removed decision's number.
- Keep the five H2 parts in the order of the template. Keep each ADR under approximately 15 KB and on one topic.

## Write the Domain and effects part

`Terms.` names the glossary terms of the decision, or `none`.
Then one `domain` fence names its context, aggregates, caps, steps and laws.
The fence uses the grammar of the plan block, and `astack check-plan --template=domain` prints it.
Its law lines confirm the decision, because each law names its check.
A decision with no code writes `None.` and its reason in place of the fence.

Map event-storming items to the block:

| Event storming | Domain block |
|---|---|
| Domain event | A case of the event union that `fold` takes |
| Command | The input of a step |
| Policy | A `flow` from the step that gives an event to the step of the command |
| Aggregate | An `agg` line whose module exports `decide` and `fold` |
| Read model | A fold over the events |
| Bounded context | The `context` line |
| Context map | A `map` line between two contexts |
| External system | A `cap` line |

## Write a proof record

An ordinary governing ADR needs only `Status: Accepted` and text under the cited decision.
The separate proof record of an integrated proposal contains these nonempty subsections:

- `Formal claim`: the invariant or law, assumptions, bounds and proof sketch.
- `Category composition`: the function symbols, typed arrows, carrier, effects and laws.
- `Implementation correspondence`: the map from functions and contracts to model actions and state.
- `Verification`: links to the TLA+ module, config, proof matrix and controls.

The checker requires the function symbols in the category section and the proof artifact paths in the record.
A record for two decisions gives each decision its own subsections.
A new ADR can hold these `####` subsections under its decision.
A model record under `formal/` is the other home.

## Cite decisions

Use `ADR 0012 D2` in documents, PR bodies and commit messages.
An ADR citation alone does not qualify a code comment for retention.
Keep such a comment only when the repo has an explicit matching keep pattern.
Prefer a test named after the decision it guards.

## Change an accepted ADR

After `Proposed`, the text of an ADR changes only in these ways:

| Situation | Change |
|---|---|
| Words are stale but the decision stands | Add a note: `> Note 2026-05-10: the queue moved. D2 still applies.` |
| Words mislead but the decision stands | Quote and correct them: `> Amended 2026-05-10: D2 said "all rows". It means rows after filters.` |
| A later ADR changes one decision | The new ADR writes `Amends: 0012 D2`, and the old ADR names it in its `Amended by:` line |
| Decision changes | Create an ADR with `Supersedes: 0012`. Set the old status to `Superseded by 0031`. Preserve its body. |

A dated block starts with `> Note YYYY-MM-DD:` or `> Amended YYYY-MM-DD:`, and each next line starts with `>`.
Its date is on or after the `Date:` of the ADR.
A proof subsection, the `## Domain and effects` part and the `## Invariant audit` part can change with the code.

`astack check adr --base <ref>` fails each other edit of an ADR that is past `Proposed` at the base.
It also fails a relation that the other ADR does not name back, and an index row that differs from its file.
A new ADR that leaves out a part of the template fails too.
