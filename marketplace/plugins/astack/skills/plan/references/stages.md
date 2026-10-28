# Stages

Each stage names its thread, its steps and its exit.
Find a by-path skill with `astack skill-path <plugin>:<skill>`.
Read the path it prints.

## Agents and models

| Work | Thread and depth | Agent and model |
|---|---|---|
| Intake, rounds, glossary and plan writes, the checker | main, depth 0 | The session model. Grilling quality follows model strength |
| Facts | explorers at depth 1, the fan-out of how and why at depth 2 | `astack:explorer` on `sonnet` for explorers, `astack:delegate` on `opus` for how, why and synthesis, `haiku` for recall |
| Design space | lead at depth 1, arena runners and judge at depth 2 | `astack:delegate` on `opus` with `isolation: "worktree"`, one `codex exec` runner, and `codex exec --sandbox read-only` as judge |
| Prototype | depth 1 | `astack:delegate` on `sonnet` in a scratch worktree |
| Stress test | lead at depth 1, reviewers at depth 2 | `opus` reviewers, plus `codex exec --sandbox read-only` |

Keep depth 3 free.
Never require the Workflow tool for planning.
When `codex` is not on the PATH, use a `sonnet` seat.
Then say that the second model family is missing.
Tell each read-only subagent to change nothing.

## Agent briefs

S1 and S6 make at least one Agent call each.
S4 makes one whenever it runs.
Paste these briefs.
Fill the angle brackets.
Each subagent finds its skill with `astack skill-path`.
It reads the path that the command prints and follows the skill.
Keep a pointer to each result for the trail, such as the agent id or the report path.

```text
S1 how     subagent_type "astack:delegate", model "opus", run_in_background true
           prompt: Read-only, change nothing. Run `astack skill-path astack:how`, Read that file, and follow it on <subsystem> for this goal: <goal>. Return the architecture as file:line pointers in at most 40 lines.
S1 why     the same, with `astack skill-path astack:why`, on <the shape that changes>. Return its Preserve, Change, Avoid and Risk set.
S1 recall  subagent_type "general-purpose", model "haiku", run_in_background true
           prompt: Read-only. Run `astack skill-path astack:recall`, Read that file, and follow it for earlier attempts at <work>. Return what failed and why.
S1 search  subagent_type "astack:explorer", model "sonnet", run_in_background true
           prompt: Find every file that <work> touches and every test that covers it. Return pointers only, with the hot files that many steps will edit.
S4 lead    subagent_type "astack:delegate", model "opus", isolation "worktree"
           prompt: Run `astack skill-path astack:architect`, Read that file, and run phases A and B with checkpoint on <fork>, given <facts brief> and <decisions>. Stop after Phase B. Leave branch sketch/<slug> whose types compile, and return the branch, the rationale path and the open questions.
S6 lead    subagent_type "astack:delegate", model "opus"
           prompt: Read-only. With branch <sketch branch>, run `astack skill-path astack:interrogate`, Read that file, and run it on the branch with this intent: <goal and decision>, planned in <plan path>. With no sketch, run `astack skill-path astack:principles references/attack-the-premise.md`, Read that file, and attack the premises and the sessions of <plan path>. Return each Act-on finding in one line with its kind.
```

In an unattended run, each Agent call runs in the foreground.
Pass `run_in_background: false`.
Use `general-purpose` with the same model and prompt in place of `astack:delegate`.
The delegate frontmatter sends it to the background.
Make calls that can run together in one message.
Then they still run in parallel.

A headless session prints a result each time your turn ends.
A caller that stops at the first result loses the plan.
Never end the turn to wait for a subagent.

## S0. Intake, main

1. Parse the arguments. They give the work to plan, or a slug, a plan path or a ticket key, plus `--tier` and `--afk`.
2. Look for a plan that covers the work.
   Run `astack check-plan --brief`.
   Read the plan directory and the tracker.
   When a plan exists, switch to its mode in `upkeep.md`.
