---
name: arena
description: "Run parallel candidates on one task. Use for /astack:arena, \"arena this\", \"throw it in the arena\", or substantial work that needs alternative designs. Choose a base, integrate useful parts from other candidates, and verify the result."
disable-model-invocation: true
---

# Arena

Principle references live at `${CLAUDE_SKILL_DIR}/../principles/references/<title>.md`.
Read each principle in full when you apply it.

Before any launch, open a task list for Frame, Fan out, Cross-judge, Pick, Graft and Verify.

## Phase A: Frame

Every candidate receives the same prompt.
That prompt is the contract.

1. State the artifact that each candidate must produce.
2. Define 3 to 6 concrete, gradeable success criteria for this task. The picker uses them in Phase D. Candidates see only the task.
3. Pick runners from `arena runners` in `astack-models.md`. If the rule or line is missing, use one `opus` and one `codex`. A Claude entry, `opus`, `sonnet`, `haiku` or `fable`, runs through Agent with that `model`. For `auto` or `inherit-parent`, omit `model` to inherit the parent. This applies to runners and the cross-judge. Run external entries such as `codex` through Bash with [references/external-seats.md](references/external-seats.md). If the CLI is missing or signed out, use `sonnet` for that seat. Report the fallback. Run any other entry, such as another tool's model slug, on `opus`. Report that fallback too. Add runners when the task has several design directions. Reuse one model N times for generation-bound work that does not need diverse judgment. Match effort to the job with the Subagents section of **mode** at `${CLAUDE_SKILL_DIR}/../mode/SKILL.md`.
4. Give each candidate its own output location, per **separate-before-serializing-shared-state**. Give a Claude repo writer `isolation: "worktree"` on its Agent call. Give an external writer a worktree with `git worktree add`. A seat that writes only its own files can use `/tmp/arena-<slug>/candidate-<n>/`. Use the session scratchpad if the sandbox blocks `/tmp`.

## Phase B: Fan out

Spawn all N subagents in one message with `run_in_background: true`.
Start external seats' background Bash calls in that same message.
Give each seat the task, shared grounding path and its own output path.
Ask for the artifact and a short rationale.
The rationale names alternatives and rejected options.

If a candidate returns no output, continue with N-1.
Report the dropout.

## Phase C: Cross-judge

Wait for every Phase B candidate to finish.
Then choose one model from `arena cross-judge pool` in `astack-models.md`.
If the rule or line is missing, choose from `codex` and `opus`.
Prefer another model family from the parent's.
For a Claude parent, prefer an external entry with a working CLI.

Spawn one read-only judge on that model.
Use the read-only form for an external seat.
For a `general-purpose` subagent, forbid edits.
Give it the rubric and candidates labeled by path.
It scores each criterion and recommends a base with its rationale.
Run it in parallel with your Phase D reading.
Never start it while candidates still write.

## Phase D: Pick a base

Read every candidate in full.
Score each rubric criterion separately.
Compare your scores with the cross-judge.
Agreement supports the base choice.
Disagreement can indicate bias or an unclear rubric.
Read both rationales before you decide.

Choose the base that a future maintainer can extend without breaking invariants.
For a tie, prefer the cleaner seam or smaller API, per Laziness Protocol.

## Phase E: Graft

Read each losing candidate again for useful parts.
Usually take one or two parts rather than most of the candidate.
Integrate each part by hand under one coherent design, per **redesign-from-first-principles**.
Do not paste the parts mechanically.

If candidates converge on one shape, report the agreement and use that shape.
No addition from another candidate is necessary.
If the shapes differ too widely, treat Phase A as underspecified.
Reframe the task and rerun it instead of averaging incompatible designs.

## Phase F: Verify

Verify the synthesized artifact directly, per **prove-it-works**.
If verification finds a missed problem, inspect its cause.
For a wrong Phase A, reframe and rerun.
For a useful candidate part missed during synthesis, return to Phase E.
Do not hide the problem with a local patch.

## Outputs

Return one synthesized artifact and a short synthesis note.
Name the base and its selection reason.
Include the cross-judge's verdict.
Name each addition and its source candidate.
Record rejected parts and their reasons, convergence, dropouts and the verification result.
