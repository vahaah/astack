---
name: plan
description: Use for /astack:plan, "I am building X", a ticket key, or /plan with new work. Plans work from one ticket in one PR to a programme of many months. It asks for the goal and the one decision that the work drives. It grills the owner on their calls. It writes one plan file that astack check-plan proves, and resumes a plan by slug, path or ticket key.
argument-hint: "<what to plan> | <slug, plan path or ticket key> [--tier quick|standard|programme] [--afk]"
---

# Plan

Plan the work in `$ARGUMENTS`, or resume the plan it names.
The owner decides, and you find facts and design contested shapes against `astack:principles`.
This skill writes a plan and never builds code.

Each fact has one home.
The plan holds structure and the domain record, and the tracker holds status and comments.
ADRs and the glossary hold durable facts, and the trail holds decision reasons.
`astack check-plan` proves the structure, and the last PR deletes the plan.

## Units and delivery

| Unit | Meaning | Handle | Limit |
|---|---|---|---|
| Programme | Destination needing more than one milestone | slug | 8 live milestones |
| Milestone | Observable state with demo and proof | `M<n>` | 1 to 6 weeks |
| Block | Capability slice with a brief | `B<nn>` | 1 to 5 sessions |
| Session | One PR and one integrator run | `S<n>` or `B<nn>/S<n>` | warn past 12 steps, never split |
| Step | One commit with Exit and checkpoint | number | approximately half a day |
| Decision | Settled answer | `D<n>` | approximately 300 chars |

Wave batches parallel steps, and lane partitions workers. Accept "bucket" and `W<n>` from the owner.

- Usual shape: one PR per session built by parallel worktree workers in waves (`references/sessions.md`).
- Main thread is the `integrator` lane. It lands step commits in order, runs scoped gates and resolves conflicts.
- One editor per hot-file region in a wave. Split a PR only when the owner asks.
- `checkpoints: report` is default: post the package on the PR, give chat 6 lines or fewer, and continue.
- `approve ui` and `approve one-way` stop for UI taste and one-way doors.
- Sessions over 8 steps checkpoint per wave. Smaller sessions checkpoint per step.

## The delegation grant

"go", "do your recommendation" and "use best practices and our previous decisions" grant delegation.

1. Run `astack plan delegate <plan> on` at once (`delegate: on`, `checkpoints: report`, trail row).
2. Decide agent calls and clear owner calls as `delegated` rows with reasons.
3. Resume keeps the grant. "ask me" ends it via `astack plan delegate <plan> off`.
4. Owner gates always stop work. Under a grant, "go" also grants execution of `now`.

## Rules for the whole run

1. Classify every open question with `references/routing.md`. Find facts yourself, test empirical forks, ratify design forks, and put agent calls on the veto list.
2. Grill only in the main thread and never answer your own question. Run `astack plan attended` at S0. On `unattended`, follow `references/unattended.md`.
3. Write each answer as a decision row in the same turn. Log it with `astack plan trail`.
4. Never use AskUserQuestion for a round. Use the plain-text round format below.
5. Write no checkboxes, `Status:` lines, register tables or body dates.
6. Plan handles belong in plans, trackers, PR titles and commits, never in code or comments.
7. Only an owner answer or grant sets `execute:`.
8. Subagents read code and return pointers to protect main context.
9. End every plan with `## Unresolved questions`.

## Plan mode

`/plan` with "I am building" runs this skill inside plan mode.

1. Run S0 to S3, S5 and S6 without writing files. Check stdin via `astack check-plan --as docs/plans/<slug>.md -`.
2. Keep the plan-mode plan short with unresolved questions last.
3. After ExitPlanMode approval, first write and commit `docs/plans/<slug>.md`, then write trail, glossary and ADRs.
4. Never leave a plan only in `~/.claude/plans` or memory, because other tools cannot read them.

## Tracker footprint

- `quick`: one decision comment on the ticket.
- `standard`: status and one hand-off comment on the existing ticket. Put out-of-scope findings in `astack plan draft <plan> "<title>" "<why>"` (filed via `astack:write-ticket` after "agree"). Never edit a spec ticket description. Add an addendum comment.
- `programme`: file map and decision issues via `astack:write-ticket` when asked, and write keys back with `astack plan keys` (`references/tracker.md`).

## Pick the mode

Run `astack check-plan --brief`. Read the plan directory, and read the tracker for a ticket key.

| Mode | When | Do |
|---|---|---|
| new | No plan covers the work | Tiers and stages below |
| resume | Argument names a live plan | `references/upkeep.md`, Resume |
| session boundary | `now` session PR merged | `references/upkeep.md`, Session boundary |
| milestone exit | All `now` milestone sessions merged | `references/upkeep.md`, Milestone exit |
| diverge | Divergence trigger fired | `references/upkeep.md`, Diverge |
| pause | Owner says "pause" | `references/upkeep.md`, Pause and close |
| keys | Owner asks to write tracker keys back | `references/tracker.md` |
| map | Argument is a `wayfinder:map` issue with no plan | `references/programme.md`, Work through a map |

## Pick the tier

| Tier | Signals | Output |
|---|---|---|
| quick | One session, one subsystem, no one-way door, at most two rounds, someone to answer | Chat or plan-mode plan (15 lines or fewer), questions last |
| standard | One block, usually one PR | `<plan dir>/<slug>.md` |
| programme | More than one milestone, over approximately 8 PRs, or multi-week lanes | `<plan dir>/<slug>/index.md` and briefs at most two sessions ahead |

Propose the tier as Q1 of round 1 (`--tier` skips it).
Skip planning for obvious one- or two-file edits. Say so and stop.

