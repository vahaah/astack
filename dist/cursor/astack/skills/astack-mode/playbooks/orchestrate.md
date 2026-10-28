### Orchestrate

You own the programme, never the code.
Write briefs, drain the queue, keep the frontier green, and make decisions.
Use this playbook for a whole project under one standing coordinator chat.
The project spans days, stacked PRs, and dozens to hundreds of subagents.
The human can check in twice a day instead of every five minutes.
Use Autonomous run for one task driven to a predicate.
Use `figure-it-out` for one ambitious run that needs a custom workflow.
Use Orchestrate when the work outlives any single agent.
Work that one agent can finish within the session budget is not a programme.

Scale the process to the programme.
For cheap units that are almost identical, reduce the process as each section directs.

Keep three rules:

- Treat completions as queue events, not interrupts.
- Carry the standing orders verbatim in every spawn and resume.
- Treat the brief as your product. A vague brief fails quietly because a worker cannot ask you a question.

#### Roles and placement

##### Coordinator

This chat runs locally.
It frames the work, writes briefs, drains the inbox, owns the human report, and makes judgment calls.
It never writes or edits code.
Make conflicted merges, chain rebases, and code changes separate tasks.
On repos where local git is cheap, the coordinator can mechanically land a verified unit itself.
It can fast-forward or cleanly cherry-pick a worker's commit, then push.
Do not leave finished work behind an idle stacker until the deadline passes.

The whole loop uses agents.
Spawn them only through the Agent tool.
Resume them only through `SendMessage`.
Drain their completion notifications.
Choose each subagent's model and effort through the Subagents rules.
Read and write state through `astack orch` at drain points.
Each call takes one command and returns one line.
The CLI never spawns, waits, or wakes anything.

##### Sub-coordinator

Use one background agent at depth 1 per track only when one coordinator cannot drain the whole programme.
A track that the coordinator can drain needs no extra layer.
Each nested layer repeats a full orientation preamble.
A blocking sub-coordinator hides its children while the parent waits.

The sub-coordinator owns its track's units and boards.
It writes briefs and spawns workers and verifiers at depth 2.
Nesting stops at depth 3, which has no Agent tool.
A nested spawn has the full Agent schema, including `isolation`.
Aggregate results at wave boundaries.
Never forward raw child reports.
Limit active children to what one drain can process, roughly ten.
Use a rolling window, not blocking batches that wait for each batch's slowest child.

##### Workers and verifiers

Run workers and verifiers in the background with `isolation: "worktree"`.
Use `isolation: "remote"` only where the account allows it.
Never use remote isolation for a task that needs this machine.
Those tasks include runtime verification through `/astack-control-ui` or `/astack-control-cli`, local transcripts, simulators, local IDE state, and local-only auth.
Remote agents cannot read the local store.
Put their required context in the brief or point to repo files.
Prefer fewer workers with broader scopes.
Keep one writer per worktree or branch.
Follow Separate Before Serializing Shared State (`astack skill-path astack:principles references/separate-before-serializing-shared-state.md`).
Run a unit's verifier on a different model family from its worker.
Use a cross-family reviewer through the Subagents rules.

Keep the tree at coordinator depth 0, track depth 1, and worker depth 2.
This leaves depth 3 for a worker's helpers.
Choose the track decomposition for each project.
Build, landing, and verification are common divisions, not a required shape.
Earlier fixed swarm trees proved too rigid.

#### Store layout

Create `orchestrate/<project-slug>/` in the pstack store from `references/paths-and-wakeups.md`.
Export its absolute path as `ORCH_STORE`.
Give every file exactly one writer.
Owners publish facts, and readers aggregate them when they read.
Use `astack orch` for bookkeeping.
The text below abbreviates that command as `orch`.
Its canonical plain TSV and JSON remain readable without the CLI.

