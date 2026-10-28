---
name: plan
description: Use for /astack:plan, "I am building <X>", a ticket key, or /plan with new work. Plans work the way the owner plans, from one ticket in one PR to a programme of many months. It asks for the goal and the one decision that the work drives, and grills the owner on the calls that are theirs. Then it writes one plan file that astack check-plan proves. The plan holds sessions of parallel steps in waves, and astack session builds them. It also resumes a plan by slug, path or ticket key, and moves a plan to Linear or GitHub on request.
argument-hint: "<what to plan> | <slug, plan path or ticket key> [--tier quick|standard|programme] [--afk]"
---

# Plan

Plan the work in `$ARGUMENTS`, or resume the plan it names.
The owner makes the decisions.
You find the facts and design the contested shapes.
Test the plan against `astack:principles`.
Keep the decision record.
This skill produces a plan.
It never builds code.

Each fact has one home.
The plan file holds the structure.
The tracker holds status, claims and comments.
ADRs and the glossary hold what must outlive the plan.
The trail records each decision's reason.
`astack check-plan` proves the structure.
The last PR of the plan deletes the plan.

## The units

| Unit | What it is | Handle | Limit |
|---|---|---|---|
| Programme | A destination that needs more than one milestone | slug | 8 live milestones |
| Milestone | A state that a person can watch, with one demo sentence and one proof command | `M<n>` | 1 to 6 weeks |
| Block | One capability slice with a brief. A single ticket is a block with no programme | `B<nn>` | 1 to 5 sessions |
| Session | One PR and one integrator run | `S<n>`, or `B<nn>/S<n>` in a programme | warn past 12 steps, never split |
| Step | One commit with an Exit check and a checkpoint | its number in the session | about half a day |
| Decision | A settled answer | `D<n>` | about 300 characters per row |

Wave, Lane and Kind are labels.
A wave is a batch of steps that run in parallel.
A lane partitions the work between workers.
The `integrator` lane is the main thread.
Kind marks a decision row as `goal`, `decision`, `rule` or `tech`.

"Step" is the word astack uses. The owner also says "bucket" and `W<n>`. Accept the words of the owner and never correct them.

## The delivery shape

The usual shape is one big PR for each session.
Parallel step workers build it in worktrees, in waves.
`references/sessions.md` has the full protocol.

- The integrator lane is the main thread. It lands the step commits on the session branch in plan order, runs the scoped gates and resolves conflicts.
- One editor works on each hot-file region in a wave. The checker fails a plan when two steps of one wave list the same region.
- A PR can serve more than one ticket. Split a PR only when the owner says so.
- `checkpoints: report` is the default. The package goes to the PR as a comment. Chat gets 6 lines or fewer and the link. Then the session continues.
- `approve ui` and `approve one-way` stop the session for the owner. Use them only for a step of UI taste and for a one-way door.
- A session with more than 8 steps has one checkpoint for each wave. A smaller session has one for each step.

## The delegation grant

"go", "do your recommendation" and "use best practices and our previous decisions" are a delegation grant.

1. Run `astack plan delegate <plan> on` at once. It writes `delegate: on` and `checkpoints: report`, and it logs a trail row.
2. Decide the agent calls. Decide the owner calls that have one clear best option. Record each one as a `delegated` row with its reason.
3. The grant lasts for the session, and a resume keeps it. "ask me" ends it with `astack plan delegate <plan> off`.
4. The owner gates in the frontmatter always stop the work. Under a grant, "go" also grants execution of the `now` session.

## Rules for the whole run

1. Sort each open question by kind with `references/routing.md` before it reaches the owner.
   Find facts yourself.
   Resolve forks that a test can settle.
   Design forks reach the owner for ratification.
   Agent calls go on the veto list.
2. Grill only in the main thread.
   Never answer your own question.
   At S0, run `astack plan attended`.
   When nobody can answer, follow `references/unattended.md`.
3. Write each answer as a decision row in the same turn. Log it with `astack plan trail`. An answer never lives only in the chat.
4. Never use AskUserQuestion for a round. A round is plain text in the format below.
5. Keep progress out of the plan. Write no checkboxes, no `Status:` lines, no register tables and no dates outside the frontmatter. The astack hook denies the first three.
6. Plan handles are legal in plans, trackers, PR titles and commit subjects. Never put a handle in code or in a code comment. A TODO cites an issue key.
7. Planning never builds. Only an owner answer or a delegation grant sets `execute:`.
8. Guard the main context. Subagents read the code and return pointers. The main thread keeps the answers, the plan file and the checker output.
9. Every plan ends with its unresolved questions.

## Plan mode

`/plan` with "I am building" is this skill inside plan mode.

