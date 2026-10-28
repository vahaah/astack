# The plan file

`astack check-plan --template` prints a standard plan to start from.
`--template=programme` prints a programme index.
`--template=brief` prints a block brief.
The checker enforces each rule on this page that a script can prove.

## Where it lives

- A standard plan is `<plan dir>/<slug>.md`. A programme index is `<plan dir>/<slug>/index.md`, and each block brief is `<plan dir>/<slug>/B<nn>.md` beside it.
- The plan directory is `plan.dir` in `.astack/profile.json`, else `docs/plans`. A convention of the repo wins.
- The glossary is the `CONTEXT.md` or `GLOSSARY.md` of the repo, or the `plan.glossary` file. ADRs follow `astack:write-docs` under `plan.adr`, else `docs/adr`.
- Commit plans so each agent in each tool can read them.
  A plan with `home: linear` or `home: github` lives in the tracker instead.
  `tracker.md` has the rules.

## Frontmatter

| Key | Value |
|---|---|
| `plan` | The slug, equal to the file name, or to the directory name for `index.md`. A brief uses its block handle |
| `tier` | `standard`, `programme` or `brief`. A quick plan has no file |
| `status` | `draft`, `active` or `paused` |
| `home` | `repo` (the default), `linear` or `github` |
| `tracker` | The ticket keys that the plan serves, such as `[ABC-327, ABC-331]`, or `none` |
| `delegate` | `on` or `off`. `astack plan delegate` sets it |
| `checkpoints` | `report` (the default) or `approve` |
| `owner-gates` | The list of owner gates. The fixed gates are production merge, money, legal, accounts, secrets, client messages and destructive resets. Only a programme can lift `hosted migration`, for example to `hosted migration 3 per day` |
| `execute` | `none`, or the handles of the `now` sessions that the owner granted |
| `reviewed` | The date of the last resume or boundary review, as `YYYY-MM-DD` |
| `programme`, `block` | Only on a brief. The slug of the programme and the handle of the block |
| `terms`, `supersedes` | Optional. The glossary terms the plan uses, and the slug of the plan it replaces |

## Sections of a standard plan or a brief, in this order

1. One H1 that states the outcome as a claim. Then an intro of 5 lines or fewer.
2. `## Context`, optional. Facts, the root cause and measured counts. Never a dated section.
3. `## Goal` with three field lines. `Goal.` is the end state. `Decision.` is the one decision that the work drives. `Done when.` is a check that is false today.
4. `## Scope` with an `- In.` bullet and at least one `- Out.` bullet.
5. `## Decisions`, the table below, or `None.`.
6. `## Sessions`, with one H3 for each session and its steps table.
7. `## How each step runs`, optional. Only what differs from `sessions.md`.
8. `## Proof`, required when the plan is active. The whole-work proof.
9. `## Premises`, `## Risks` and `## Gates`, optional.
10. `## Unresolved questions`, always last.

No other H2 is legal. A Progress, Log, Status, Defects or Findings section is a ledger or a register, and the checker refuses it.

## Decisions

```markdown
| # | Kind | Decision | Rejected | Door | Settled | Record |
|---|---|---|---|---|---|---|
| D1 | goal | The export serves the access review, so it lists members and no guest | A guest column | two-way | user R1 | plan |
| D2 | tech | Exports stream rows to the response | Build in memory, 3 GB at 2M rows | one-way | user R2 | ADR 0012 D1 |
| D3 | | Superseded by D4 | | | | |
```

- One `D<n>` family holds each settled answer. `Kind` is `goal`, `decision`, `rule` or `tech`. The old typed IDs G, R, Q and T become kinds.
- `Door` is `one-way` or `two-way`. A one-way row names its rejected option, and it cites an ADR or an unresolved question that says `Settles. D<n>.`.
- `Settled` is `user R<n>` for the round where the owner decided, and `delegated` for a call under a grant. It is `evidence` when Record points at a prototype, an arena result or a research branch. It is `default` for an agent call, and each `default` row has a question that settles it.
- Never reuse a handle. To change a `user` row, add a new row and shrink the old one to `| D3 | | Superseded by D4 | | | | |`. A `delegated`, `evidence` or `default` row can change its words in place.
- Keep a row near 300 characters. Move detail to an ADR or to the step. A standard plan has no row limit. A programme index warns past 15 live rows.

## Sessions and steps

```markdown
### S1 One PR streams member exports

State. now
Depends on. None.
Exit.
- Given a 200,000-member workspace, when an admin exports, then the CSV arrives within 30 s.
Proof. `bun test e2e/export`
Baseline. 0 of 2 export checks pass on trunk.

| # | Step | Wave | Lane | Files | Covers | Exit | Proof | Checkpoint |
|---|---|---|---|---|---|---|---|---|
| 1 | Remove the in-memory export path | W1 | a | src/export/buffer.ts | D2 | `buildExportBuffer` has no caller | `bun test export` | report |
| 2 | Guard the export route | W1 | b | src/routes/export.ts#guard | D3 | A member call returns 403 | `bun test routes` | report |
| 3 | Add the Export button | W2 | integrator | src/ui/members.tsx | D1 | An admin sees Export | `bun test ui` | approve ui |
```

