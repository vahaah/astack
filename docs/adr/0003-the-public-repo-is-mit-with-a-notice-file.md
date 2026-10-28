# 0003. The public repo is MIT, with a NOTICE file for each upstream

Status: Accepted
Date: 2026-10-24
Ticket: none
Supersedes: none

## Context

astack builds on pstack and flow, which are MIT. The plan can also copy items from ECC. An MIT licence asks that each copy, or each substantial part of the text, keeps the copyright notice and the permission notice.

## Decisions

### D1. The public astack repo is MIT

The owner's own code and text are MIT.

### D2. `NOTICE` keeps the MIT notice of each upstream whose text an item keeps in substantial part

This covers pstack, flow and each copied ECC item. Each such item names its upstream in `NOTICE`.

### D3. The owner alone holds the copyright in the astack code and text

No employer or client has a claim, so the owner can grant the MIT licence.

## Consequences

- Easier: the licence matches the upstreams, so a user reads one licence type.
- Harder: each rewrite decides whether the item keeps a substantial part of its upstream text. A test of shared runs of words already finds such parts.

## Alternatives considered

- Another licence for the astack code. Rejected because the MIT upstreams still need their notices, and the mix is harder to read.
