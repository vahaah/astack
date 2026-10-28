---
name: pr-review-hardening
description: Harden a branch or pull request before merge. Reviewers propose findings. Each finding is reproduced before it counts, and each real one is fixed in its own commit. The run stops clean only when the repo's deterministic gates, its metric budget and the no-comments gate are green. Repo settings come from .claude/pr-review-hardening.profile.md. Use when asked to harden a PR, run the review-fix loop, or when a repo stub points here.
argument-hint: "[base-branch] [--pr <number>]"
---

# PR review hardening

Run a review and fix loop on the current branch until it reaches a clean stop. Or stop early and say why.

Arguments: `$ARGUMENTS`. A bare word is the base branch. `--pr <number>` names the pull request. Without `--pr`, the PR is the one that the head check finds for the current branch, if any.

## Review the PR that --pr names

A run with `--pr <n>` reviews the head of that PR and nothing else. Do these steps before you load the profile, because the profile of the PR head applies.

1. Read `gh pr view <n> --json headRefName,headRefOid,baseRefName,state,isCrossRepository`, and print the three ref values. Stop with principled incompletion when `state` is not `OPEN`. The local branch of the PR is `headRefName`, or `pr-<n>` when `isCrossRepository` is true. A branch of a fork can have the name of a local branch, such as `main`. So the run never takes a checkout by the head branch name of a PR from a fork.
2. When `git branch --show-current` prints the local branch of the PR, stay in this checkout.
3. Otherwise, look for the local branch of the PR in `git worktree list --porcelain`, and continue in the worktree that holds it. When no worktree holds it, run `git worktree add --detach <dir>` with a new directory outside this checkout, such as `<repo root>-pr-<n>`. Then run `gh pr checkout <n> --branch <local branch>` in it. Continue the run in that worktree. Never switch the branch of this checkout.
4. With `--pr`, the base branch is the bare word, else the PR's `baseRefName`, whatever `base.from_pr` says.
5. Never create a review branch in a run with `--pr`. The fix commits go on the local branch of the PR.

A new worktree has no file that git ignores, such as a `.env` file. A gate prerequisite that checks such a file stops the run there, and the report names the file.

## The head check

CI tests the head of the PR. A local branch that does not hold that head gives a stale tree to the reviewers and the gates. So every run with a PR does the head check, with `--pr` or without it, before it loads the profile.

1. Without `--pr`, read `gh pr view --json number,headRefOid` for the current branch. The run has no PR only when gh exits 1 and its standard error matches `grep -qi 'no pull requests found for branch'`. Then it skips this check. gh can start that message with an uppercase or a lowercase letter. Each other failure of a `gh pr view` of the run stops the run with principled incompletion, and the run prints the error of gh.
2. Run `git fetch origin <headRefOid>`. When it fails, stop with principled incompletion.
3. Print `HEAD` as the output of `git rev-parse HEAD`, and `PR_HEAD` as `headRefOid`. When `git merge-base --is-ancestor <headRefOid> HEAD` fails, stop with principled incompletion before the baseline. The local branch does not hold every commit of the PR, so the owner pulls first.
4. Print `git log --oneline <headRefOid>..HEAD` as `UNPUSHED`. CI did not test these commits, so the final report names each one.

Each gate run does the head check again (`references/gate.md`).

## Authority

1. The repository code and its real runtime behaviour are the truth.
2. The deterministic gates in the profile decide pass or fail.
3. The comment gate decides which comments survive. Its findings block.
4. Reviewers produce candidate findings. They decide nothing.
5. Prose is never proof, including yours. Every stop decision rests on output printed in the transcript.

When a reviewer claim and a green gate disagree, reproduce the claim. If it does not reproduce, it is advisory.

## Load the profile

1. Find the repository root with `git rev-parse --show-toplevel` and read `.claude/pr-review-hardening.profile.md` there. Take the first fenced code block tagged `yaml` or `json`. `${CLAUDE_SKILL_DIR}/references/profile.md` defines every key and its default.
2. If the file is missing or the block does not parse, stop with principled incompletion. Offer to draft a profile with the procedure in `references/profile.md`. Never run gate commands you guessed.
3. Print `RUN_CONFIG`. It holds the profile path and its `git hash-object`, and the base branch. It holds each gate with its command, `env` names, `ci_env` entries, prerequisites, `setup` commands, `when_changed` globs, `after` gates, `tools` versions and `rewrites` paths. It also holds the reviewer set, the iteration bounds and the push policy. When `metrics` is not `null`, it holds the metrics command and its budget keys. Last are the repo keep patterns from `.astack/profile.json` and the profile. It holds no value from the session or from a file.

The config is frozen for the run. Never edit the profile, package scripts, linter or compiler config, or CI config to make the run pass.

