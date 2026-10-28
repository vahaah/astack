# Routes

Take the first row that matches the owner's words. A user rule in the rules folder can add rows, and its rows come before the rows here. The owner may use other words for the same thing, such as "bucket" for a step or `W<n>` for a wave. Accept them, and never correct them.

For the 23 execution playbooks in `playbooks/`, read `references/playbooks.md`.

## Route table

| Owner words | Route | How it runs |
|---|---|---|
| "I am building X", a ticket key, new work | `/astack-plan` | The standard tier is the default. S0 asks for the goal and the one decision that the work drives. `astack-grilling` rounds follow until the frontier is empty. The plan goes to `docs/plans/<slug>.md` |
| `/plan` | Plan mode | Keep the plan concise and put the unresolved questions last. With "I am building", run `astack-plan` in plan mode. Its stages S0 to S3, S5 and S6 only read. After the owner approves, the first action writes `docs/plans/<slug>.md` in one commit |
| `/grilling`, "grill me" | `astack-grilling` | Ask the whole frontier in each round. Give one recommendation and lettered options for each question |
| "go", "do your recommendation", "use best practices and our previous decisions" | `references/delegation.md` | Record the grant, decide, and continue |
| "agree", "next", "approve", "accept all" | Continue | Take every recommendation of the last round, write the rows, and continue |
| "resume" | `references/resume.md` | Read the plan, the tracker and git. Then continue from the next step |
| `/goal`, "continue the board", a queue of many tickets | Programme tier | `/astack-plan` with `--tier programme`, then the `astack-mode` Orchestrate playbook. Use `astack board` for the frontier. Run 5 sessions at most. Merge the open PRs before you start new sessions |
| A hotfix, "I need it fast" | Quick tier | One grill round at most. Keep the steps together in one run. Push and open the PR at once |
| A bug, an error report, a tester report | The `astack-mode` Bug fix playbook and `astack-diagnosing-bugs` | Reproduce first. Write `Root cause: X because Y` before the fix. Read a tester report critically before you accept its scope |
| "comments", "check github comments", "fix CI" | `references/comments-triage.md` | Decide who is right for each comment, fix or answer it, resolve the thread, and fix CI |
| `/pr-review-hardening` | `astack-pr-review-hardening` | The profile sets the cap and the minimum. The default cap is 2. A blocking finding names a concrete failure |
| "create pr", "open a pr" | `references/create-pr.md` | Gates, deslop, no-comments, the PR body, push, then one hardening run when the profile sets `after_create_pr: harden` |
| "update from main", "sync with main" | `references/refresh.md` | Merge `origin/main`, run the gates again, and keep the intent of the ticket |
| "merge", "merge when green", "merge all" | The `astack-mode` Shipping playbook | The merge needs a grant in `.astack/profile.json` or the owner's merge words in this turn. `merge.authority: standing` covers each PR. `merge.standingBases` covers only a PR of the `origin` repo into a base branch that it names. Run `gh pr merge` as its own Bash call. The astack merge guard refuses a merge with open threads, CI that is not green on the head, or a closing word before a key |
| "don't merge" | Stop at ready to merge | Report the PR as ready and stop |
| UI polish | `astack-control-ui` | Walk the journey as a real persona, never as a superuser. Use the repo UI kit. Measure a layout before you change it |
| Mobile, a device, a simulator | `astack-control-ui` and the device skills that are installed | Run the device QA matrix. Done means 2 full passes in a row |
| "pause", "stop" | The `astack-mode` Pause safely playbook | A hard stop. Do no other git or PR work. Give the hand-off prompt from `references/resume.md` |
| "prompt for next session" | The hand-off prompt | Use the format in `references/resume.md` |
| "clean worktrees" | The `astack-mode` Worktree cleanup playbook | Record `git worktree list` first |
| "look at <other codebase>" | Read-only research | Read it, and never copy it. Never name the source in a repo that forbids it |
| A broken skill or rule | Fix it in astack | Never edit the copy in a project repo |
| "what next", no argument | The next frontier step | Use the state table in `SKILL.md` |

## Other routes

- A small ask that the agent can misread: `astack-sharpen`.
- Issues and requests that someone else wrote: `/astack-triage`. The tickets of a plan skip it.
- How our code works: `astack-how`. Why it has this shape: `astack-why`. Facts outside the repo: `astack-research`.
- A question that talk cannot settle: `astack-prototype` when a person judges the result. The `astack-mode` Prototype playbook when the agent can see the result.
- A question that only another person can answer: `astack-to-questionnaire`.
- Steps that only a person can do, such as dashboards and secrets: `astack-wizard`.
- A behavior that you build test-first with no plan: `astack-tdd`.
- A ticket or a document outside a plan: `astack-write-ticket` or `astack-write-docs`.
- Codebase upkeep: `astack-improve-codebase-architecture`. Then take the selected candidate into `/astack-plan`.
- Work that moves to another agent tool, folder or person: `astack session handoff`.
- Setup: `astack-setup` for the tracker and the labels, `astack-setup-models` for the astack model roles.

Before you say what a skill does, or recommend that the owner skip it, read its SKILL.md. Use `astack skill-path <plugin>:<skill>`. Only an exit 1 from that command means that the skill is not installed.

## Fallbacks

Tell the owner once which astack skill or capability is missing.
Then use the corresponding fallback.
A missing credential, owner grant, or required proof does not authorize a capability fallback.

| Missing astack capability | Route | Fallback |
|---|---|---|
| Bug fix playbook | Bug fix | Reproduce the failure. Write the root cause line. Run the failing check before the fix. Then commit the test or script together with the fix, so every commit is green |
| Babysit playbook | Babysit | Use `references/comments-triage.md` alone |
| Shipping playbook | Shipping | Make sure that each thread is resolved and CI is green on the head. Then merge in its own Bash call |
| Pause safely playbook | Pause safely | Commit work in progress on the branch. If this work has no PR or push, do not create either to pause. Give the hand-off prompt |
| Orchestrate playbook | Orchestrate | Run the sessions of the board one at a time |
| Grilling or diagnosis skill | `astack-grilling`, `astack-diagnosing-bugs` | The fallbacks in `astack-plan` `references/fallbacks.md` |