1. Run S0 to S3, S5 and S6 against the plan text.
   Write nothing.
   Check the text with `astack check-plan --as docs/plans/<slug>.md -`.
   That command reads the plan from stdin.
2. Keep the plan-mode plan concise.
   Put the unresolved questions last.
3. After the owner approves with ExitPlanMode, the first action writes `docs/plans/<slug>.md` and commits it.
4. Then write the trail rows, the glossary and the ADRs. A plan never stays only in `~/.claude/plans` or in memory, because other tools cannot read them.

## How much the plan writes to the tracker

| Tier | New tracker objects | What the plan writes |
|---|---|---|
| quick | none | One comment with the decisions on the ticket |
| standard | none | The status of the existing ticket and one hand-off comment |
| programme | session sub-issues, decision issues | Through `astack plan export`, after a dry run |

In the standard tier, the PR fixes each in-scope defect and lists it in its body.
Put each out-of-scope finding in the drafts file with `astack plan draft <slug> "<title>" "<why>"`.
The owner files those findings with "agree" through `astack:write-ticket`.
Never edit the description of a product spec ticket.
Put an addendum in a comment.

A plan moves to Linear or GitHub only when the owner asks. `references/tracker.md` has `astack plan export`, `move`, `import`, `drift` and `keys`.

## Load the skills you compose

Call the Skill tool for these. Each one is model-invocable.

- `astack:grilling` and `astack:domain-modeling`, together, for each round.
- `astack:research` for facts outside the repo, `astack:prototype` when a person must judge a prototype, and `astack:codebase-design` for the depth words.
- `astack:write-ticket` for each ticket, and `astack:write-docs` for ADRs, the glossary and PR bodies.
- `astack:write-docs` for the prose of the plan. ASD-STE100 takes priority over its other prose rules.

The other skills set `disable-model-invocation`, so the Skill tool refuses them.
Read their SKILL.md by path:

```sh
astack skill-path astack:architect
astack skill-path astack:mode playbooks/prototype.md
```

Each command prints an absolute path.
Read that file.
Run each `astack` command as its own Bash call.
Never chain it with `&&` or `cd`.
Then one allow rule, `Bash(astack:*)`, covers them all.
When `astack` is not on the PATH, run `"${CLAUDE_SKILL_DIR}/../../bin/astack"`.
Exit 1 means that the skill or reference is unavailable.
Say so once.
Use `references/fallbacks.md`.

Read these skills by path:

- `astack:sharpen`, `astack:in-your-own-words`, `astack:how`, `astack:why` and `astack:recall`.
- `astack:architect`, `astack:interrogate`, `astack:show-me-your-work` and `astack:figure-it-out`.
- The playbooks of `astack:mode`.
- `astack:principles` and each reference that its index says applies.

Read `astack:wayfinder`, `astack:to-tickets` and `astack:to-spec` for their rules only.
Each ticket still goes through `astack:write-ticket`.

Name `/astack:retro`, `/astack:reflect` and `/astack:to-questionnaire` when they fit, because the user runs them. Never copy them.

## Pick the mode

First look for a plan that covers the work.
Run `astack check-plan --brief`.
Read the plan directory.
When the argument is a ticket key, read the tracker.

| Mode | When | Do |
|---|---|---|
| new | No plan covers the work | The tiers and stages below |
| resume | The argument names a live plan | `references/upkeep.md`, Resume |
| session boundary | The PR of the `now` session merged | `references/upkeep.md`, Session boundary |
| milestone exit | Each session of the `now` milestone merged | `references/upkeep.md`, Milestone exit |
| diverge | A divergence trigger fired | `references/upkeep.md`, Diverge |
| pause | The owner says "pause" | `references/upkeep.md`, Pause and close |
| tracker | The owner asks to export, move, import or check drift | `references/tracker.md` |

## Pick the tier

| Tier | Fits when | Output |
|---|---|---|
| quick | One session, no one-way door, at most two rounds, and someone to answer | No file. A plan of 15 lines or fewer in the chat or in plan mode |
| standard | One block. One ticket or more. Usually one PR | `<plan dir>/<slug>.md` |
| programme | More than one milestone | `<plan dir>/<slug>/index.md` and a brief for each block, written at most two sessions ahead |

`references/tiers.md` has the signals and the changes between tiers.
Propose a tier with its signals as Q1 of round 1.
`--tier` skips that question.
A change of one or two files with an obvious approach gets no plan.
Say so.
Then stop.

## Run the stages

S0 runs first.
S1 runs in the background while S2 asks round 1.
S3 runs during each round.
Then run S4 and a ratification round.
Follow with S5, S6 and the final round.
Run S7 and S8 last.
`references/stages.md` has the steps, the subagent briefs and the models.

