# Rules

- One session is one PR. Branch `team/abc-<ticket>/b<block>-s<n>-<slug>`, title `B2/S1 — …`.
- Other branch shapes: `…/s0-<slug>` for spine work.
- A session writes rows to `docs/pending/<branch-slug>.md` on its branch.
- Run `bun run session start B<nn>/S<n>` to claim a branch.