- `preferences.md` records the standing orders as numbered lines, with one constraint per line. Include model policy, stack shape and count, verification bar, forbidden paths, and escalation policy. Paste it verbatim into every spawn and resume. Instructions fade across resumes, and each lost instruction costs a human turn. Append an instruction before acting when you catch yourself repeating it. Follow Encode Lessons in Structure (`astack skill-path astack:principles references/encode-lessons-in-structure.md`).
- `overview.md` is the durable PR and issue database. Append to it. Never rewrite the whole file for each event.
- `units.tsv` keeps one row per unit. Its fields are id, track, state, branch, PR, head SHA, and brief path. Update rows in place.
- `frontier.json` holds the computed merge frontier from Stack safety.
- `ledger.tsv` holds the verification ledger from Verification.
- `inbox/` holds completion pointers. `gates.md` records human gates with their questions, options, and default when no answer arrives.
- `decisions.tsv` is the trail from `show-me-your-work`.
- `status.md` derives from `units.tsv` and `ledger.tsv` at every drain. Never maintain it by hand. Regenerate it from those tables instead of writing event narratives into it.

#### The brief

Prompts to agents are your only product.
A poor brief spreads poor work through the tree.
Every spawn carries the full brief.
A field that you cannot fill means that you have not scoped the unit yet.

```
GOAL         one sentence, the outcome, executable by a stranger with no chat access
SCOPE        paths this unit may write; paths it may not; its exclusive worktree or branch
CONTEXT      pointers to files and PRs; upstream reports pasted in full when this unit
             depends on them, because workers cannot see siblings
ACCEPTANCE   checkable criteria, one per line
VERIFY       exact commands or the control-skill path, plus known gotchas
TIMEBOX      rough cap on runtime; on expiry, return partial findings and stop rather than run on
FORBIDDEN    no PR retargets or merges, no rebase, no force-push, no fixes outside scope,
             plus unit-specific bans
REPORT       status, branch, head SHA, PRs, verdict, what you actually ran, deviations,
             suggested follow-ups
STANDING     <preferences.md pasted verbatim>
```

Size the brief to the unit.
For a unit with one command, reduce the template to one paragraph.
Keep the goal, scope, verification command, and report shape.
A 4KB template for a two-line edit costs more to write and follow than the edit.
A local spawn can point to the standing-orders file by store path.
Paste the orders verbatim for remote spawns and every resume.

A sub-coordinator brief also names its track boundary and unit list.
Give its spawn budget, depth, isolation default, and units that must remain on this machine.
Include the drain protocol and rollup format.
For each child, return one line with name, status, PR, head SHA, and verdict.
Also give the track status and frontier delta.

A dependency carries context as well as order.
Missing upstream context makes a worker guess.
Do not spawn when a field is missing.
Audit one sample worker brief per sub-coordinator per wave.
Run the audit with the wave that it samples, not as a gate before it.
A failing brief stops that track.
Fix the sub-coordinator's instructions, not only the worker's brief.
Brief quality can decline late in a run.
Never chain resumes for a brief.
Spawn a fresh agent with consolidated scope.

#### Steps

1. Frame the programme. State a countable done predicate, such as "all 126 units merged, each ledger-verified `unit-test-verified` or better". Quantify the units, rough effort, expected stacks, and wall-clock budget. If one agent can finish within that budget, stop here and use Autonomous run. That smaller route must not depend on another document being present. Work directly in this session, with plain workers where useful. Verify inline and land work as it becomes ready. Use none of the store, register, or pilot machinery below. Schedule landing against the budget. At roughly 70% of the budget, stop spawning. Land the verified work. Name the tracks for this project. Use `arena` before the pilot for a contested decomposition or one-way door. Present the framing once. Continue reversible preparation without waiting.
2. Install the runtime. Run `orch init`. Open the trail through `show-me-your-work`. Write the standing orders before any spawn. Seed `frontier.json` from existing PRs with `orch frontier set --repo <repo-dir>`.
3. Run a pilot. Take one unit through brief, worker, verification, stack entry, ledger row, and merge. Use the pilot to try to disprove the brief template, verification recipe, and unit size.
   It exposes mistakes while they cost one agent instead of fifty. Fix the contract from pilot evidence before any fan-out. Scale the pilot to the unit. For almost identical cheap units, the first normal unit is the pilot. Give it the verification command inline. Start fan-out when it lands. Use a separate verifier agent and audit gate for expensive or novel unit shapes. Do not serialize that extra pipeline for copies of the same unit when it has nothing to disprove.