3. Read the `plan` block of `.astack/profile.json`. It gives `dir`, `glossary`, `adr`, `branchPrefix`, `wip` and `team`.
4. Run `astack plan attended` as its own Bash call. On `unattended`, follow `unattended.md` for the rest of the run.
5. Interview the owner, as `tiers.md` says. Ask for the actual goal and for the one decision the work drives.
6. Read `astack:in-your-own-words` and `astack:sharpen` by path.
   Apply both to the request.
7. Write `Goal.`, `Decision.` and `Done when.`. Show that `Done when.` is false today when that costs one command.
8. Propose a tier with its signals, and a slug of two to four kebab-case words.
9. When the slug exists and writes are allowed, log the run with `astack plan trail <slug> start "<what this run does>" "<why now>" "<session pointer>" open`.

Exit. The goal is one sentence, the decision is named, and the done check is false today.

## S1. Facts, subagents

Launch these in one message with the briefs above.
Start S2 at once.
Wait only for questions that need an active subagent's result.
Start at least the `how` run, even for a small repo.
Then the facts come from a fresh context.

- One `astack:how` run for each touched subsystem.
- One `astack:why` run when the work changes an existing shape. Its Preserve, Change, Avoid and Risk set becomes constraints on the plan.
- One `astack:recall` run for earlier attempts at the same work.
- `astack:research` in the background for facts outside the repo. Its file goes to a `research/<slug>-<topic>` branch, never to main.

Write the facts brief to the session scratch directory.
Keep it under one page.
Sort each open question by kind, as `routing.md` says.
A headless run can refuse writes outside the repo.
In that case, keep the brief in your context.
Pass it inline to the S4 and S6 leads.

Exit. The brief exists, and each open question has a kind.

## S2. Grill rounds, main only

1. Call the Skill tool with `astack:grilling` and `astack:domain-modeling`. Make sure that both loaded before round 1.
2. Map the design tree. The frontier is each owner call whose prerequisites are settled.
3. Round 1 covers the tier, the goal, scope in and out, fixed constraints, the deadline and the risk appetite.
4. Ask the whole frontier, at most 7 questions, in the round format of SKILL.md.
5. Write each answer as a D row in the same turn, with its kind and `Settled` set to `user R<n>`. Log an `answer` trail row.
6. Test the answers with a read-only subagent, as `routing.md` says.
7. Find the new frontier.
   Ask the next round.

Exit. The frontier is empty, and the owner agrees that the plan is shared.

## S3. Words, main, during each round

1. `astack:domain-modeling` challenges each fuzzy term. It writes the resolved term to the glossary at once.
2. Add each term that the plan uses to the frontmatter `terms:` list.
3. Offer an ADR only when the three tests of `astack:write-docs` hold.
   The decision must be hard to reverse and surprising without context.
   It must also come from a real trade-off.
4. Cite the ADR from the Record of the row as `ADR NNNN Dn`.

Exit. Each `terms:` entry is a bold term in the glossary. Each one-way row has an ADR or a question that says `Settles. D<n>.`.

## S4. Design space, lead subagent

Run S4 only when the work crosses a function boundary or adds a module, a seam or a schema.
Brief one lead subagent with the goal, the facts brief and the decisions so far.
The lead follows these steps:

1. Read `astack:architect` by path and run phases A and B with checkpoint. Phase C builds, so the lead stops after Phase B.
2. Read `astack:arena` by path. Follow it only on forks with no precedent in the repo and on one-way doors.
3. Screen each candidate against `references/design-red-flags.md` of architect. Compare them in the depth terms of `astack:codebase-design`.
4. Send forks that a test can settle to a `prototype/<slug>-<topic>` branch. A fork that a person must judge comes back to the main thread for `astack:prototype`.
5. Leave a sketch branch whose types and `not implemented` bodies compile, and a rationale.

End the brief of the lead with this line: "Run every nested agent and command in the foreground, never end your turn to wait, and make your final message the report."

Read the sketch with `git -C <worktree path>` or by path.
Never `cd` into the worktree.
A later write from there can change the sketch.

Then hold a ratification round.
For the ratified shape, write a row with `Settled` set to `user R<n>`.
Its Record points at the sketch branch.

