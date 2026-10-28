# Architecture decision records

An ADR records a decision and the reason the code cannot show.
Use it for a reason too long for a commit and too lasting for a PR.

## Decide whether you need one

Write an ADR only when all three conditions hold:

1. A later reversal costs substantial work, such as a data migration, public API change or vendor switch.
2. A reader would find the code surprising without context and might change the deliberate choice.
3. Real alternatives existed, and the reason for choosing one needs a lasting record.

Typical topics include system structure, communication between bounded contexts, technology lock-in and scope.
A deliberate departure from an obvious approach can also qualify.
So can an external constraint absent from the code, such as compliance or a partner's latency requirement.

When a condition fails, use another location:

| Fact | Location |
|---|---|
| Enforceable constraint | Type, test or lint |
| Domain-term meaning | `CONTEXT.md` |
| Change history | Commit or PR |
| Easily reversed, obvious choice | No record needed |

## Name and number the file

- Use `docs/adr/NNNN-<kebab-case-claim>.md`, such as `docs/adr/0012-exports-stream-rows.md`.
- Use the highest existing number plus one. Never reuse a number, including a rejected ADR's number.
- Add its number, title and status to `docs/adr/README.md`.

## Template

```md
# 0012. Exports stream rows to the client instead of building the file in memory

Status: Accepted
Date: 2026-03-04
Ticket: ABC-123
Supersedes: none

## Context

What is true today, with real paths, symbols and links. The forces that make this a decision: limits, costs, requirements. Facts only.

## Decisions

### D1. Exports write each row to the response as the query returns it

One or two sentences that state the decision as a fact.

### D2. An export over 100,000 rows runs as a background job and emails a link

One or two sentences.

## Consequences

What gets easier, what gets harder, and what follow-up work this creates.

## Alternatives considered

- Build the file in memory, then send it. Rejected because an export of 2 million rows used 3 GB of memory.
- Always run exports as background jobs. Rejected because most exports are small and users want the file at once.
```

## Write each part

- State the title as a claim true after the decision takes effect. Keep it within 120 characters. "Exports stream rows to the client" qualifies. "Export architecture" is only a topic.
- Set Status to `Proposed`, `Accepted`, `Superseded by NNNN` or `Deprecated`.
- Give each decision a `### Dn.` heading that states a fact. Start at `D1`. Never renumber or reuse a removed decision's number. Cite it as `ADR 0012 D2`.
- Let the content determine the length. A small decision can need only one paragraph under `## Decisions`. Keep each ADR under about 15 KB and limited to one topic.
- Exclude review history, PR rounds, progress and reviewer findings. Put those in the PR.

## Cite decisions

Use `ADR 0012 D2` in documents, PR bodies and commit messages.
An ADR citation alone does not qualify a code comment for retention.
Keep such a comment only when the repo has an explicit matching keep pattern.
Prefer a test named after the decision it guards.

## Change an accepted ADR

Use the smallest correction that keeps the record accurate:

| Situation | Correction |
|---|---|
| Words are stale but the decision stands | Add a note: `> Note 2026-05-10: the job queue moved to the worker service. D2 still applies.` |
| Words mislead but the decision stands | Quote and correct them: `> Amended 2026-05-10: D2 said "over 100,000 rows". It means rows after filters, not rows in the table.` |
| Decision changes | Create an ADR with `Supersedes: 0012`. Set the old status to `Superseded by 0031`. Preserve its body. |

Never change an accepted decision's meaning in place.
