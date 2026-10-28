# Tiers

## The interview ritual

The owner often starts with "I am building <ticket>", and asks for an interview before any code. Treat that as S0 of a standard plan.

1. Ask for the actual goal and the one decision the work drives.
   Write the decision as the owner's or user's question, such as "is this form ready to issue?".
2. Grill in rounds until the frontier is empty. Each question has a recommendation and lettered options.
3. Write each answer as a D row with a kind.
   Each step cites the rows it covers.
   Each checkpoint uses them to check for drift.
4. Order the steps by value to the goal, not by layer. Each step has one Exit check.
5. Build one session at a time, with the checkpoints of `sessions.md`.
6. List spin-off findings in the drafts file. File them only after the owner says "agree".

## The tiers

| Tier | Signals | Output | Tracker |
|---|---|---|---|
| quick | One session, one subsystem, no one-way door, two rounds at most, someone to answer | A chat or plan-mode plan of 15 lines or fewer, unresolved questions last | One comment with the decisions on the ticket |
| standard | One block, one ticket or more, usually one PR. The shape of most "I am building" work | `<plan dir>/<slug>.md` | Status and one hand-off comment on the existing ticket. No new object |
| programme | More than one milestone, more than about 8 PRs, or several lanes for weeks | `<plan dir>/<slug>/index.md` and a brief for each block | Session sub-issues and decision issues, through export |

- quick escalates to standard past two rounds, past one session, or at a one-way door. Log a `tier` trail row.
- standard becomes a programme when the frontier still grows after round 4, or when S5 needs more than one milestone.
- A programme chart that finds no fog drops to standard.
- An unattended run never ends at the quick tier. It writes a draft standard plan, so the defaults and the queued round stay.

## Plan mode

`/plan` with "I am building" runs this skill inside plan mode.

- Run S0 to S3, S5 and S6 against the plan text. Write nothing.
- The checker reads the plan text from stdin.
  Give it the path that the plan gets after approval with `astack check-plan --as docs/plans/<slug>.md -`.
  The S5 exit uses this command.
- The plan-mode plan is short. It ends with the unresolved questions.
- After the owner approves with ExitPlanMode, first write `docs/plans/<slug>.md`.
  Commit that file alone.
  Then write the trail rows, the glossary and the ADRs.
- A plan never stays only in `~/.claude/plans` or in memory. Other tools cannot read those places.

## The footprint on the tracker

- The quick tier and the standard tier make no new tracker objects.
- The standard tier writes only the status of the existing ticket and one hand-off comment. The PR fixes each in-scope defect and lists it in its body.
- Each out-of-scope finding goes to the drafts file through `astack plan draft`. The owner files a draft with "agree" through `astack:write-ticket`.
- Never edit the description of a product spec ticket. Put an addendum in a comment.
- Only a programme makes session sub-issues and decision issues, and only through `astack plan export` after a dry run.
- A plan moves to the tracker only when the owner asks. `tracker.md` has the commands.