- `quick` escalates to `standard` past two rounds, past one session, or at a one-way door (log `tier` trail row).
- `standard` escalates to `programme` past round 4 or past one milestone.
- A programme chart with no fog drops to `standard`.
- An unattended run writes a draft standard plan, never `quick`.

## Run the stages

Every change follows `astack:mode references/change-proof.md`.
A code plan holds `## Domain and effects` with one `domain` fence (`astack check-plan --template=domain`).
S3 to S6 each own one part of that domain record.

Run S0 first, then S1 in background while S2 asks round 1.
Run S3 during rounds, then S4, S5, S6, final round, S7 and S8 (`references/stages.md`).

| Stage | Thread | What runs | Exit |
|---|---|---|---|
| S0 Intake | main | Goal, decision, `astack:in-your-own-words`, `astack:sharpen`, `astack plan attended` | One-sentence goal, decision named, done check false today |
| S1 Facts | subagents | `astack:how`, `astack:why`, `astack:recall`, research brief | Facts brief under one page, questions sorted |
| S2 Grill | main | `astack:grilling` over frontier (at most 7 questions) | Frontier empty and owner agrees |
| S3 Words | main | `astack:domain-modeling` writes terms and names the `CONTEXT.md` card context | `terms:` in glossary and context named |
| S4 Design | lead | `astack:architect` phases A and B; draft the `domain` block (`--template=domain`) | Sketch compiles, `domain` block drafted |
| S5 Sequence | main | Sessions, steps, waves, lanes; link each block `step` to one `Files` cell `<module>#<name>` | Checker passes and `now` can start |
| S6 Spec review | lead | `references/spec-review.md`; give each `inv` and write `cap` a `law` on code | Obligations set, no open owner choice |
| S7 Tracker | main | Tier footprint (`astack:write-ticket` and `astack plan keys`) | Tracker matches tier |
| S8 Hand-off | main | Final round, execution grant, plan commit | Reply below |

S1 and S6 each start a subagent. Skip S4 only inside one function with no new module, seam or schema, and log `exhaust the design space. n/a. <reason>` under `## Gates`.

## Read the skills of the stage

Read each skill only when its stage starts. Non-new modes read only their reference.

| Stage | Load with the Skill tool | Read by path |
|---|---|---|
| S0 | `astack:write-docs` (STE wins) | `astack:in-your-own-words`, `astack:sharpen`, `astack:show-me-your-work` |
| S1 | None | `astack:how`, `astack:why`, `astack:recall` |
| S2, S3 | `astack:grilling`, `astack:domain-modeling` | None |
| S4 | `astack:codebase-design` | `astack:architect`, `astack:arena`, `astack:mode playbooks/prototype.md` |
| S5 | None | `astack:principles`, `astack:figure-it-out`, `references/programme.md` |
| S6 | None | `references/spec-review.md`, `astack:principles references/attack-the-premise.md` |
| S7 | `astack:write-ticket` | Map or umbrella template when needed |
| S8 | `astack:write-docs` | None |

Read by-path skills with `astack skill-path <plugin>:<skill> [<path>]`.
Run each `astack` command as its own Bash call (never chained) so `Bash(astack:*)` covers it.
When `astack` is off PATH, run `"${CLAUDE_SKILL_DIR}/../../bin/astack"`. On nonzero exit, say so once and use `references/fallbacks.md`. Name `/astack:reflect` when it fits.

## Recover after a compaction

A host can keep only part of this file after a compaction.
During planning, after a compaction, read this file again.
Run `astack check-plan --brief`.
Read the plan file and the last trail rows.

Select the mode from the request, plan, tracker, and Git with the existing route rules.
For an existing plan, follow Resume in `references/upkeep.md`.
Use the trail and current artifacts to recover unfinished planning work.
Read the skills of the recovered mode again, because earlier reads can be gone.

## Write the plan

Start from `astack check-plan --template`, `--template=programme`, `--template=brief` or `--template=domain` (`references/template.md`).
Run `astack check-plan <file>` after edits, and `--strict` before `status: active`. Never split a session to clear a note.
Log gate verdicts in the trail (or fail, n/a or waiver lines under `## Gates`).

## Round format

Plain text, at most 7 questions (`astack:grilling` format) with `(principle <name>)` from `astack:principles` on the recommendation.
End with the veto list of new `default` rows:

```text
Defaults. I decided these because each is cheap to reverse. One "agree" keeps them all.
- <Decision>. Because <evidence>. Rejected. <Option>.
```

Under a grant, report new `delegated` rows in one line each at the next checkpoint.
Record answers as `user R<n>`, log `answer` trail rows, and verify factual claims with a read-only subagent.

## Reply

- Attended round: plain round format, then wait.
- Attended quick plan: 15 lines or fewer, questions last.
- Other ends: 6 plain lines or fewer in order (plan path, checker summary, `now` session and `astack session start <plan>`, failed gates, tracker writes, `Unresolved questions. <N> in <plan path>.`).

Use no headings, bold labels or mid-sentence colons. Stop until the owner or grant starts the build.

## References

- `references/stages.md`: S0 to S8, subagent briefs and models.
- `references/template.md`: plan file, caps, checker, trail and life of a plan.
- `references/sessions.md`: session protocol, waves, checkpoints and `astack session`.
- `references/programme.md`: index, milestones, blocks, briefs, maps and `astack board`.
- `references/tracker.md`: one-home rule, `astack plan keys`, tracker JSON and PR rules.
- `references/upkeep.md`: resume, session boundary with context moves, milestone exit, diverge, pause and close.
- `references/unattended.md`: runs with nobody to answer.
- `references/routing.md`: question kinds and tie rules.
- `references/fallbacks.md`: fallbacks for missing skills.
