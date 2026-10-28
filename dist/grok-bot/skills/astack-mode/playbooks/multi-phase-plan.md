### Multi-phase or multi-PR plan

You own the plan, not the code.
The plan is a checklist that an owner runs one box at a time.
The operator audits its evidence.
Deliver the plan without implementation.

1. Skip the plan when the change has one or two files and an obvious approach. State that decision. Then stop.
2. Settle open questions with prototypes before you write. Run `playbooks/prototype.md` for each question. Keep the branch, SHA, and screenshots for Appendix A. Ask the operator only about a product or preference call that no run can settle. Give options. Follow Never Block on the Human (`astack skill-path astack:principles references/never-block-on-the-human.md`).
3. Assign exploration to subagents with `subagent_type: "astack-delegate"`. Set an explicit model and effort through the Subagents rules. Follow Guard the Context Window (`astack skill-path astack:principles references/guard-the-context-window.md`). Each agent returns file pointers, conventions, test commands, and entry points. Do not paste bulk context into the report.
4. Copy the skeleton below into the plan file. Fill every placeholder. Use the pstack store's `docs/` directory unless the operator names another path. Read `references/paths-and-wakeups.md` for that store. Keep every heading and sub-block in the order shown. Use one section per PR. Each PR is one change with its own evidence. Follow Sequence Verifiable Units (`astack skill-path astack:principles references/sequence-verifiable-units.md`). Name the execution playbook in `How to read this`. Choose `playbooks/autopilot-full.md` or `playbooks/autopilot-stack.md` through the rule at the end of `playbooks/autopilot-stack.md`. Use `playbooks/orchestrate.md` for a standing programme.
   When `/astack-plan` wrote a plan for the work, this checklist tells an owner how to run it. Keep the checklist outside the repo's plan directory. Link the plan in the intro and Appendix D. For each PR section, take `Depends on.` from the plan session's Depends on. Take `Build.` from its steps and `You see.` from Exit. Take the verify blocks from Proof. Keep the decisions in the plan.
5. Follow `/astack-write-docs` in full. Then follow `/astack-write-docs` again. Write the body as a how-to. Put explanation and reference in appendices. Each heading states its task or finding. Use no long dashes or colons as sentence connectors.
6. Compare the plan with the skeleton. Fix every difference. Keep the intro under ten lines. Keep each skeleton sentence in `How to read this`. Name the execution playbook there. Keep the five H3 headings of `Program checklist` in order. Keep the `git show origin/main:` reads, `/loop 1h` tick, and status message rule.
   Each PR section keeps its nine sub-blocks in order. `Depends on.` names a PR id or None. `Files.`, `Build.`, `You see.`, `Verify, unit.`, and `Merge.` each hold a box. Open every verify block with the verification rule below. `Verify, live.` names the swarm workers model. It holds lanes 1 to 10, each with a `Save` screenshot and a `Pass when` predicate. `Verify, perf.` keeps the Metric, Probe, Baseline, and Rule boxes in that order. A `Review gate.` of None holds no box. Every other review gate holds boxes that name the screenshots, video, and operator. Put only appendices after `Close the program`. Include Prototype evidence as one appendix. Outside code, use no long dash, curly quote, or colon as a sentence connector.
7. Return the plan path and the result of the step 6 comparison. Then stop. Start execution only after the operator's explicit go. Use the execution playbook that the plan names.

#### Verification

Use this verification rule:

Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

Open every verification block with that rule.
Follow Prove It Works (`astack skill-path astack:principles references/prove-it-works.md`).
The live block is mandatory.
Run ten lanes at the PR head on the real surface through its control skill.
Follow `swarm` on the `swarm workers` model, with `sonnet` as its default.
Each lane is a background agent with `isolation: "worktree"`.
Give each lane one box with a concrete scenario, saved screenshot, and pass predicate.

Keep one Regression lane against trunk.
It runs the same critical scenario on trunk and head.
When trunk lacks the feature, record that fact.
Gate the behavior that the diff adds and the end state that the user awaits.
Do not invent a trunk result.

The perf gate requires results from both sides.
Trunk and head must produce the named metric.
When trunk lacks the feature, also isolate the work that the diff adds.
Set an absolute budget for that work and the end-to-end state that the user awaits.
Do not claim a ratio between different scenarios.
Name the metric, interleaved probe, trunk baseline measured first, and failure rule with its number.