The profile's gates mirror the blocking jobs of the repo's CI. A gate that applies but cannot start is an unclean stop. The run never skips it. `references/gate.md` says when a gate applies and when it cannot start. Each gate runs with `CI=true`, the `env` values of its CI jobs and the bun and Supabase CLI versions that CI pins, as `references/gate.md` says.

## Rules for the whole run

Print these at the start of every iteration, followed by each line of the profile's `guardrails`:

- Gates decide. Reviewers advise. Prose is not proof.
- Gates are read-only. A gate that changes a tracked file outside its `rewrites` is red.
- No suppressions, no config weakening, no test deletion or narrowing, no type laundering.
- The fix fence holds. Edit only the files a finding names. A file that astack writes is fixed in the astack repo, never here.
- A fix can add a test or script that fails for the finding's reason. Run the failing check before the fix. Record its output. Then commit the test or script together with the fix, so every commit is green. The PR's Verification shows the failing run first, then the passing run. Each finding owns its commits. No commit holds two findings.
- No comment survives outside the keep list and the repo keep patterns.
- Print a value only when the profile holds it, such as a `ci_env` value. Never print a value from the session or from a file. Such a value can be a secret, such as a token, a key or a database URL.
- Stop at the iteration limit, on recurrence, or on principled incompletion. A clean stop needs at least `iterations.min` iterations.

This loop runs now. Do not hand it to `/loop` unless the user asks for scheduled polling.

## Preflight

1. Print `git branch --show-current` and `git status --short`. Print `WORKTREE` as the output of `git rev-parse --show-toplevel`. Start every command of the run with `cd <WORKTREE> &&`, because a tool call can start in another directory.
2. Resolve the base branch. Use the argument if given. Otherwise, with `--pr`, use the PR's `baseRefName`. Otherwise, when `base.from_pr` is true and a PR exists, use its base (`gh pr view <n> --json baseRefName`). Otherwise use `base.default`.
3. The working tree must be clean, because each iteration reviews committed code. If it is not, stop and ask what to do with the changes.
4. Run `git fetch origin <base>`. When it fails, or when `git rev-parse --verify origin/<base>` fails, stop with principled incompletion. The local base branch can be behind, so the run never diffs against it.
5. When `git diff --quiet origin/<base>...HEAD` exits 0, the branch has no change to review. Stop with principled incompletion, and create no branch.
6. If the current branch is the base branch, create a new branch from it named by `conventions.branch.create`. When `conventions.branch.pattern` is set, the name must match it. In a run with `--pr`, the run is on the local branch of the PR and creates no branch. Without `--pr`, the fix commits go on the current branch, or on the branch that this step creates. Never commit to the base branch. Never force-push. In a run with a PR, read `gh pr view <n> --json headRefName,headRepositoryOwner,headRepository,isCrossRepository,maintainerCanModify`. When `isCrossRepository` is true, the PR is from a fork, and each push goes to its head repository, as `references/fix.md` says. When `isCrossRepository` is true and `maintainerCanModify` is false, the run makes no fix commit, and it stops with principled incompletion. The report says that the fork does not allow edits from maintainers, so the run cannot push a fix.
7. CI tests the merge of the branch into the base, so the gates need every commit of the base. When `git merge-base --is-ancestor origin/<base> HEAD` fails, the branch lacks base commits. With `base.sync` set to `merge`, run `git merge origin/<base>`. With `none`, print `git log --oneline HEAD..origin/<base>` and stop with principled incompletion.
8. Print `BASE_SHA` as the output of `git rev-parse origin/<base>`. Every diff of the run is `git diff <BASE_SHA>...HEAD`. Run `astack check ci-pins --base <BASE_SHA>`, and print its output and its exit code. It exits 3 when the diff changes only paths under `.github/workflows/` or `.github/actions/`, or in the folder of a local action that a workflow uses. For exit 3, each tool version that CI sets up stays the same, and the last line starts with `ci_proof:`. The check reads the tools of the setup steps, the runner, the container and service images and the ref of a remote reusable workflow. It does not read a tool that a `run` step or a script installs, so the review examines such a change. When the diff also changes another file, the check exits 1, because a red gate can then come from that file. A version file is a file that a workflow or an action names in a `-version-file` input. The check exits 1 when the diff changes a version file and the version that the setup action reads from it changes. It also exits 1 when it cannot read an exact version from a version file at `BASE_SHA` or at `HEAD`. It also exits 1 when the diff changes CI and a tool version that CI sets up, or when it cannot read such a version. When it exits 0 and its last line starts with `ok:`, the run goes on. When it exits 3 and its last line starts with `ci_proof:`, the run goes on in mode `ci_proof`. Otherwise stop with principled incompletion. With no node and no bun, the launcher prints a note and exits 0, so the exit code alone is not a pass. Another change to a version file, such as a new dependency in `package.json`, gets the gates of the run. The gates mirror the CI that astack apply read, and CI runs the workflows of the PR, so only CI can prove a CI change. In mode `ci_proof`, the run reviews, fixes and gates the PR as usual. It records the mode in the ledger, in each `GATE_SUMMARY` and in each PR comment. A red gate is advisory in that mode only with the proof of `references/gate.md`. The merge also needs the CI read-back of `references/gate.md`.
9. For each gate that applies to the diff, the test gate included, get the versions in the `tools` of the gate through bunx (`references/gate.md`). A version that bunx cannot get is a note, not a stop. CI runs the pinned versions, and CI gates the merge. So a local run with a version note is advisory for that tool.
10. Install the dependencies in `WORKTREE` with a frozen lockfile, as the install step of CI does, such as `bun install --frozen-lockfile`. First delete the `node_modules` folder next to each `package.json` that git tracks, with `cd <WORKTREE> && git ls-files -z ':(glob)**/package.json' | while IFS= read -r -d '' file; do rm -rf -- "$(dirname -- "$file")/node_modules"; done`. A frozen install keeps a package that the lockfile no longer lists, and CI installs into a new checkout. Put the `bun` of step 9 first on `PATH`, because CI installs with its pinned bun. Do this in every run. A dev server or another session can use the `node_modules` folders of a checkout that the run did not create, such as the current checkout. So before the first delete in such a checkout, print `WORKTREE` and ask the owner. Without a yes, stop with principled incompletion. The yes holds for each later install of the run. When the install fails, stop with principled incompletion.
11. For each gate that applies to the diff, the test gate included, print each `env` name as `set` or `missing`, never its value. Put the tools of the gate first on `PATH`. Run the `check` of each prerequisite in `requires` in the CI environment of the gate (`references/gate.md`). Print its exit code. When a check fails and its `on_missing` is `start`, run its `start` command, then run the check again. Run each `check` and each `start` with bash, in its own subshell from the root, as `( cd <WORKTREE> && <entry> )`. Then a `cd` in one entry never moves the next entry. A missing variable or a prerequisite that still fails stops the run before any gate runs. A suite that skips its database tests when a variable is unset reports a false green.
12. Load the ledger once per run, before the prepasses (`references/review.md`). A ledger whose `stopped` is `null` comes from a run that was cut off, so this run resumes it, whatever `ledger.carry_over` says. A resumed run keeps each entry, and its first iteration is the one after the highest `iteration` of the entries. Otherwise, with `ledger.carry_over: true`, earlier runs' findings carry into this one. Each run sets `stopped` to `null` at this load, and to its decision when it stops. Each run also sets `mode` to the mode of step 8 at this load, and to the mode of each later CI check. No iteration renames or empties the ledger, because `stop_recurring` reads the entries of earlier iterations.
13. Run each entry of `prepasses` whose `when` applies to this PR (`references/review.md`).

