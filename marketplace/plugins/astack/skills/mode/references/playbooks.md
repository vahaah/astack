# Playbooks

Open a task list before you add items for this task.
Make its first items exact copies of the matched playbook's steps.
Keep each skipped step in the list with a one-line `skip: <reason>`.

Match the task to a playbook below.
Open its full steps at `playbooks/<title>.md`, unless the entry gives a file.
Convert the title to kebab case.
Keep hyphens.
Drop other punctuation.
Copy the steps verbatim.

Use `figure-it-out` for a large effort or one that crosses many parts of the codebase.
Examples include a migration across many call sites or an ambitious change with many parts.
Use it for work that the user leaves for you to complete and review later.
This route takes priority even when a narrower playbook, such as Feature, fits.
Use `figure-it-out` whenever no bundled playbook fits.
It designs a rigorous playbook for one specific run.

Use Orchestrate for a standing project with many days, stacked PRs, and a fleet of subagents under one coordinator.
Orchestrate runs the programme, while `figure-it-out` designs one run.

## Planning

Start planning-shaped work with `/astack:plan` when astack is installed.
This includes the Multi-phase plan playbook, `figure-it-out`, and the start of an Orchestrate programme.
It also includes a Feature whose goal, scope, or one-way doors remain open.

When the user is present, `astack:plan` asks only the calls that the user alone can make.
It uses `how`, `architect`, and `interrogate` to settle facts and design forks.
It ends by asking for the execution grant.
Run the playbook that it names only after the user grants execution.

A delegation or autonomy grant does not select unattended mode.
A headless `claude -p` run or an SDK run uses the unattended path.
An explicit `--afk` invocation, subagent, or workflow worker also uses that path.
That path never answers its own questions.
It records each default with its reason.
It queues the next round of questions and leaves the plan a draft.
The grant keeps planning going, but execution waits for the user's answers.

An existing plan with an execution grant from the user is the exception.
Follow that plan's route.
Without astack, run the matched playbook as written.

## Choose a playbook

- Investigation. Answer a read-only question about how X works or why Y was built this way. Other questions ask whether Z is sound or whether to choose X or Y.
- Bug fix. Reproduce a reported defect. Find its root cause. Fix it with runtime evidence.
- Perf issue. Trace measured slowness. Improve it against a baseline.
- Hillclimb. Improve one metric against a target through a sustained scientific loop. Measure before and after each hypothesis. Keep a decision log. Make one commit for each accepted win. Perf issue is a single fix instead.
- Runtime forensics. Diagnose a runtime symptom from live instrumentation, such as a leak, idle-CPU spin, or glitch. Deliver a diagnosis, not a fix.
- Trace forensics. Diagnose a captured profiling artifact supplied after the event. Examples include a cpuprofile, trace, spindump, or heap snapshot. Deliver a diagnosis, not a fix.
- Feature. Build new or changed behavior from a named data shape.
- Refactoring. Preserve behavior while you change structure or shape, such as a rename, extraction, inline, dedupe, or move.
- Prototype. Make a throwaway sketch to settle a design or behavior decision cheaply. Use observation instead of a human question for an empirical fork. Typical requests are "prototype", "mock it up", "try this layout", or "sketch it to decide".
- Visual parity. Match the pixels of two implementations or migrate a styling system with exact UI equivalence.
- Authoring or modifying a skill. Write or edit a SKILL.md. File: `playbooks/authoring-a-skill.md`.
- Eval. Test how a skill, structure, or prompt change affects agent behavior before you promote it.
- Babysit. Bring a PR or stack to merge-ready state, including conflicts, review threads, and CI.
- Shipping. Independently verify a green stack after Babysit. Land only the contiguous verified run from the root, bottom-up through `gh`.
- Autonomous run. Drive one long task to completion without stopping. Typical requests are "run until done" or "/loop until X".
- Orchestrate. Run a standing project through one coordinator chat over many days and stacked PRs. It can use dozens to hundreds of subagents with few human turns. Typical requests are "run this whole project" or "own this migration until it lands". Autonomous run drives one task to a predicate instead. Use Autonomous run when one agent can finish within the session budget, even if the wording resembles a programme.
- Autopilot-full. Run a queue of independent PRs to merge with full autonomy. One owner for each PR carries it from build through merge. The root verifies each PR with `swarm` before its owner merges. Typical requests are "autopilot this queue", "full autopilot", or "one-owner-per-PR programs".
- Autopilot-stack. Build and verify a queue with full autonomy. Deliver one linear reviewed stack on the base branch for the operator to land. Typical requests are "autopilot-stack", "stack them, don't ship", or "build the stack, I'll land it".
- Session pickup. Resume or take over earlier work from a transcript, remote session, or pushed branch.
- Pause safely. Suspend work so it can resume after an explicit pause, offline period, Claude Code restart, or imminent compaction. This complements Session pickup.
- Multi-phase or multi-PR plan. Plan work that spans phases or stacked PRs. File: `playbooks/multi-phase-plan.md`.
- Worktree and simulator cleanup. Prune merged or abandoned worktrees and stale iOS simulators to reclaim disk space. Typical requests include "what's using my disk", "clean up worktrees", "prune safe-to-prune worktrees", "free up space", or "delete old simulators". File: `playbooks/worktree-cleanup.md`.
- Opening a PR. Run it at the end of every other playbook.