- The H3 starts with the handle, `S<n>` in a standard plan and `B<nn>/S<n>` in a brief. The rest says what becomes true when the PR merges.
- `State.` is `now`, `next`, `later` or `done`. Each lane has at most one `now` and one `next` session. `Lane.` on a session names its lane, and the default lane is `main`.
- A `now` or `next` session needs `Depends on.`, `Exit.` with 1 to 7 bullets, and `Proof.` with a command in backticks. `Ticket.`, `Branch.`, `Lane.` and `Baseline.` are optional. A `now` session needs its steps table.
- A `later` session needs only `State.`. It can carry `Depends on.`, `Exit.`, `Proof.`, `Fog.`, `Lane.` and `Ticket.`. A `done` session keeps `State.`, `Ticket.` and `Lane.` only.
- `Depends on.` lists session handles, or `None.`. A session in the same file must come earlier.
- Each step row needs `#`, `Step` and `Exit`. `#` is a number such as `3` or `3a`. `Step` is a verb phrase.
- `Wave` is `W<n>`, and the rows come in wave order. `Lane` is a lowercase label.
- `Files` lists paths, directories ending in `/`, or regions such as `src/router.ts#guard`. Two steps of one wave that list the same region fail, unless both run in the `integrator` lane.
- `Covers` lists the live D rows the step serves. The checkpoint package cites them as the drift check.
- `Checkpoint` is `report`, `approve ui` or `approve one-way`.
- Exit text uses no subjective word such as fast, easy or better, unless a number comes with it.

## Unresolved questions

Number each question, and word it so that "yes" accepts the recommendation. Write `None.` when there is none. These markers are legal inside a question:

- `Recommended.` and `Rejected.` hold the round format.
- `Settles. D4.` names the rows that the answer settles.
- `Blocks. S2.` names the units that wait for the answer. An active plan has no question that blocks a `now` session.
- `Binds. B07/S2, B09.` and `Decide by. M2.` turn the question into a decision issue in a programme.
- `Ticket. ABC-55.` is the key of that decision issue, after export.

## Caps

| Artifact | Warn | Deny |
|---|---|---|
| standard plan or brief | over 24 KB or 400 lines | over 32 KB |
| programme index | over 250 lines or 15 live D rows | over 16 KB |
| session | over 12 steps | none |
| hand-off comment | over 5 lines | none |

The caps fit the owner's real plans.
A 27 KB ticket plan gets a warning and no deny.
Over a deny cap, move durable decisions to ADRs, collapse done sessions or move a block into a brief.
A cap never goes up.

## No ledger

The plan holds no progress.
Write no checkboxes, no `Status:` lines and no register tables.
Write no commit SHAs and no session story.
A date goes only in the frontmatter or a `Target.` line.

For a file with `plan:` frontmatter, the astack hook denies four edits.
They are a result over the deny cap, an added checkbox, an added `Status:` line and an added register table.
Each other finding is a note.

## Prose

The checker refuses a long dash, an en dash outside a number range, a curly quote and an emoji.
It warns on a colon in the middle of a sentence.
It also warns on the exact ASD-STE100 rules.
These cover contractions, semicolons, Latin abbreviations, "and/or", and sentences over 25 words.
Tables and code are out of scope.
A word on the glossary's avoid list gets a warning.

## The checker

`astack check-plan <file...> [--base <ref>] [--all] [--brief] [--json] [--strict] [--no-trail]` prints one `file:line: message` for each problem. It exits 0 when clean, 1 on errors and on warnings under `--strict`, and 2 on a usage error.

- `--base <ref>` compares the decision rows with the plan at that ref. A `user` row never changes its text, and handles are never reused. A row goes away only when an ADR holds it or a session closed.
- `--all` checks each plan in the plan directory and lists the plans that are stale or ready to delete.
- `--brief` prints one line for each active, draft or paused plan, with its `now` unit and the grant.
- `--no-trail` skips the gate rows in the trail. CI uses it.

When the trail exists, an active standard plan or brief needs a verdict for each of the nine gates. A verdict is a trail row or a `## Gates` line. The gates are these:

- foundational thinking, subtract before you add, sequence verifiable units;
- outcome-oriented execution, migrate callers then delete legacy APIs;
- exhaust the design space, prove it works, attack the premise, interrogate.

## The trail and the drafts

The trail is `$(git rev-parse --git-common-dir)/astack/plans/<slug>/trail.tsv`.
Each worktree shares it.
Never commit it.
Only `astack plan trail` writes it.
A raw shell write under `.git` asks for approval.
Use these forms:

```sh
astack plan trail <slug> <phase> "<decision>" "<why>" "<evidence>" "<result>"
astack plan trail <slug>
```

The phase is `start`, `tier`, `answer`, `default`, `delegated`, `gate`, `diverge`, `boundary`, `checkpoint` or `handoff`. The second form prints the rows since the last `start`.

The drafts file is `drafts.md` in the same directory. `astack plan draft <slug> "<title>" "<why>"` adds a finding, and `astack plan draft <slug>` prints them.

## The life of a plan

- One writer edits the plan. During planning that is the planning session. After it, that is the integrator of the `now` session.
- Plan edits go into one docs commit for each session, or into the session PR.
- The last PR of the plan deletes it. Before that, durable decisions move to ADRs and terms move to the glossary.
- A replacement plan sets `supersedes:` and deletes the old file in the same PR.
