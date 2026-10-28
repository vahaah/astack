# astack:plan

Status. Rebuilt 2026-10-16 to match `docs/design.md` section 5 and section 6. The design wins where the two differ. The skill is `marketplace/plugins/astack/skills/plan/`, and the code is `src/astack/plan/`.

## 1. The method it encodes

The owner runs one loop at each scale. Only the container grows. The loop starts with an interview for the goal and the one decision the work drives. Grill rounds follow, with a recommendation for each question. Each answer becomes a decision row that the steps cite at each checkpoint. The research for this rebuild read 21 plan files and 224 planning prompts of the owner.

| Unit | Handle | Notes |
|---|---|---|
| Programme | slug | More than one milestone |
| Milestone | `M<n>` | A demo sentence and one proof command |
| Block | `B<nn>` | A single ticket is a block with no programme |
| Session | `S<n>`, `B<nn>/S<n>` | One PR and one integrator run |
| Step | number | One commit with an Exit check |
| Decision | `D<n>` | One family with a kind column: goal, decision, rule, tech |

Wave, Lane and Kind are labels. "Step" is the canonical word. The owner's "bucket" and `W<n>` are legal input.

## 2. Delivery shape

One session is one big PR. Parallel step workers build its steps in worktrees, in waves. The main thread is the integrator lane. It lands the step commits in plan order. One editor works on each hot-file region in a wave, and the checker fails a plan that breaks this rule. `checkpoints: report` is the default. The package goes to the PR, and chat gets 6 lines or fewer. `approve ui` and `approve one-way` are the only stops. Past 8 steps, a session checkpoints once for each wave. A delegation grant writes `delegate: on`, lasts for the session and survives a resume.

## 3. Tiers and the tracker

| Tier | Output | New tracker objects |
|---|---|---|
| quick | a chat plan of 15 lines or fewer | none |
| standard | `docs/plans/<slug>.md` | none. Status and one hand-off comment on the existing ticket |
| programme | `docs/plans/<slug>/index.md` and a brief for each block | session sub-issues and decision issues, through export |

Out-of-scope findings go to `<git common dir>/astack/plans/<slug>/drafts.md` through `astack plan draft`. `/plan` with "I am building" runs the skill inside plan mode, and the first action after approval writes the plan file.

## 4. The plan file and its caps

The sections of a standard plan are Context, Goal, Scope, Decisions, Sessions, How each step runs, Proof, Premises, Risks, Gates and Unresolved questions. Each session has field lines and a steps table with the columns `#`, Step, Wave, Lane, Files, Covers, Exit, Proof and Checkpoint. The skill reference `template.md` has each rule.

| Artifact | Warn | Deny |
|---|---|---|
| standard plan, brief | over 24 KB or 400 lines | over 32 KB |
| programme index | over 250 lines or 15 live D rows | over 16 KB |

Synthetic fixtures with the size and shape of three real plans pass with no deny. They are in `tests/fixtures/plans/shapes/`:

- 10.9 KB, with ten steps and 31 decisions;
- 19.7 KB, with 47 steps in 8 waves and an integrator lane;
- 27.2 KB, a long grill with two sessions.

## 5. The checker and the hook

`astack check-plan` proves the frontmatter, the section order, the decision rows, the sessions and the steps. It also proves the hot-file rule, the milestones and blocks, the questions, the gates, the caps, the ledger rules and the prose. The prose rules include the exact ASD-STE100 rules as warnings. In a file whose frontmatter has `plan:`, the `plan-file` hook denies four edits only. These are a result over the deny cap, an added checkbox, an added `Status:` line and an added register table. Each other finding is a note.

## 6. The session CLI

`astack session start|checkpoint|handoff|resume` keeps a record under `<git common dir>/astack/plans/<slug>/`. It prints the branch, the waves, the checkpoint package, the hand-off of 5 lines or fewer and the resume prompt. The prompt names the plan, the branch, the PR, the next step and the grant. When the session ran workflows, its last line asks for ultracode. Tracker and PR writes come out as a list for the skill to run.

## 7. The board

`astack board <plan>` is a view that astack derives from the plan, the tracker JSON and git. Nobody commits it. It lists the PRs to drain first and the active sessions. It lists the startable frontier with the longest tail first, and the launches under the WIP cap of 5. It names the blocks whose brief comes next.

## 8. Tracker export

`astack plan export|move|import|drift|keys` stays pure. It reads tracker JSON on stdin or from `--tracker`, and prints a typed write plan. The skill runs each write through the Linear MCP or `gh`, then pipes the new keys into `astack plan keys`. Export is idempotent. A second export with the state that the first one made plans no write, and a test proves it for both trackers and both tiers. Each object ends with the back-link `astack: <slug>/<unit> @ <commit>`, which drift uses to tell a stale export from an edit in the tracker. Move writes plan copies to the tracker and deletes the repo files. Import writes them back.

## 9. Upkeep and unattended runs

Resume reads the plan, the session record, the trail, the tracker and git. A session boundary collapses the merged session and promotes the next one. A milestone exit runs the gates, the persona journeys and the demo, and posts one update. Diverge has six countable triggers. An unattended run writes a draft plan with its queued round and never asks.

## 10. Changes from craft:plan

1. Handles are legal in plans, trackers, PR titles and commit subjects. The comment hook still denies them in code.
2. Sessions with parallel steps in waves replace phases. One `now` session per lane is legal.
3. `delegate`, `checkpoints`, `owner-gates` and `home` are frontmatter keys. The standard tier files no tickets.
4. The plan has no Problem, Outcome or Acceptance criteria sections. The tracker bodies come from the units at export.
5. New commands are `astack session`, `astack board` and `astack plan export|move|import|drift|keys|draft|delegate`.
6. Caps come from the real plans of the owner. The standard tier has no row cap.

## 11. Known gaps

- The lane file-range check of a programme is not built. The hot-file rule works only inside one session.
- `astack release` and the P50 and P85 forecast wait for a first real use.
- The prose rules of `check-plan` are a copy of the exact STE subset. They can move to `src/astack/ste/` when that module is stable.

## 12. Verified and not verified

Verified by probe in an earlier session on Claude Code 2.1.301. Inside `claude -p`, Bash commands and plugin SessionStart hooks see `CLAUDE_CODE_SESSION_ATTENDED=0` and `CLAUDE_CODE_ENTRYPOINT=sdk-cli`. An attended session sees `1` and `cli`. A plugin `bin/` command allowed by `Bash(<cmd>:*)` wrote under `$(git rev-parse --git-common-dir)/astack/plans/` with no prompt, while `mkdir -p .git/astack/...` was refused as a sensitive file. A plugin SessionStart note reached the model in `-p`.

Verified in this rebuild by unit and CLI tests:

- the checker on the fixture plans and the three shapes, and the hook denies;
- export for both trackers, the idempotent second export and key write-back;
- each drift class, and the move and import round trip;
- the session record and the board.

Not verified. No write plan ran against a live Linear workspace or a live GitHub repo. The Linear label group names `Lane/<x>` and `Kind/<x>`, and the markdown that Linear documents keep on import, are not tested. `gh issue create --type` needs issue types on the repo.

## Open questions

1. Should `check-plan` call the STE module of `src/astack/ste/` for its prose rules? Recommended. Yes, when that module has a stable API, because one rule set is easier to keep. Rejected. Keep the copy, which can drift.
2. Should a session record hold the PR number from `gh pr view`? Recommended. Yes, as a read in the skill, passed with `--pr`. Rejected. A `gh` call inside the CLI, which breaks the pure core.