| Stage | Thread | What runs | Exit |
|---|---|---|---|
| S0 Intake | main | The interview. The goal and the one decision the work drives, `astack:in-your-own-words` and `astack:sharpen`, `astack plan attended` | The goal is one sentence, the decision is named, and the done check is false today |
| S1 Facts | subagents | `astack:how`, `astack:why`, `astack:recall`, `astack:research` | A facts brief under one page, with each open question sorted by kind |
| S2 Grill | main | `astack:grilling` over the whole frontier, at most 7 questions in a round | The frontier is empty and the owner agrees |
| S3 Words | main | `astack:domain-modeling` writes each term at once | Each `terms:` entry is in the glossary |
| S4 Design | lead subagent | `astack:architect` phases A and B with checkpoint | A sketch branch that compiles, and its open questions sorted |
| S5 Sequence | main | Sessions, steps, waves, lanes and hot-file regions | The checker passes, and the first session can start now |
| S6 Stress | lead subagent | `astack:interrogate` on the sketch, or a premise attack | No Act-on finding is open |
| S7 Tracker | main | The footprint of the tier | The standard tier writes no new object |
| S8 Hand-off | main | The final round, the execution grant, the plan commit | The reply below |

S1 and S6 always start at least one subagent.
S4 starts one when its trigger holds.
Skip S4 only when the work stays inside one function and adds no module, seam or schema.
Then write `exhaust the design space. n/a. <reason>` under `## Gates`.

## Write the plan

Start from `astack check-plan --template`, `--template=programme` or `--template=brief`.
`references/template.md` has each rule.
Run `astack check-plan <file>` after each batch of edits.
Fix each line it prints.
Before `status: active`, run it with `--strict`.
`--strict` fails on a warning, but never on a size note or a count of steps.
Never split a session to clear a note.

Log each gate verdict as a trail row. The pass of interrogate and of exhaust the design space needs the result of a subagent as its evidence. A gate that fails, does not apply or has a waiver gets one line under `## Gates`.

## Round format

A round is plain text. Ask the whole frontier, at most 7 questions. Give each question lettered options and one recommendation:

```text
Q1. <Title>? <One paragraph.>
a. <Option>. Recommended, because <evidence> (principle <name>).
b. <Option>. <Its cost>.
```

`<name>` is a principle reference name from the `astack:principles` index, such as `fix-root-causes`.
Run `astack skill-path astack:principles references/<name>.md` for its file.
Read the path it prints.
The owner answers in short codes, such as "Q1 a, Q2 b".
"agree" accepts each recommendation.

End the round with the veto list. It holds the agent calls that you wrote as `default` rows since the last round:

```text
Defaults. I decided these because each is cheap to reverse. One "agree" keeps them all.
- <Decision>. Because <evidence>. Rejected. <Option>.
```

Under a delegation grant, send no round for agent calls. List the `delegated` rows since the last round in one line each, at the next checkpoint.

After the answers, write each decision as a row with `Settled` set to `user R<n>`.
A default that the owner accepts becomes `user R<n>` too.
Log one `answer` trail row for each decision.
Then send a read-only subagent to test the answers' factual claims against the code.
A contradiction becomes a question in the next round.

## Reply

- An attended round. Use the round format, with no line limit, and wait.
- An attended quick plan. 15 lines or fewer. The unresolved questions come last.
- At each other run end, use 6 plain lines or fewer, in this order:
  - The plan path.
  - The summary line of the checker.
  - The `now` session and its start command, `astack session start <plan>`.
  - Each failed gate.
  - What the run wrote to the tracker.
  - Last, `Unresolved questions. <N> in <plan path>.`.

Use no headings, no bold labels and no colons in the middle of a sentence. Then stop. The build starts only when the owner says so, or under a delegation grant.

## References

- `references/tiers.md`: the tiers, the interview ritual, plan mode and the tracker footprint.
- `references/stages.md`: S0 to S8, with the subagent briefs and the models.
- `references/template.md`: the plan file, the caps, the checker, the trail and the life of a plan.
- `references/sessions.md`: the session protocol, waves, the integrator lane, checkpoints and `astack session`.
- `references/programme.md`: the index, milestones, blocks, briefs, decision issues and `astack board`.
- `references/tracker.md`: `astack plan export`, `move`, `import`, `drift` and `keys`, with the Linear and GitHub maps.
- `references/upkeep.md`: resume, the session boundary, the milestone exit, diverge, pause and close.
- `references/phase-boundaries.md`: when to continue, clear, hand off, delegate or compact at a phase boundary.
- `references/unattended.md`: runs with nobody to answer.
- `references/routing.md`: the kinds of question and who settles each.
- `references/fallbacks.md`: what to do when a skill or capability is unavailable.