After the lead reports, remove its worktree with `git worktree remove <worktree path>`.
Keep only the sketch branch.
A locked worktree stays behind as an untracked folder in `git status`.
It blocks later fan-outs.

Exit. A sketch that compiles, a rationale, and its open questions sorted.

## S5. Sequence, main

Read `astack:principles` by path.
Follow its index to each principle that applies.
Read the slicing rules of `astack:to-tickets` by path.

1. Cut the work into sessions.
   The standard tier usually has one session and one PR.
   Add a session only for a separate PR that the owner wants, such as a security fix.
2. Cut each session into steps, ordered by value to the goal. Put subtraction first, then shared types and helpers, then the riskiest unknown, then vertical slices.
3. Give each step one Exit check, its Files and the D rows it covers.
4. Put steps that can run in parallel in one wave. Give each a lane. Put migrations, database tests and work on a shared hot file in the `integrator` lane.
5. Make sure that no two steps of one wave list the same hot-file region. Move one of them to the next wave.
6. Mark a step `approve ui` for UI taste and `approve one-way` for a one-way door. Each other step reports.
7. Set the rolling wave. The first session is `now`, the second is `next`, and the rest are `later` with their Fog.
8. Run the `Proof.` of the `now` session on trunk.
   Write the number in `Baseline.`.

Exit. `astack check-plan` passes, and the first session can start now.

## S6. Stress test, lead subagent

1. Start the S6 lead with its brief. With a sketch from S4, it reads `astack:interrogate` by path and follows it on that branch. With no sketch, it attacks the premises of the plan instead. End the brief with the same line as the S4 lead: "Run every nested agent and command in the foreground, never end your turn to wait, and make your final message the report."
2. Write `## Premises` when the plan rests on beliefs. Each premise names the observation that falsifies it.
3. When recall found failed attempts, run `astack skill-path astack:principles references/attack-the-premise.md`.
   Read the path it prints.
   Take the census that the principle describes.
4. Sort each Act-on finding by kind. Apply the facts and agent calls yourself. Send the owner calls to the final round.
5. Judge the nine gates. Log each pass as a `gate` trail row. Write each fail, n/a or waiver under `## Gates`. The pass of interrogate and of exhaust the design space cites a subagent result as `agent:<id>` or `branch:<sketch>`.

| Gate | Passes when |
|---|---|
| foundational thinking | The shared types, helpers and data shape come before the features |
| subtract before you add | A step removes dead code or paths before new code lands on them |
| sequence verifiable units | Each step ends green and can be checked alone |
| outcome-oriented execution | Each session gives behavior that a user or an operator can see |
| migrate callers then delete legacy APIs | Each replaced API is deleted in the step that moves its callers |
| exhaust the design space | Each design fork had two or more candidates of different structure |
| prove it works | Each Proof runs on the real artifact, not a proxy |
| attack the premise | Each premise has a falsifier, and earlier failed attempts were counted |
| interrogate | No Act-on finding of the S6 lead is open |

Exit. No Act-on finding is open, and `astack check-plan` passes.

## S7. Tracker, main

Write only what the tier allows, as `tiers.md` says.

- quick. One comment with the decisions on the ticket.
- standard. Nothing new. The status and the hand-off come from `astack session` during the build.
- programme. Only when the owner asks, `astack plan export` after a dry run, as `tracker.md` says.

Exit. The tracker holds what the tier allows, and nothing more.

## S8. Hand-off, main

1. Hold the final round. Ask the remaining owner calls and the test seams.
2. Ask for the execution grant, as "Build S1 with `astack session start <plan>`?". Under a delegation grant, skip this question.
3. Only the answer of the owner, or a grant, sets `execute:`. Then set `status: active`.
4. Run `astack check-plan --strict <file>`.
   Fix each line.
5. Commit the plan, the glossary and the ADRs in one commit. Push it with the session PR, or in one docs PR.
6. Pick the context move with `references/phase-boundaries.md`.

Exit. The reply in SKILL.md, then stop.
