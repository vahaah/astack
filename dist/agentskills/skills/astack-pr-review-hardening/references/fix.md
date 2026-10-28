# Fix

## Fix for real

Never satisfy a finding by:

- adding a suppression: `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, `eslint-disable`, `biome-ignore`, `biome-ignore-all`, `oxlint-disable`, `type-coverage:ignore`, `# type: ignore`, `# noqa`, `//nolint`, `#[allow(...)]`, or any pattern in `forbidden.code`;
- weakening compiler, linter or test config, or excluding files from them, such as `skipLibCheck` or a new ignore entry;
- editing package scripts so a check is skipped;
- deleting a test or narrowing what a test command runs;
- running a formatter or linter with a write flag as a side effect;
- hiding a type problem behind a cast through `unknown`, a laundered generic, an `Object.assign` coercion or declaration merging;
- changing runtime behaviour and calling it type-only.

A runtime change the fix needs is a bug fix. List it separately in the final report.

When the finding is a false sentence in a doc or a comment, cut it back. Keep only what the code or a test proves. Do not add a new precise claim unless a test in the PR holds it. Examples of precise claims are a number, a tool behaviour and a platform fact. Each new unchecked claim is a new finding for the next reviewer.

When the finding is a missing test for one clause, look at the sibling clauses of the same function too. Do it in the same commit, so the next review does not find them one at a time.

## Lessons of earlier runs

Before you fix a finding, read the item of `references/checklist.md` for its `class`. The item names the guard in the astack repo that enforces the class.

- When the finding is in a file that astack writes, the guard missed it. Fix the source and extend the guard in the astack repo, as "Files that astack writes" says.
- When the class is `none`, the finding is a candidate for a new class and a new guard. Fix it as this reference says. The final report lists it. `docs/review-lessons.md` in the astack repo says how to add a lesson.

## Fix fence

Edit only the files that the finding names. That is the reviewer's file, the failing file in the gate output or the file that the comment gate flagged.

A fix never:

- bumps a dependency or edits a lockfile;
- edits a migration;
- edits CI config;
- touches a path in `forbidden.paths`;
- reformats a file the finding does not name.

If the correct fix needs a file outside the fence, do not work around the fence. Mark the finding `out-of-scope` and print:

- the finding id;
- the file the fix needs;
- why the fix is wrong without it;
- the smallest change you propose.

The run then ends in principled incompletion.

In mode `ci_proof`, the diff holds CI files, and the reviewers review them like each other file. A fix never edits CI, also in that mode, and `forbidden.paths` still holds. So a finding whose fix needs a CI edit is `out-of-scope`. A CI file is each path that `astack check ci-pins` prints with `the PR changes this CI file.`, also a script in the folder of a local action. The run prints the CI change that it proposes, as above, and ends in principled incompletion. The author makes the CI change, and the next run reviews it.

## Files that astack writes

Before you edit a file for a finding, run `astack managed <path>`. It reads the `managed` list in `.astack/profile.json`.

- `repo`: the repo owns the file. Fix it here, as the rest of this reference says.
- `written` or `retired`: astack apply writes or deletes the file. Do not edit it here, because the next apply puts the old text back. Mark the finding `out-of-scope` with the reason `managed by astack`. Fix the source in the astack repo. Then apply it again to every repo that has a profile, with `bun scripts/apply.ts --project <name> --worktree --update`. The reply on the PR names the astack change.
- `merged`: astack writes only its plugin wiring keys into the file. A finding on a wiring key is managed. A finding on another key belongs to the repo.
- `unknown`: the profile has no `managed` list. Ask the user before you edit the file.

When `astack` is not on the PATH, read the `managed` list in `.astack/profile.json` yourself.

## Commands the run never runs

Never run a command in `forbidden.commands` or a gate command with a write flag (`references/gate.md`). Never force-push, and never push to the base branch.

## Commit

A fix can add a test or script that fails for the finding's reason. Run the failing check before the fix. Record its output. Then commit the test or script together with the fix, so every commit is green. The PR's Verification shows the failing run first, then the passing run. Each finding owns its commits. No commit holds two findings.

Before each commit, print:

```bash
git status --porcelain --untracked-files=all
git diff --check
```

Stage only that finding's files. Write each subject from `conventions.commit.subject` with the finding id filled in. The default is `fix(review): <finding-id> <short factual summary>`. Keep the trailers named in `conventions.commit.trailers`. Put the reason, and any cast or behaviour justification, in the commit body.

Never commit baseline output, temporary scripts, logs or reports unless the repo already tracks them. Put each temporary script, log and report outside `WORKTREE`, because a gate run stops on an untracked file.

If `git commit` fails because the git identity is missing, stop with principled incompletion. Never invent an identity.

Record each commit SHA in the finding's ledger entry, in order.

## Push

`push` sets when fix commits leave the machine:

- `when-authorised`: push only if the user authorised pushing in this session.
- `each-commit`: push right after each commit, so a run that stops early leaves nothing local.
- `never`: do not push.

A push sends the branch of the fix commits, which the preflight names. A run with no PR, or with a PR from the same repository, pushes a branch with no upstream with `git push -u origin <branch>`. A branch that the preflight creates has no upstream.

When `isCrossRepository` is true, the run pushes with `git push <head repository URL> HEAD:<headRefName>`, and never pushes a branch to `origin`. `origin` is the base repository, not the head repository of the PR. To make the head repository URL, start from the URL of `origin`. Replace its owner with the `login` of `headRepositoryOwner`, and its repository name with the `name` of `headRepository`. The preflight reads these fields, and stops on a fork that does not allow edits from maintainers.

Never force-push. Never push to the base branch.

## Take base changes

CI tests the merge of the branch into the base. So the preflight and each gate run check that `origin/<base>` is an ancestor of `HEAD`. `base.sync` sets what the run does when it is not:

- `none`: never merge the base. A branch that lacks base commits stops the run in principled incompletion, and the report names the missing commits.
- `merge`: run `git merge origin/<base>`. Never rebase. A rebase rewrites the reviewed commits out of the branch's history, so no earlier iteration covers the new head. A merge that needs a conflict resolution or a hand edit needs a new iteration.