A PR that changes an interaction needs an operator review gate.
The operator reviews screenshots and a video in chat before merge.
For a PR with no interaction change, write `**Review gate.** None. <PR id> is not review-gated.`
Put no boxes under that gate.

#### Control skill

Choose the skill for the surface.
With astack installed, use `/astack-control-ui` for browser, Electron, web, and native mobile UIs.
It routes to Playwright MCP, claude-in-chrome, or argent.
Use `/astack-control-cli` for CLIs and TUIs.
Without astack, use those drivers directly.
A repo's own driver skill takes priority when one exists.
A PR that touches two surfaces needs lanes on both.
Record a surface with no control skill as a risk in Appendix C.
Its live block still names how every lane drives it.

````markdown
# <Program> plan

<Under ten lines. What changes, for whom, the rule the program enforces, and the PR ids in order.>

## How to read this

One box is one unit of work.
Every box names the evidence that checks it.
A nested box is a sub-step of the box above it.
Check a box only when its evidence exists.
Evidence can be a file, log line, screenshot, test run, or SHA.
The body is a how-to.
The appendices explain and record.

The program runs `playbooks/<execution playbook>.md`.
<Who merges, and which PR ids are the operator's items that stop at merge-ready.>

Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

## Program checklist

### Arm the program

- [ ] State the protocol and this plan to the operator. Then stop. Start execution only on the operator's explicit go.
- [ ] Read these at program start. Read them again at every tick. Resolve `playbooks/` paths from the mode skill directory. Resolve other skill paths from the installed astack `skills/` directory. That is the parent of the mode skill's directory.
  - [ ] `playbooks/<execution playbook>.md`
  - [ ] `swarm/SKILL.md`
  - [ ] `<control skill path>`
  - [ ] `playbooks/opening-a-pr.md`
  - [ ] `<each other leaf skill the program uses>/SKILL.md`
  - [ ] `git show origin/main:<each repo rule file the program follows, such as AGENTS.md>`
- [ ] On the operator's go, arm the audit tick as `/loop 1h` with the prompt below. Never leave the cadence to memory.
- [ ] Use this tick prompt, verbatim. "Re-read the execution playbook. Audit the operation against it and fix drift in this tick. Probe every active lane and judge progress by side effects only. Stand down a stuck lane and dispatch its replacement now. Then post a short status message to the operator in chat only when the audit found a tracked change that no earlier status message reported, such as a PR opened, a code-ready head, a round launched or closed, a verdict, a merge, a stuck agent and the action taken, a blocker added or cleared, or a decision only the operator can make. Name every such change and nothing else. Do not repeat a table, the merged list, or an unchanged blocker. If the audit found none, end the turn with no reply text. Either way, log this tick's row in your decision trail. The row names the items reported, or none."
- [ ] On the operator's hold or stand-down, send every owner a zero-writes order at once.

### Spawn owners

- [ ] Spawn one owner per PR with the full lifecycle that the execution playbook names.
- [ ] Follow this dependency graph. Start dependent work only after its parent merges. Or base it on the parent branch when the execution playbook stacks.
  - [ ] <PR id> and <PR id> are independent and first. Both branch from `main`.
  - [ ] <PR id> after <PR id>.
- [ ] Hold the file boundaries. <PR id or class> touches only `<glob>`.
- [ ] Hold the review gate. <PR ids> change an interaction. They await the operator's review in chat with screenshots and a video before merge.

### PR mechanics, for every PR

- [ ] Use `gh` for every PR operation. Never require `gt`.
- [ ] Open the PR ready, never draft, through Opening a PR. Use `gh pr create --base <base-branch>`. A stack child targets its parent branch.
- [ ] Run the repo's lint and typecheck once before the push for the PR. Push with hooks on.
- [ ] After the build, run `/astack-deslop` on the branch diff. It also runs `/astack-no-comments`. Commit its edits. Without astack, remove slop yourself. Follow the no-astack `/astack-no-comments` fallback before review.
- [ ] Triage every review-bot and security-reviewer comment through `playbooks/review-bot-triage.md`.
- [ ] Rebase onto current trunk before the code-ready report and babysit. Keep that merge base in fix rounds. Rebase again only for merge prep, a `git merge-tree` conflict with trunk, or CI failure from a trunk change.

### Verdict and merge, for every PR