## Baseline

Run the deterministic gate once on the starting head and print it as iteration 0 (`references/gate.md`). Its metric values are the first budget.

If a gate is red at baseline, say which failures sit in files the PR changed. Reproduce a failure on the base branch before you call it pre-existing. A red the PR did not introduce cannot be fixed inside the fix fence. The run may still fix in-scope findings, but it ends in principled incompletion unless every gate turns green.

## Iterate

For each iteration `n` up to `iterations.max`, from 1 or from the first iteration of a resumed run:

1. Print `ITERATION <n>` and the rules.
2. Review. Print `REVIEWED_HEAD` as the output of `git rev-parse HEAD`. It is the `<HEAD>` of the diff that the reviewers get. Launch the reviewers over `git -C <WORKTREE> diff <BASE_SHA>...<HEAD>`, with the path and both SHAs written out, and paste each one's output unmodified. Then run the checklist pass, with the files in `reviewers.checklists` and the review checklist `${CLAUDE_SKILL_DIR}/references/checklist.md`. `references/review.md` says how.
3. Triage. Give each candidate an id `R<n>.<k>`, or `K<n>.<k>` for a checklist finding, and a ledger entry. Reproduce it, then classify it as blocking, advisory, out-of-scope or recurring.
4. Fix. Fix every open blocking finding in the ledger, including gate findings left open by the previous iteration. Commit each finding as the rules above say, inside the fix fence, and push as the profile says. Before each fix, read the item of `references/checklist.md` for the class of the finding. `references/fix.md` holds the rules, and `references/typescript.md` applies when `typescript.rules` is true.
5. Comment gate. Run it over `git diff <BASE_SHA>...HEAD` (`references/comments.md`). Each accepted deletion set and each in-fence `MUST KILL` fix is a finding `C<n>.<k>` with its own commits.
6. Deterministic gate. Run every gate, and the metrics when `metrics` is not `null` (`references/gate.md`). A failure the PR introduced becomes a finding `G<n>.<k>`, fixed in step 4 of the next iteration.
7. Decide. In a run with a PR, push the branch as `push` says when `HEAD` is not `PR_HEAD`. Then read the `headRefOid` of the PR again and do the head check again. Print `GATE_SUMMARY` with the decision, and post the PR comment if the profile asks for one.

