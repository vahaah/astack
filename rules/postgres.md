---
paths:
  - "**/*.sql"
---

# PostgreSQL

Apply this SQL section only when the repo uses PostgreSQL.
Enforce data invariants with database constraints.
Use parameters for values and explicit transaction boundaries.
Plan migrations around table locks and rollout order.
Test tenant access with the affected roles.
Use the PostgreSQL checklist in `astack:code-review` for reviews.
