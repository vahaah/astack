# Stages

Each stage names its thread, steps and exit.
Read each by-path skill via `astack skill-path <plugin>:<skill>`.

## Agents and models

| Work | Thread and depth | Agent and model |
|---|---|---|
| Intake, rounds, glossary, plan writes, checker | main, depth 0 | Session model |
| Facts | explorers depth 1, how/why/recall depth 2 | `astack:explorer` (`sonnet`), `astack:delegate` (`opus`) for how/why, `haiku` for recall |
| Design space | lead depth 1, runners and judge depth 2 | `astack:delegate` (`opus`, worktree), `codex exec` runner, `codex exec --sandbox read-only` judge |
| Prototype | depth 1 | `astack:delegate` (`sonnet`, scratch worktree) |
| Spec review | lead depth 1, reviewers depth 2 | `opus` reviewers and `codex exec --sandbox read-only` |

Keep depth 3 free and never require the Workflow tool.
When `codex` is off PATH, use a `sonnet` seat and report the missing model family.
Tell read-only subagents to change nothing.

## Agent briefs

S1 and S6 each start a subagent, and S4 starts one when it runs. Keep result pointers for the trail.

```text
S1 how     subagent_type "astack:delegate", model "opus", run_in_background true
           prompt: Read-only. Run `astack skill-path astack:how`, Read it, follow it on <subsystem> for <goal>. Return file:line pointers in at most 40 lines.
S1 why     same with `astack skill-path astack:why` on <shape>. Return Preserve, Change, Avoid and Risk.
S1 recall  subagent_type "general-purpose", model "haiku", run_in_background true
           prompt: Read-only. Run `astack skill-path astack:recall`, Read it, follow it for prior attempts at <work>. Return what failed and why.
S1 search  subagent_type "astack:explorer", model "sonnet", run_in_background true
           prompt: Find touched files, hot files and covering tests for <work>. Return pointers only.
S4 lead    subagent_type "astack:delegate", model "opus", isolation "worktree"
           prompt: Run `astack skill-path astack:architect`, Read it, run phases A and B on <fork> from <facts> and <decisions>. Stop after Phase B. Return compiling branch sketch/<slug>, rationale and open questions.
S6 lead    subagent_type "astack:delegate", model "opus"
           prompt: Read-only. Read references/spec-review.md. Review <plan> against <goal and decision>. Return criterion ID, failure scenario, property, verification obligation and open owner choices.
```

In unattended runs, run every Agent call in the foreground (`run_in_background: false`) with `general-purpose` instead of `astack:delegate`.
Batch parallel calls in one message. Never end a turn to wait in a headless session.

## S0. Intake, main

1. Parse work, slug, plan path or ticket key, plus `--tier` and `--afk`.
2. Check for an existing plan with `astack check-plan --brief`, the plan folder and the tracker. Switch to `upkeep.md` when one exists.
3. Read `plan` in `.astack/profile.json` (`dir`, `glossary`, `adr`, `branchPrefix`, `wip`).
4. Run `astack plan attended`. On `unattended`, follow `unattended.md`.
5. Ask the owner for the actual goal and the one decision the work drives.
6. Read `astack:in-your-own-words` and `astack:sharpen` by path and apply both.
7. Write `Goal.`, `Decision.` and `Done when.` (show false today when cheap).
8. Propose a tier with signals (`SKILL.md`) and a two- to four-word kebab-case slug.
9. Log `astack plan trail <plan> start "<what>" "<why>" "<session pointer>" open` when writes are allowed.

Exit. One-sentence goal, decision named, done check false today.

## S1. Facts, subagents

Launch the briefs in one message and start S2 at once.
Read `astack:how` by path for each touched subsystem.
Read `astack:why` by path for shape changes and `astack:recall` by path for prior attempts.
For external facts, run a background `general-purpose` subagent against primary sources that commits a cited file on `research/<slug>-<topic>`.
Keep the facts brief under one page (in scratch, or inline when headless) and sort questions with `routing.md`.

Exit. Facts brief exists and each open question has a kind.

## S2. Grill rounds, main only

1. Call the Skill tool with `astack:grilling` and `astack:domain-modeling` before round 1.
2. Round 1 covers tier, goal, scope, constraints, deadline and risk appetite.
3. Ask the whole frontier (at most 7 questions) in `SKILL.md` format.
4. Record each answer as a `user R<n>` row and log an `answer` trail row.
5. Verify factual claims with a read-only subagent (`routing.md`) until the frontier is empty.