4. Scale the work. Spawn a rolling window of workers up to the active cap. Refill it as children finish. Blocking batches wait for their slowest child. Add track sub-coordinators only past the one-drain threshold in Roles. Recompute ready work after every drain. Put upstream reports into downstream briefs. Keep sibling communication upward only. Run the sampled brief audit beside its wave. On failure, stop the next refill, not the current wave.
5. Drain the queue through the discipline below at every drain point.
6. Land continuously instead of waiting for a final phase. Start integration with the first verified unit. Continue it alongside the remaining waves. On heavy repos, keep a standing stacker from wave one to integrate units as they verify. On repos where local git is cheap, the coordinator can land verified units through the Roles rules. Keep the frontier green before work higher in the stack. Follow Stack safety. Advance `frontier.json` only on a merge or a reported new head SHA.
7. Close the programme. Drain the final inbox. Give every spawned agent a terminal row of `done`, `abandoned`, or `zombie-reconciled`. Confirm the predicate on the real artifact. Confirm a verdict for the current head SHA of every landed PR. Audit the `show-me-your-work` trail, including its cross-model review. Encode recurring corrections in `preferences.md` or the brief template. Keep the store intact for the postmortem.

#### Queue and drain

- On a completion notification, run `orch inbox push <agent> <unit> <status> [--report PATH]`. Return to the current work. Never perform a deep review inline. Make a completion that needs review a verifier unit. Never review a diff inside a drain.
- Drain batches at four points. These are a critical section's end, a track rollup, a frontier watcher wake, and before a human report. Arm the watcher through the loop skill with a long heartbeat fallback. Start each batch with `orch inbox drain`. Leave arrivals during a drain for the next batch.
- Finish critical sections first. These include writing a brief, a stack operation, a conflict decision, a gate, or an update to ledger or frontier.
- Classify every pointer as `landed`, `needs-verify`, `failed`, `zombie`, or `noise`. Write rows through `orch unit add`, `orch unit set`, and `orch ledger record`. Run `orch status`. Then spawn the next wave in one message.
- Account for every child at its track's rollup. It must have arrived, have a replacement, or have its scope explicitly absorbed. Repeating a missing child's work without recording that hides wasted cost and a coverage gap.
- End a drain turn with the three lines from `orch status`. Give counts by state, what changed, and open gates. Keep details in `status.md`. Use the full reply contract at checkpoints and close.

#### Stack safety

- Keep the frontier as a computed object, not a narrative. Recompute `frontier.json` after every merge and stack mutation. It holds the ordered PR list, branch names, head SHAs, generation number, and lowest unmerged PR. The command follows the PR base chain through the checkout's current branch. It gets chain order and PR states from the forge through `gh`. It gets head SHAs from local branch refs. Resolve them from the stacker's clone. A branch with no PR causes an error instead of a guess.
- Give exactly one stacker per stack authority to change topology. Serialize chain rebases, force-pushes, base retargets, and merges within that stack. Record the holder in the standing orders. Run a chain rebase as its own unit in a dedicated worktree. Remote isolation is an option where the account allows it. Never run that rebase in the coordinator's checkout.
- Workers never rebase, retarget, or merge PRs. Use one babysitter per stack through `playbooks/babysit.md`. Limit it to one immutable frontier generation. It reports conflicts to the stacker instead of rebasing.
- Route PR closes and retargets through the stacker only. Closing a base PR orphans the chains above it. Give merges and stack surgery briefs as separate units.
- Keep one retro watcher for merged PRs. It watches for reverts, CI failures after merge, and orphaned follow-ups.

#### Verification

