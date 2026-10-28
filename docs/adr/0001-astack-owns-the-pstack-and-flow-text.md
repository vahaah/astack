# 0001. astack owns the pstack and flow text, and no upstream sync stays

Status: Accepted
Date: 2026-10-24
Ticket: none
Supersedes: none

## Context

astack ships pstack and flow as ports of pinned upstream snapshots. `upstream/lock.json` pins each snapshot, and `port/pstack/` and `port/flow/` hold the codemods, patches and overlays that `bun run port` applies. The owner wants each skill and agent rewritten in the astack style. A full rewrite leaves no upstream text for a patch or an overlay to apply to.

## Decisions

### D1. The pstack and flow items become astack items in the one astack plugin

Each item that the merge map keeps becomes an `astack:<name>` item with astack-owned text. The `pstack:` and `flow:` name spaces go away in the same change.

### D2. The port recipes and `bun run port` go away

astack no longer syncs pstack or flow. A useful upstream change comes in by hand, as a normal astack change.

> Amended 2026-10-24: D2 first also removed the upstream snapshots. The notice test reads them to find the items that keep a substantial part of upstream text (ADR 0003 D2). So D3 keeps them as frozen test data.

### D3. The upstream snapshots stay frozen as test data

`upstream/` keeps the pinned snapshots. No script syncs or ports them. Only the notice test reads them.

> Amended 2026-10-24: D3 said "Only the notice test reads them." The registry and build tests read them too. Only the files under `tests/` read a snapshot. `tests/frozen-upstream.test.ts` fails when a script outside `tests/` reads one. D3 does not apply to `upstream/cursor-plugin-schemas/`. It is a dist input, and `scripts/dist.ts` reads it to validate the Cursor build.

## Consequences

- Easier: one text source, one name space and no overlay breaks after an upstream update.
- Harder: astack does not get upstream fixes for free. Someone reads the upstream changes and copies the useful ones by hand.
- Follow-up: `NOTICE` keeps the MIT notices of pstack and flow for each item that keeps a substantial part of their text (ADR 0003).

## Alternatives considered

- Fold pstack only and keep flow as a synced upstream. Rejected because two systems stay.
- Keep both as upstream ports and rewrite through overlays. Rejected because each upstream update breaks the overlays.
