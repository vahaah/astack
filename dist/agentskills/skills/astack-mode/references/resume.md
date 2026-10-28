# Resume

Use this playbook for "resume" and for a new session on old work. The plan, the tracker and git hold the state. A transcript never does.

## Read the state

Run each command as its own Bash call, in parallel.

```sh
astack check-plan --brief
git status --porcelain
git stash list
git worktree list
git log --oneline -10
git rev-parse HEAD
gh pr view --json number,url,state,isDraft,headRefOid,reviewDecision
```

There is no PR only when gh exits 1 and its standard error matches `grep -qi 'no pull requests found for branch'`. Each other failure of `gh pr view` is an error, not a missing PR. Print the error of gh, and stop. The state and the diff of a PR hold for its `headRefOid` only. Compare `git rev-parse HEAD` with `headRefOid` before you act on the PR. When they differ, say so before you build on the branch.

1. Open the plan file that the brief names. Read its frontmatter keys `delegate`, `checkpoints` and `owner-gates`. `delegate: on` keeps the delegation grant of the last session.
2. Read the status of the ticket and its last hand-off comment.
3. Find the next step. It is the first step of the plan with no commit that meets its `Exit.` line.
4. When the working tree has changes, or a stash or a worktree belongs to this work, say what you found. Do not delete it.

## Run the steps

The usual shape is one big PR for each session. Parallel step workers build it in worktrees, in waves. The main thread is the integrator lane.

- With "ultracode", run the steps of the current wave as parallel step workers. Use the Workflow tool, or background agents with `isolation: "worktree"`. Each worker commits on its own step branch.
- Give each worker its step with its `Files.`, `Exit.` and `Proof.` lines. Tell it to load `astack-coding-rules`.
- Let only one worker edit each region of a hot file in a wave.
- Use the model that the profile names for the step workers. The judgment and the integrator run on the main model.
- As the integrator, land the step commits on the session branch in plan order. Run the scoped gates after each commit, and resolve each conflict.
- With no "ultracode", run the steps in order in the main thread, or with subagents as `references/subagents.md` says.
- At each checkpoint, follow `references/delegation.md`.

## The hand-off prompt

Give this prompt for "pause" and "prompt for next session". Fill in every value. When the plan has a session record, `astack session resume <plan>` prints the body of this prompt. Put the first line of the template in front of it.

```text
/astack-mode resume
Resume <plan path> on branch <branch>, PR <url>.
Read the plan, then the last hand-off comment on <ticket>.
The next step is <number and title>. Its Exit is <exit>.
delegate: <on or off>. checkpoints: <report or approve>.
Use ultracode.
```

Leave out "Use ultracode." when the session did not use workflows.
