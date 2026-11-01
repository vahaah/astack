---
plan: faster-prs
tier: standard
status: active
home: repo
tracker: none
delegate: off
checkpoints: report
owner-gates: [production merge, hosted migration, money, legal, accounts, secrets, client messages, destructive resets]
execute: [S1]
reviewed: 2026-11-01
---

# PR head checks use one command with every rule intact

Keep the current checks and reduce the work around them.
The first PR moves repeated PR head checks into one CLI command.
The command preserves the existing procedure at each required point.
Local measurements come before any claim on complete PR time or tokens.

## Context

The `astack:pr-review-hardening` skill reads the PR head before the baseline, before each gate run, and after each push.
The procedure lives in `marketplace/plugins/astack/skills/pr-review-hardening/SKILL.md` and its `references/gate.md`.
The head check reads GitHub state, fetches the PR commit, checks ancestry, and reports local commits.
Real task duration and total token counts have no measured baseline for this work.

## Goal

Goal. Complete PRs sooner with fewer total tokens and preserve every current check.
Decision. Which repeated work will the first PR remove?
Done when. The CLI reproduces every existing head-check outcome, and engine checkpoints invoke one command.

## Scope

- In. One CLI command, all engine callers, the stub fallback, tests, measurements, and generated builds.
- Out. Changes to reviewers, iteration bounds, gate commands, check frequency, merge rules, or result reuse.
- Out. Live installs, tracker writes, production operations, and other skill changes.

## Decisions

| # | Kind | Decision | Rejected | Door | Settled | Record |
|---|---|---|---|---|---|---|
| D1 | goal | Complete PRs sooner with fewer tokens while keeping the current checks | Minimize tokens or wait time alone | two-way | user R1 | plan |
| D2 | decision | Consolidate the repeated PR head procedure in the first PR and retain all current checks | Change which instructions each route reads first | two-way | user R2 | plan |
| D3 | tech | Use a direct command with fresh reads, early failure returns, and exit codes checked with terminal prefixes | Add a watcher mode or accept an exit code alone | two-way | user R3 | docs/plans/pr-head-check/sketch.md |
| D4 | rule | Measure local command time and observed tool calls first; reserve complete PR time and token claims for matched complete runs | Treat fewer prose steps as measured time or token savings | two-way | user R3 | plan |

## Sessions

### S1 Repeated PR head checks use one command

State. now
Branch. codex/faster-pr-head
Depends on. None.
Exit.
- The command preserves every current outcome, operation order, and original error output.
- Every existing check still runs at the same required point.
- Missing runtime output or an unknown result cannot pass a caller.
- The stub keeps the manual procedure when no CLI is available.
- Local measurements report duration and observed tool calls, with absent token counters named as absent.
- The existing repository gates pass.
Proof. `bun test tests/astack/pr-head.test.ts tests/hardening-consistency.test.ts` and `bun run check`.
Baseline. `bun src/astack/cli/bin.ts check pr-head` exits 2 because the command is absent.

| # | Step | Wave | Lane | Files | Covers | Exit | Proof | Checkpoint |
|---|---|---|---|---|---|---|---|---|
| 1 | Add the command with CLI acceptance checks | W1 | integrator | tests/astack/pr-head.test.ts, src/astack/cli/commands/check/pr-head.ts, src/astack/cli/commands/check/index.ts | D1, D2, D3 | Each result, error stream, and stop order matches the contract | `bun test tests/astack/pr-head.test.ts tests/astack/registry.test.ts` | report |
| 2 | Move every engine caller and preserve the manual fallback | W2 | integrator | marketplace/plugins/astack/skills/pr-review-hardening/, templates/pr-review-hardening.stub.SKILL.md, tests/hardening-consistency.test.ts, docs/design.md, docs/review-lessons.md | D2, D3 | Every checkpoint uses the command and every fallback keeps the same checks | `bun test tests/hardening-consistency.test.ts tests/review-lessons.test.ts` | report |
| 3 | Measure the command paths and rebuild each client | W3 | integrator | scripts/bench-pr-head.ts, docs/runbooks/workflow-measurement.md, marketplace/plugins/astack/bin/astack.js, dist/ | D1, D4 | The report separates local results from unavailable complete-task evidence | `bun scripts/bench-pr-head.ts` and `bun run check` | report |

## How each step runs

Record the red CLI acceptance check before implementation.
Commit each test with its implementation, so every commit passes.
Update all callers in one step.
Build generated files through their normal commands.

## Proof

- Compare the existing procedure with the proposed command on the same synthetic Git and GitHub cases.
- Use real temporary Git repositories and a bare origin, with a fake `gh` at the external API edge.
- Assert exact stdout, stderr, exit codes, process arguments, and no later operations after a failure.
- Preserve the precise missing-PR diagnostic and each failure outcome.
- Keep the original explicit-PR selection read.
- Add a fresh head read inside each command call.
- Preserve every existing Git operation and its order at every required point.
- Accept only exit 0 with `ok:` or exit 3 with `no_pr:` on the last output line.
- The explicit-PR path can never return `no_pr:`.
- Stop at every caller when the exit code and prefix do not form an accepted pair.
- Keep the manual fallback when `command -v astack` fails.
- Keep model, effort, task, code, tools, environment, and initial state fixed for each matched run.
- Count tokens from all agents and retries, with cached input counts separate when the provider reports them.
- Report unavailable token counters as unavailable.
- A shorter instruction or command path proves only that local reduction.
- Include the extra explicit-PR read in local benchmarks and separate process time from model response time.
- Claim PR savings after three matched pairs reduce total tokens and median time with every check intact.
- Run `bun run check:drift` before any rebuild and `bun run check` before a commit.

## Premises

- Fewer model calls can reduce coordination time. A matched run with no reduction in observed calls disproves this premise.
- The CLI can preserve the manual outcomes. A mismatch in any result or error path disproves this premise.

## Risks

Review or test time can dominate the work, so fewer model calls can leave total PR time unchanged.
The command must preserve fresh state reads and the current failure rules.
The extra explicit-PR read can increase process time, so the benchmark must include it.
The first PR cannot prove complete PR savings without complete task and provider usage records.

## Gates

foundational thinking. The sketch uses the existing Command and Io contracts before behavior changes.

subtract before you add. The caller migration removes the manual engine procedure in the same step.

sequence verifiable units. Each test goes in the same green commit as the behavior it guards.

outcome-oriented execution. The command and all engine callers move in one session.

migrate callers then delete legacy APIs. Every engine caller moves in step 2, and the required CLI-absent fallback remains.

exhaust the design space. The sketch compares a direct check command with a watcher mode.

prove it works. CLI acceptance checks use real Git repositories and exact outputs.

attack the premise. Each premise has a falsifier, and no earlier failed attempt is known.

interrogate. The corrected sketch and plan resolve the factual findings. The owner accepts the proof decision.

## Unresolved questions

None.