Exit. Frontier empty and owner agrees.

## S3. Words and context, main, during each round

1. `astack:domain-modeling` challenges fuzzy terms and writes resolved terms to the glossary at once.
2. Name the context from the `CONTEXT.md` contexts card that owns the change, ready for the `domain` block.
3. Add each used term to frontmatter `terms:`.
4. Offer an ADR only when the three tests of `astack:write-docs` hold. Cite it as `ADR NNNN Dn`.

Exit. Each `terms:` entry is in the glossary, the card context is named, and one-way rows cite an ADR or question.

## S4. Design space and domain block, lead subagent

Run S4 when work crosses a function boundary or adds a module, seam or schema.
A plan with no code path has no `domain` block.

1. The lead reads `astack:architect` by path for phases A and B and reads `astack:arena` by path on one-way doors. It examines `design-red-flags.md` and `astack:codebase-design`.
2. Send testable forks to `prototype/<slug>-<topic>`. Return person-judged forks to main (`astack:mode playbooks/prototype.md`).
3. End the lead brief with: "Run every nested agent and command in the foreground, never end your turn to wait, and make your final message the report."
4. Draft `## Domain and effects` with one `domain` fence from `astack check-plan --template=domain` naming the S3 context, aggregates, invariants, capabilities, steps, flows and laws.
5. Read the sketch through `git -C <worktree>` (never `cd`), hold ratification, and remove the worktree while preserving the branch.

Exit. Compiling sketch, drafted `domain` block for code plans, rationale and sorted questions.

## S5. Sequence and step links, main

Read `astack:principles` by path and apply each matching reference.
Cut vertical slices, put subtraction and shared types first, and use expand, migrate, contract for wide refactors.

1. Cut sessions (usually one PR for standard tier) and steps ordered by value.
2. Give each step `Exit`, `Files`, `Covers` and `Checkpoint` (`approve ui`, `approve one-way`, or `report`).
3. For a code plan, link each `step` in the `domain` block to one `Files` cell `<module>#<name>`.
4. Group parallel steps into waves with lanes. Put migrations, database tests and shared hot files in `integrator`.
5. Keep one editor per hot-file region in each wave.
6. Set states (`now`, `next`, `later`) and record `Baseline.` from running `Proof.` on trunk.

Exit. `astack check-plan` passes, every block step links one `Files` cell, and the first session can start now.

## S6. Spec review and laws, lead subagent

1. Start the S6 lead with `references/spec-review.md` and the foreground instruction.
2. Add `## Premises` with falsifiers. Read `astack:principles references/attack-the-premise.md` by path when recall found failed attempts.
3. Give each `inv` and write `cap` in the `domain` block a `law` whose `check:` runs on code. Let `astack check-plan` derive the rung.
4. Apply facts and send open product or risk calls to the final round.
5. Judge the nine gates and log each pass as a `gate` trail row (or fail, n/a or waiver under `## Gates`).

| Gate | Passes when |
|---|---|
| foundational thinking | Shared types, helpers and shape precede features |
| subtract before you add | Dead code leaves before new code lands |
| sequence verifiable units | Each step ends green and verifies alone |
| outcome-oriented execution | Each session gives visible behavior |
| migrate callers then delete legacy APIs | Replaced APIs leave with caller migration |
| exhaust the design space | Forks compared two or more distinct shapes |
| prove it works | Proofs run on the real artifact |
| attack the premise | Premises have falsifiers and prior failures counted |
| interrogate | Properties have obligations and no owner choice is open |

Exit. Spec review passes, each `inv` and write `cap` has a code law, and `astack check-plan` passes.

## S7. Tracker, main

- quick: one decision comment on the ticket.
- standard: nothing new (`astack session` writes status and hand-off during build).
- programme: file the map issue and each `Binds.` decision issue through `astack:write-ticket` when asked, then write keys back with `astack plan keys <plan>` (`tracker.md`, `programme.md`).

Exit. Tracker holds only what the tier allows.

## S8. Hand-off, main

1. Hold the final round for open owner calls and test seams.
2. Ask "Build S1 with `astack session start <plan>`?" unless a delegation grant holds.
3. Set `execute:` and `status: active` only after an owner answer or grant.
4. Run `astack check-plan --strict <file>` and fix every finding.
5. Commit plan, glossary and ADRs in one commit.
6. Pick the context move in `upkeep.md`.

Exit. Print the `SKILL.md` reply and stop.
