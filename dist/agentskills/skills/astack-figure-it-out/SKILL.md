---
name: "astack-figure-it-out"
description: "Design a reviewable workflow when no narrower playbook fits. Use for /astack-figure-it-out, large migrations, or unattended work."
license: "MIT"
metadata:
  astack-version: "0.1.0"
  source: "astack, adapted from pstack"
  disable-model-invocation: "true"
---

# Figure it out

Design a workflow when no narrower playbook fits the task.
Before code, give the human a sequence of phases with suitable proof and a reviewable decision trail.

These astack skills permit invocation by the user only.
Read each named `SKILL.md` and follow it from this thread.
Read each applicable principle in full under `../astack-principles/references/<title>.md`.

## Start

Create a task list.
Its first item reads the principle index at `../astack-principles/SKILL.md`.
Then add the phases below.

## Phase A: Frame the work

When astack is installed, start with `/astack-plan` as the mode playbooks require.
Use the returned plan to frame the work.

Before the run, state these facts:

- A definition of done that evidence can disprove.
  Apply `prove-it-works`.
- Approximate units of work, effort, and discovered blockers.
- The level of proof, checks, and artifacts that the risk needs.
  Prefer more proof when the risk is uncertain.

A hard-to-reverse choice or a broad impact needs more proof.
A reversible step with little impact needs less.
A request to try harder does not define proof.

Present the scope and tradeoffs before you commit to a long run.
Continue reversible work under `never-block-on-the-human`.
Use one checkpoint before a run that takes several hours.

## Phase B: Design the workflow

Split the work into small units that can land independently.
Test the riskiest unknown first.
Build the required structure and verification before features.
Apply `foundational-thinking`.

- Build the verification driver before the work.
  Capture the unchanged baseline so the check compares old and new results.
- For a hard-to-reverse design, read `../astack-architect/SKILL.md` and follow it.
  It runs `arena`.
  Skip that review for mechanical work with a settled shape.
  Do not run a second arena over an accepted design.
  Apply `laziness-protocol`.
- Choose the work that can run in parallel.
  Use parallel workers only across module seams.
  Give each worker a separate worktree or branch.
  Apply `separate-before-serializing-shared-state`.
  Use only as many workers as the work needs.
  Follow the model and effort rules in `../astack-mode/SKILL.md`.
- Write the phase list for human review.

Add the designed steps between Phase C and Phase D in the task list.
Run every step under the Phase C loop.
Add a Phase D log row as each step lands.
Do not save the whole log for the end.

## Phase C: Test each unit

Treat each unit as an experiment:

1. State the hypothesis.
2. Make the smallest change.
3. Measure the real artifact against the definition of done.
4. Keep the change if it advances the result.
5. Revert it if it does not.

Apply `sequence-verifiable-units` before the next unit.
Do not defer all checks to the end.

Inspect the artifact instead of relying on a worker's report.
If a check passes too easily, inspect the observation method first.
Give delegated work an independent judge.
If a worker exploits a weak check, reset the work and strengthen the contract.
If the check is wrong, correct it in a separate change.
Do not bypass it.

Use `VERIFIED`, `NOT VERIFIED`, or `INCONCLUSIVE` as the verdict.
`INCONCLUSIVE` is not a pass.
Report negative results.

## Phase D: Keep the decision trail

Read `../astack-show-me-your-work/SKILL.md` and follow its log format.
This work usually needs a committed trail so a reviewer can inspect it with the PR diff.
The trail must let the human assess the work after time away.

## Phase E: Verify and report

Check the whole result against the Phase A definition on the real product.
A passing verification driver alone is insufficient.
Turn recurring corrections into checks, lint rules, scripts, or other enforced structure.
Apply `encode-lessons-in-structure`.

Report the designed playbook, its level of proof and reason, and the decision-trail path.
State what the evidence verifies and what remains open.
