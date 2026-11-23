---
name: "astack-mode"
description: "Use for /astack-mode, \"what next\", \"go\" or \"resume\". The owner's way of work as a router over astack playbooks and skills. With no argument, it reads the plan, the tracker and git and does the next frontier step. It handles the delegation grant and keeps replies in STE."
disable-model-invocation: true
metadata:
  astack-version: "0.4.0"
---

# astack mode

This skill routes work to the playbooks and skills in `astack`. A stricter repo rule wins, then `astack`.
After compaction, read `SKILL.md` again. Delegates read `SKILL.md` and `references/worker.md`.

## Triggers

Apply `astack.md`. When absent, read `references/card.md`.
Every change follows [the required proof contract](references/change-proof.md), including docs, config and hotfixes. Cite it in briefs and run `astack check proof` before delivery.

- Nontrivial change, architecture call or "are we sure?": read `astack-how`.
- Fork before `AskUserQuestion`: follow the question rules below. Ask 1 to 4 questions with 2 to 4 options.
- Code: model the data shape first under Model the Domain. Load `astack-coding-rules` before the first edit, `astack-coding-guide` in the playbook chat, and tell each code delegate to load `astack-coding-rules`.
- Cross-function code: read `astack-architect` and compare designs in parallel.
- Parallel fan-out: `astack-swarm` for coverage, races and gauntlets, and `astack-arena` for bakeoffs.
- Contested design: review failure scenarios. Run `astack-interrogate` only on a user or profile ask.
- Multi-step work: write the throughput checkpoint from Feature step 3.
- Prose, docs, PR bodies and commits: use `astack-write-docs` and Replies below.
- Post-build, pre-review: run `/astack-deslop` (includes `/astack-no-comments`) and commit its edits.
- UI or CLI: drive with `/astack-control-ui` or `/astack-control-cli`, and reproduce bugs yourself first.
- Benchmarks or metrics: read `astack-benchmark-checklist` before acting or reporting.
- PR status asks: run Babysit (`playbooks/babysit.md` via `astack-babysit-pr`). Declare the mode first. Never run `drive` in a phase agent.
- Green stack landing: run Shipping (`playbooks/shipping.md`). Verify each PR independently and land only the contiguous verified run from the root.
- Review-bot comments: triage skeptically with `playbooks/review-bot-triage.md`.
- Broken skill: fix it in its own PR in astack, never silently work around it.
- Long or autonomous work: keep a decision trail with `astack-show-me-your-work`.

## Principles

Read each file with `astack skill-path astack:principles references/<name>.md` before applying it.
In your reply, name each principle that shaped a decision and what it changed. Cite only files read this session.

- `laziness-protocol`. Use when sizing a diff. Ship the smallest change.
- `foundational-thinking`. Use before logic. Define core types and state first.
- `redesign-from-first-principles`. Use on a new requirement. Reshape as if designed first.
- `attack-the-premise`. Use after repeated gate failures. Question the premise first.
- `subtract-before-you-add`. Use before adding. Delete dead code first.
- `minimize-reader-load`. Use on complex code. Cut wrappers and mutable state.
- `outcome-oriented-execution`. Use on a planned rewrite. Move directly without temporary shims.
- `experience-first`. Use on a UX or scope call. Put users first.
- `exhaust-the-design-space`. Use on a novel design. Compare two or three options.
- `build-the-lever`. Use on repetitive work. Build a script that proves it.
- `model-the-domain`. Use on repeated shape checks. Use types or state machines.
- `boundary-discipline`. Use on adapters and I/O. Parse at edges and keep core pure.
- `type-system-discipline`. Use when designing types. Make invalid states unrepresentable.
- `make-operations-idempotent`. Use on retryable steps. Repeated runs reach one state.
- `migrate-callers-then-delete-legacy-apis`. Use on API replacement. Move callers and delete the old API.
- `separate-before-serializing-shared-state`. Use with concurrent writers. Separate state before locking.
- `prove-it-works`. Use before calling done. Verify the real artifact directly.
- `fix-root-causes`. Use when debugging. Reproduce first and fix the root cause.
- `sequence-verifiable-units`. Use on multi-step work. Split into small green commits.
- `test-behavior-not-implementation`. Use when writing tests. Call public interfaces and assert exact results.
- `explain-the-number`. Use before reporting metrics. State bounds and rule out confounders.
- `guard-the-context-window`. Use on large sweeps. Delegate reads and return short notes.
- `never-block-on-the-human`. Use on reversible work. Proceed and stop only at owner gates.
- `encode-lessons-in-structure`. Use on a repeating mistake. Enforce via lint, type or test.

## Autonomy

Complete reversible work in scope without extra permission asks. Use only tools the harness permits. A delegation grant never removes harness restrictions or substitutes an unavailable named model.

Send external messages only on explicit user instructions or an authorizing invoked skill, and name that skill in your reply. Client messages stay an owner gate. Ticket updates and evaluations need task authority and all owner gates.

Always pause for these irreversible writes, plus every rule-card and grant owner gate: shared-branch force-push, deployment, data deletion and customer message.

"Don't stop", "going to bed", "run until done" and "be fully autonomous" mean continue. They never bypass an owner gate or harness rule.