## Decide

The iteration is clean when the gate is green and steps 3, 5 and 6 produced no findings that count. That is zero blocking reviewer or checklist findings, zero comment findings and zero gate findings. An iteration that commits a fix in step 4 is not clean, because no reviewer saw that commit. A clean stop also needs `REVIEWED_HEAD` to equal the output of `git rev-parse HEAD` after the last gate run. No reviewer saw a commit that comes after the review, such as the merge of a moved base in a gate run. A clean stop also needs a diff from the base that is not empty. In a run with a PR, a clean stop also needs `PR_HEAD` to equal `HEAD` after the push of step 7. CI tests only the head of the PR, so a review or a gate run of an unpushed commit proves nothing for the PR. In mode `ci_proof`, a clean stop also needs `mode: ci_proof` in the `GATE_SUMMARY`, so the final report names the mode. In mode `ci_proof`, a clean stop also needs `ciReadBack: pass` in the `GATE_SUMMARY`, whatever `merge.after_clean_stop` says. Only CI on the head of a PR proves a CI change, so a run of mode `ci_proof` without a PR cannot stop clean.

- `stop_clean`: the iteration is clean and `n >= iterations.min`.
- `continue`: the iteration is not clean, or it is clean but `n < iterations.min`. A clean iteration below the minimum continues, because a fresh review of the unchanged tree is the proof.
- `stop_recurring`: a finding recurs after one fix attempt, or the same file returns with a materially similar finding after one fix attempt. Print the ledger and the suspected root cause. Do not try again.
- `stop_principled_incompletion`: any of these holds.
  - A configured reviewer cannot be launched.
  - A gate command cannot be identified, cannot run read-only, or changed a tracked file outside its `rewrites`.
  - A gate that applies cannot start. The report names the gate and the missing item.
  - The diff from the base is empty, or the branch lacks commits of the base and `base.sync` is `none`.
  - The local branch does not hold the head of the PR, or the fetch of that head fails.
  - The install of the dependencies with a frozen lockfile fails.
  - The owner does not allow the delete of `node_modules` in a checkout that the run did not create.
  - `astack check ci-pins` gives no `ok:` last line with exit 0 and no `ci_proof:` last line with exit 3.
  - A gate run finds an untracked or uncommitted file.
  - In mode `ci_proof`, the PR removes a CI step that runs a gate command.
  - In mode `ci_proof`, the run has no PR, or the CI read-back fails.
  - A correct fix needs a file outside the fix fence, or a dependency, lockfile, migration, CI or config change.
  - The git identity is missing.
  - In a run with a PR, `PR_HEAD` is still not `HEAD` after step 7, because the run cannot push. The report names each commit of `UNPUSHED`.
  - The PR is from a fork that does not allow edits from maintainers.
  - The iteration limit is spent without a clean stop.
  - A gate is still red for a reason the PR did not introduce.

## After the stop

1. When this run loaded the ledger, set its `stopped` to the decision. Then print the final report (`references/gate.md`).
2. If the stop is not clean and `proof.on_unclean` is set, do what it says.
3. If `threads.answer` is true, answer the PR's review-bot threads (`references/review.md`).
4. If the stop is clean and `merge.after_clean_stop` is `merge`, compare each line of `merge.conditions` with git and GitHub. In mode `ci_proof`, also do the CI read-back of `references/gate.md`, and merge only when it passes. Print the evidence, then run `merge.command`. Otherwise never merge.

## References

- `references/profile.md`: the profile schema, defaults, and how to draft a profile.
- `references/review.md`: reviewers, including `astack:code-review` and `astack:interrogate` as extras, the checklist pass, which findings block, reproduction, the ledger, bot threads and prepasses.
- `references/checklist.md`: the review checklist. It has one question for each class of finding that earlier runs fixed, and the guard that enforces the class.
- `references/fix.md`: fix rules, the fix fence, files that astack writes, commits, pushing and base syncing.
- `references/typescript.md`: type-safety rules for TypeScript repos.
- `references/comments.md`: the comment gate and its keep list.
- `references/gate.md`: the deterministic gate, the green condition, iteration output, the PR comment, the CI read-back of mode `ci_proof`, the final report and a `/goal` template.
