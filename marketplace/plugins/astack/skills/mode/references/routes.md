# Routes

Take the first row that matches the owner's words. A user rule in the rules folder can add rows, and its rows come before the rows here. The owner may use other words for the same thing, such as "bucket" for a step or `W<n>` for a wave. Accept them, and never correct them.

## Route table

| Owner words | Route | How it runs |
|---|---|---|
| "I am building X", a ticket key, new work | `/astack:plan` | The standard tier is the default. S0 asks for the goal and the one decision that the work drives. `astack:grilling` rounds follow until the frontier is empty. The plan goes to `docs/plans/<slug>.md` |
| `/grilling`, "grill me" | `astack:grilling` | Ask the whole frontier in each round. Give one recommendation and lettered options for each question |
| "agree", "next", "approve", "accept all" | Continue | Take every recommendation of the last round, write the rows, and continue |
| "status", "where are we", "what waits on me" | The Catch up part of `references/resume.md` | List each item that waits on the owner, with one line for each. A status ask only reads and starts no work |
| `/goal`, "continue the board", a queue of many tickets | Programme tier | `/astack:plan` with `--tier programme`, then the `astack:mode` Orchestrate playbook. Use `astack board` for the frontier. Run 5 sessions at most. Merge the open PRs before you start new sessions |
| "comments", "check github comments", "fix CI" | `references/comments-triage.md` | Decide who is right for each comment, fix or answer it, resolve the thread, and fix CI |
| "babysit", "watch the PR", "get it green" | `astack:babysit-pr` | It runs the Babysit playbook. Declare the mode before the first poll. Stop at merge-ready |
| "create pr", "open a pr", "file a pr" | `astack:file-pr` and `references/create-pr.md` | Gates, deslop, no-comments, the PR body, push, then one hardening run when the profile sets `after_create_pr: harden` |
| "update from main", "sync with main" | `references/refresh.md` | Merge `origin/main`, run the gates again, and keep the intent of the ticket |
| "modernize", "rebase this PR" | `astack:modernize` | Read what changed on the base. Choose `MODERNIZE`, `REWORK` or `CLOSE` before any push. Rebase only the PR that the owner names |
| "take over" | `astack:takeover` | Finish the PR, branch or thread of another person. Keep their authorship and credit |
| "sync upstream", "check new upstream commits", "update to the newest upstream version" | The `astack:mode` Fork sync playbook | Give each upstream commit a disposition. Show each skip group and defer group to the owner before you integrate. One plan is one PR |
| "merge", "merge when green", "merge all", "merge and release" | The `astack:mode` Shipping playbook | The merge needs a grant in `.astack/profile.json` on the PR base branch or the owner's words in this turn. `merge.authority: standing` covers each PR. `merge.standingBases` covers only a PR into a base branch that it names. Run `gh pr merge` as its own Bash call. The astack merge guard refuses a merge with open threads, CI that is not green on the head, or a closing word before a key |
| "pause", "stop", also beside "full stop", such as "Stop. Full stop." | The `astack:mode` Pause safely playbook | A hard stop. Do no other git or PR work. Give the hand-off prompt from `references/resume.md`. A prompt whose only instruction is "full stop" skips this row |
| `/astack:full-stop`, a prompt whose only instruction is "full stop" | Read `astack:full-stop` by path | Do the full-send work, but never merge. Stop with a readiness verdict. "full stop" is never a merge grant |
| "don't merge" | Stop at ready to merge | Report the PR as ready and stop |
| "merged", "clean after yourself", "clean and settle" | The Settle step of the `astack:mode` Shipping playbook | Remove the worktrees, temporary folders and dev servers that the run made for the merged PR. Keep every branch ref |
| Mobile, a device, a simulator | `astack:control-ui` and the device skills that are installed | Run the device QA matrix. Done means 2 full passes in a row |
| "look at <other codebase>" | Read-only research | Read it, and never copy it. Never name the source in a repo that forbids it |
| A broken skill or rule | Fix it in astack | Never edit the copy in a project repo |
| "what next", no argument | The next frontier step | Use the state table in `SKILL.md` |

## Other routes

- A small ask that the agent can misread: `astack:sharpen`.
- Issues and requests that someone else wrote: `astack:write-ticket`. A bug report takes the Bug fix playbook.
- How our code works: `astack:how`. Why it has this shape: `astack:why`. Facts outside the repo: the S1 research brief of `astack:plan references/stages.md`.
- A question that talk cannot settle: the Prototype playbook, `playbooks/prototype.md`. When a person judges the result, follow its "Person-judged prototype" section.
- A question or a step that only a person can settle: name it to the owner and stop.
- A behavior that you build test-first with no plan: `astack:tdd`.
- A ticket or a document outside a plan: `astack:write-ticket` or `astack:write-docs`.
- Codebase upkeep: the Survey of `astack:codebase-design`. Then take the selected candidate into `/astack:plan`.
- Work that moves to another agent tool, folder or person: `astack session handoff`.
- Setup: `astack:setup` for the tracker and the labels, `astack:setup-models` for the astack model roles.

Before you say what a skill does, or recommend that the owner skip it, read its SKILL.md. Use `astack skill-path <plugin>:<skill>`. Only an exit 1 from that command means that the skill is not installed.

## Fallbacks

Tell the owner once which astack skill or capability is missing.
Then use the corresponding fallback.
A missing credential, owner grant, or required proof does not authorize a capability fallback.

| Missing astack capability | Route | Fallback |
|---|---|---|
| Grilling or diagnosis skill | `astack:grilling`, `astack:diagnosing-bugs` | The fallbacks in `astack:plan` `references/fallbacks.md` |