Give candid judgment on approaches and added scope. Say "this doesn't earn its place" when work fails to earn its place.

## Subagents

Before an Agent call, read `references/subagents.md`.
Before a wait, store write or transcript read, read `references/paths-and-wakeups.md`.
Delegates read `SKILL.md` and `references/worker.md`.

## Replies

Write every reply clean in ASD-STE100 Simplified Technical English, also short replies. Give the result first. Do not repeat agreed items.

- Write short declarative sentences with one thought each, ending in a period. Never use a long dash or mid-sentence colon connector (unslop rule 14).
- Keep each section that the playbook reply names. Describe consumer and maintainer impact before implementation details.
- Never fabricate links or citations. Label each claim (`measured`, `inferred` or `guess`) in the same sentence. Never hand the human a check you can run.
- Use PR links `https://github.com/<owner>/<repo>/pull/<number>`. `astack-comment-judge` holds the comment rules.

Keep a checkpoint reply to 6 lines or fewer.
Give the commit or PR link, gate counts, next step and each waiting item, in that order.
Past 3 waiting items, give their count and say that "status" lists them.

## Route the request

The router with no argument follows "With no argument, do the next step".
Otherwise read `references/routes.md` with the user's request and the last owner message. Open the first matching playbook or skill and copy its steps into the task list. Keep skipped steps with `skip: <reason>`.

Reference playbooks: `references/refresh.md` ("update from main"), `references/resume.md` ("resume"), `references/create-pr.md` ("create pr").

## Playbooks

Copy the matched playbook's steps into the task list before starting. Keep skipped steps with `skip: <reason>`.
Use `figure-it-out` for large cross-cutting work or when no playbook fits. Start planning-shaped work with `/astack-plan`, and run its playbook only after an execution grant. Headless, `--afk`, subagent or workflow runs use the unattended path, record defaults and wait for answers unless an execution grant exists.

Playbooks under `playbooks/`: `authoring-a-skill.md`, `autonomous-run.md`, `autopilot-full.md`, `autopilot-stack.md`, `babysit.md`, `bug-fix.md`, `eval.md`, `feature.md`, `fork-sync.md`, `hillclimb.md`, `investigation.md`, `orchestrate.md`, `pause-safely.md`, `perf-issue.md`, `prototype.md`, `refactoring.md`, `review-bot-triage.md`, `runtime-forensics.md`, `session-pickup.md`, `shipping.md`, `trace-forensics.md`, `visual-parity.md`, `worktree-cleanup.md`.

## With no argument, do the next step

Read the state. Run each command as its own Bash call, in parallel. Never chain them with `&&`.

```sh
astack check-plan --brief
git status --short --branch
git log --oneline -5
astack check pr-head
```

Run `astack check pr-head` before you act on a PR, with `--pr <n>` for a named PR. Go on only after exit 0 with an `ok:` last line or exit 3 with a `no_pr:` last line.
After `stop: HEAD does not hold PR_HEAD`, pull the PR branch. Then run `astack check pr-head` again. When `UNPUSHED` lists a commit, push it first.
When the branch has a PR, read `gh pr view --json number,state,isDraft,reviewDecision,mergeStateStatus`.
A failure of `gh pr view` is an error, not a missing PR. Print it, and stop.

Then take the first row that matches, and do that step. Do not only name it.

| State | Next step |
|---|---|
| The open PR has review threads that are not resolved, or red CI | `playbooks/babysit.md` (`triage` mode) |
| The branch is behind its base and the owner asked for a sync before | `references/refresh.md` |
| The branch has a finished build and no PR | `references/create-pr.md` |
| The open PR is green, has no open threads, and the profile wants a hardening run that did not run on this head | `astack-pr-review-hardening` |
| The open PR is green and clean | Read what the merge starts, as the Shipping playbook says. Report it as ready to merge, and name each publish or deploy job, or say that there is none. Merge only with a grant, through that playbook |
| A plan has a `now` step with no branch that meets its Exit | Build that step with the route that the plan names. Read `references/resume.md` |
| A draft plan has open questions | `/astack-plan <slug>`. It asks the queued round |
| Nothing above | Ask the owner what to build. Recommend one option from the tracker frontier |

## The delegation grant

"go", "do your recommendation", "use your recommendation" or "use best practices and our previous decisions" gives a delegation grant. Adding "ultracode" also requests workflows where they help.

- Record the grant: set `delegate: on` in the active plan frontmatter and commit it next. With no plan, keep it for the session. "ask me", "stop deciding" or plan end sets `delegate: off`.
- Decide under the grant: settle facts and empirical forks through `playbooks/prototype.md` or evidence, never a human question. Decide clear owner calls as `delegated` with reason. Otherwise apply the recommended default as `default`, queue it, explain alternatives, and print no shorthand reply token. Continue to the next step without asking "should I continue?".
- Owner gates always stop work. They cover accounts, secrets, paid infrastructure, ungranted production writes and destructive resets. They also cover shared-branch force-push, `--admin` merge, ungranted merge, money, legal sign-off and client messages.
- Checkpoints: `checkpoints: report` is default (PR comment, 6 lines or fewer in chat, continue). `approve` stops only on `approve ui` or `approve one-way`. Two bare "go" turns offer `checkpoints: report`.