Scale verification to the unit.
When `VERIFY` is one cheap command, the worker runs it and reports the output.
The coordinator examines a sample of receipts.
Use a dedicated verifier from a different model family for expensive verification or work with high risk or judgment.
A dedicated verifier whose only output repeats one command adds process, not verification.

Write verdict rows with `orch ledger record`.
Check the current PR and head SHA with `orch ledger check`.
Keep one `ledger.tsv` row per verdict, keyed by PR number and head SHA.
Its verdict values are `live-ui-verified | unit-test-verified | type-check-only | verifier-blocked | verifier-failed`.
Green CI is input to a verdict, not a verdict itself.
Behavioral work needs better than `type-check-only`.
`verifier-blocked` is not a pass.
Spawn a replacement when the environment recovers.
Give `verifier-failed` a fix unit, not another verification run.
A worker can self-report.
A verifier overrides that report on the same key.
A new head SHA voids the row.
Verify again after a restack.
Use the ledger to answer "was this verified", not memory or the transcript.

Publish a unit's output as soon as it lands.
Do not mark it done before that publication.
Do not batch publication until the end of the run.
A worker pushes its branch, a verifier writes its ledger row, and receipts go into the store.
Work left only on a VM that dies was never done.

#### Liveness and failure

- Never resume an agent to probe its state. A resume restarts an idle agent. Use read-only evidence from the ledger, `units.tsv`, `gh`, pushed branches, `ListAgents`, its transcript, and `.meta.json`. Transcript mtime does not prove liveness.
- Record a silent death as a synthetic postmortem row in the inbox. Name the unit, failure mode, last evidence, and options. Replan as evidence arrives. Do not wait for every agent to become idle.
- Retry according to the failure mode. For `cap-hit` or `oom`, spawn a replacement with less scope. For `Network-drop`, retry as-is. For `Tool-error`, retry on a different model. For `Unknown`, retry once. After two retries, abandon the unit. Replan around it.
- Reconcile a zombie that returns hours late with the current frontier and ledger before you accept anything. Save unique findings through a fresh unit. Never merge its work blindly.
- Stop spawning when bad upstream output, broken acceptance, or dead infrastructure would spread bad work through the tree. Write a stop line at the top of the standing orders. Let active work finish. Fix the cause. Then clear the stop line.
- Limit your own infrastructure retries as you limit a child's. Stop after a few consecutive tool aborts. Write a terminal handoff to durable state. State what is done, where it lives, and the exact command to resume. End the run.
- After a Claude Code restart, local agents are dead. Remote work and kept worktrees survive. Read the standing orders and `units.tsv` again. Recompute the frontier. Reattach surviving work by PR and branch instead of agent id. Spawn one sub-coordinator per track from its stored brief and current state. Drain the queue. Resume the work. The dead session's store lock clears on the next write. `orch` replaces a lock when its holder pid is gone.

#### Escalation

Batch human gates into the status page instead of asking per item.
Escalate irreversible actions such as force-pushes to shared branches, deploys, deletions, or closing another person's PR.
Escalate a product or preference call that no experiment can settle.
Escalate a standing order that contradicts observed reality.
Escalate a programme dead end that remains after a replan.
Record each gate in `gates.md` before you ask.
Route work around it.

Do not escalate frontier nudges, rebase mechanics, retries, CI flake triage, review-thread triage, or format fixes.
Refuse scope that the brief already forbids.
Continue the remaining work.
Do not ask "should I keep going".
When in doubt, act and log.

For a discovery during the run, fix only what blocks the frontier.
Put everything else in follow-ups.
At this scale, a small scope leak creates many unrequested PRs.

#### Reply

At checkpoints and close, give the predicate and its count from `units.tsv` and `ledger.tsv`.
Name the tracks and what each landed.
Give the frontier PR list with SHAs and a verdict summary.
State what you abandoned and why.
Ask only about gates that await the human.
Give the store path and trail path.
Take numbers from the tables instead of narrative.
Include PR links.