- [ ] Run a full swarm once at the code-ready head. Run another only for new behavior, a redesign, or a large new diff. For a rebase, conflict resolution, or minor fix, use one verifier at the new head. Follow the swarm skill for each full swarm. Include one gates lane. Include the ten live lanes from `Verify, live` and the perf lane from `Verify, perf`. Include at least two audit lanes with separate focus areas. They read the diff and receipts with distrust of the PR body. The root audits receipts in the merge-ready report before its verdict.
- [ ] Mark clean only when every lane is `PASS`. Return findings to the owner, including defects that a lane filed as notes. Give a new head a fresh verdict. Keep results only when the patch-id rule in `playbooks/shipping.md` permits it.
- [ ] <The merge or append rule from the execution playbook, with the patch-id rule from `playbooks/shipping.md`.>

### Boot recipe, for every live lane

Each live lane is a background agent with `isolation: "worktree"` at the PR head.
Give it separate ports.
Drive it through the control skill from the Control skill paragraph.

- [ ] `git fetch origin <head-branch> && git checkout <head SHA>`.
- [ ] <Start the backend and the surface. Wait for ready.>
- [ ] <Deliver input only through the control skill's commands. Name the read-only diagnostics.>
- [ ] Save every screenshot to `/tmp/swarm-<pr-id>/worker-<n>/<slug>.png`. Return its paths with the report.

## <Task as a verb phrase> (<PR id>)

**Depends on.** <PR id, or None.>

**Files.**

- [ ] Edit `<path>`.
- [ ] Create `<path>`.
- [ ] Delete `<path>`.

**Build.**

- [ ] <One change. Name the symbol and the file.>

**You see.**

- [ ] <One observable result, with the exact log line or screen state.>

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] <Test file and the case it gains.> Run `<command>`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `<swarm workers model>` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Run <the same load-bearing scenario> at trunk and head. If trunk lacks the feature, record that and gate <the behavior the diff adds plus the end state the user waits for>. Save `<slug>.png`. Pass when <predicate>.
- [ ] Lane 2. <Scenario.> Save `<slug>.png`. Pass when <predicate>.
- [ ] Lane 3. <Scenario.> Save `<slug>.png`. Pass when <predicate>.
- [ ] Lane 4. <Scenario.> Save `<slug>.png`. Pass when <predicate>.
- [ ] Lane 5. <Scenario.> Save `<slug>.png`. Pass when <predicate>.
- [ ] Lane 6. <Scenario.> Save `<slug>.png`. Pass when <predicate>.
- [ ] Lane 7. <Scenario.> Save `<slug>.png`. Pass when <predicate>.
- [ ] Lane 8. <Scenario.> Save `<slug>.png`. Pass when <predicate>.
- [ ] Lane 9. <Scenario.> Save `<slug>.png`. Pass when <predicate>.
- [ ] Lane 10. <Scenario.> Save `<slug>.png`. Pass when <predicate>.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. <What is measured at both trunk and head. If trunk lacks the feature, also name the diff-added work and the end-to-end state the user waits for.>
- [ ] Probe. <The command or procedure, run at trunk and at the head, interleaved. Both sides must produce the metric.>
- [ ] Baseline. Record the trunk <value> first.
- [ ] Rule. <Head against trunk, with the number that fails. If the scenarios differ, add absolute budgets for the diff-added work and the user-visible end state instead of an invalid ratio.>

**Review gate.** The operator reviews before merge.

- [ ] Copy lane <n> screenshots into `<media path>/<pr-id>-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of the change from a lane. Save it as `<media path>/<pr-id>-review.mp4`.
- [ ] Post the screenshots and video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Record the root's clean verdict at the exact head SHA.
- [ ] Finish review-bot triage.
- [ ] Rebase onto current trunk after the verdict, with patch-id unchanged.
- [ ] <The owner squash-merges its own PR, or the root appends it to the base-branch stack and the operator lands it bottom-up.>

## Close the program

- [ ] Check every box above with its evidence.
- [ ] Give the operator the report that the execution playbook names.

## Appendix A. Prototype evidence

<Each open question a prototype answered, with the branch, the SHA, and the artifact links. Each question that stays unproven.>

## Appendix B. Alternatives rejected

<Each approach weighed and why it lost.>

## Appendix C. Risks

<Each risk with the PR it lands in and what the owner watches.>

## Appendix D. Links and reading list

<Docs to read before editing. Which PRs get the **how** and **interrogate** skills. The trail per the **show-me-your-work** skill.>
````

#### Reply

Give the plan path and PR ids with their dependencies.
Name the set that needs an operator review gate.
State what the prototypes proved and what remains unproven.
Report the result of the step 6 comparison.
