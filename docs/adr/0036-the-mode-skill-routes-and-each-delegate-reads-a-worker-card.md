# 0036. The mode skill routes, and each delegate reads a worker card

Status: Accepted
Date: 2026-11-23
Ticket: none
Supersedes: none
Amends: none

## Context

Each delegate run loaded 9 files totaling 7,190 source words across `astack:mode` and `astack:principles`.
Five separate reference files repeated rules that belong in one short router, and `routes.md` repeated 12 rows already on the rule card.
`comments-triage.md` and `playbooks/babysit.md` overlapped heavily, and `session-pickup.md` called a transcript authoritative against the card State rule.

A smaller delegate read set lowers upfront load only if every delegate keeps the four fixed rules.
The four fixed rules are the owner gates, no merge without a merge grant, the ChangeProof cite with `astack check proof`, and STE replies.

## Decisions

### D1. The mode skill routes, and each delegate reads SKILL.md and worker.md within 2,000 words

The router with no argument reads only `SKILL.md`.
A routed request reads `SKILL.md` and `references/routes.md`.
Every delegate and unclear role reads `SKILL.md` and `references/worker.md`, capped at 2,000 source words in total with `SKILL.md` at most 1,700.
`scripts/skill-load-report.ts` measures these read sets and `[control:mr-delegate-set]` enforces the caps.

### D2. Five mode references fold into SKILL.md, while subagents and paths-and-wakeups stay behind pointers

`SKILL.md` takes the Triggers, Autonomy, Replies, Playbooks and Delegation grant rules directly.
The five separate reference files go, while `references/subagents.md` and `references/paths-and-wakeups.md` stay behind explicit pointers for calls that need them.

### D3. worker.md stays at most 300 words and puts the four fixed rules in rule 1

`references/worker.md` states the four fixed rules in rule 1.
Those rules are owner gates (including money and legal sign-off), the merge grant, ChangeProof with `astack check proof`, and STE replies.
Rule 2 makes the brief's bar the whole bar past those fixed rules, and `[control:mr-worker-rule]` fails if rule 1 drops any fixed rule.

### D4. The 24-principle index lives once in mode SKILL.md, and principles SKILL.md points there

`mode/SKILL.md` holds one bullet for each of the 24 principle files in `skills/principles/references/`.
`principles/SKILL.md` keeps its frontmatter and points to the Principles section of `astack:mode` and to the leaf command, listing no principle names itself.

### D5. Comments triage merges into playbooks/babysit.md as triage mode

`playbooks/babysit.md` adds `triage` mode for "comments", "check github comments" and "fix CI", running steps 5, 7 and 8 without `/loop`.
The separate triage reference file goes, and the rule card row points to the `astack:mode` Babysit playbook in 34 bytes.
So the Codex fragment stays within 10,240 bytes.

## Domain and effects

Terms. Worker card, Delegate read set

```domain
context Install
agg  ReadSet @ scripts/skill-load-report.ts: Scenario
inv  RS1 ReadSet: the delegate set is mode SKILL.md and worker.md, with at most 2,000 words
inv  RS2 ReadSet: the first rule of worker.md keeps the owner gates, the merge grant, change proof and STE replies
law  L1 RS1 the delegate scenario lists the two files, and their words stay at or under 2,000   check: prop mr-delegate-set
law  L2 RS2 a card whose first rule drops one of the four rules fails   check: prop mr-worker-rule
rung R4
```

## Consequences

- Easier: a delegate loads 2 files (under 1,900 words) instead of 9 files (7,190 words).
- Easier: mode and principles drop more than 3,800 words in total, and no route row repeats the rule card.
- Easier: PR triage and babysitting live in one playbook with one set of fork and head-check rules.
- Harder: any new principle reference or playbook file must be added to `mode/SKILL.md` so `[control:mr-principle-index]` and `[control:wb-facts-playbooks]` stay green.
- Harder: skills that still reach the principle index via `principles/SKILL.md` pay one extra pointer hop until B32 and B33 update them.

## Alternatives considered

- Keep the 9-file delegate read set. Rejected because every delegate run paid 7,190 words of upfront context.
- Have delegates read `SKILL.md` alone with no `worker.md`. Rejected because the worker bar and fixed-rule priority need a dedicated card.
- Adopt the pstack worker card verbatim. Rejected because it lacks the four fixed astack rules.
- Keep two copies of the principle index with a tie test. Rejected because two copies drift and add words.
- Fold Babysit into comments triage instead of triage into Babysit. Rejected because ADR 0009 D3 anchors `playbooks/babysit.md` and `drive` waits for merge-ready.
