# Deterministic gate

The profile's gates mirror the blocking jobs of the repo's CI. A gate that applies but cannot start is an unclean stop. The run never skips it. A gate that a CI job needs must run here with the same command, the same setup and the same services. A run that cannot give it those stops and says why.

## CI environment

Each gate runs in the CI environment of its jobs. Before its prerequisites, its `setup` commands and its command, the run exports `CI=true`, then each `ci_env` entry that has a `value`. An entry with a `why` and no `value` leaves its variable as the session has it, and that holds for `CI` too. The run never sets `GITHUB_ACTIONS` or another `GITHUB_` or `RUNNER_` variable, because no gate runs on GitHub Actions.

GitHub Actions sets `CI=true` for every step of every job. A tool that reads `CI` then behaves in the gate as it does in CI. Playwright's `forbidOnly`, its retries and its web servers are examples. Export the environment in a subshell for each gate, so one gate never gives its values to the next gate.

## Tool versions

CI pins bun with `oven-sh/setup-bun` and the Supabase CLI with `supabase/setup-cli`. Each gate runs bun and the Supabase CLI at the versions in its `tools`, and so does each script that it starts. A turbo task and a package script that calls `bun` are examples. The run gets each version through bunx and puts it first on `PATH`. So the commands of the gate stay the commands of CI.

Before the preflight runs a prerequisite `check`, get each version in the `tools` of each gate that applies:

1. Make one new folder for the run with `mktemp -d`, outside the tree.
2. For a `bun` version, make the folder `bun-<version>` in it. Link `bun` and `bunx` there to the path that `bunx bun@<version> -e 'console.log(process.execPath)'` prints.
3. For a `supabase` version, make the folder `supabase-<version>` in it. Write an executable `supabase` script there with the lines `#!/bin/sh` and `exec bunx supabase@<version> "$@"`.
4. Run the tool of the folder with `--version`. When its standard output is the version, print `TOOL <tool>@<version>=<folder>`.
5. Otherwise delete the folder. Print `TOOL <tool>@<version>=LOCAL`, the local version and the error.

bunx fails offline and on a registry error. macOS stops a binary that has a bad signature, so the tool prints no version. When bunx cannot get a pinned version, the gate runs the local version. The final report names each difference as a note, and the run goes on. It is not an unclean stop. CI runs the pinned versions, and CI gates the merge. So a local run with a version note is advisory for that tool.

In the subshell of each gate, put the folder of each tool in its `tools` first on `PATH`. Do this before its prerequisites, its `setup` commands and its command. Print `<NAME>_TOOLS=<tool>@<version>` for each tool. Add the local version for a tool that has no folder.

## When a gate applies

A gate with an empty `when_changed` applies to every diff. Otherwise it applies when a path in `git diff --name-only --no-renames <BASE_SHA>...HEAD` matches one of its globs and no glob that starts with `!`. A fix can make a gate apply in a later iteration, so decide again before each gate run.

A glob matches the whole repo-relative path. `*` matches inside one folder, and `**` matches across folders. So `*.md` matches only the Markdown files at the root, and `**/*.md` matches them in every folder. Git's glob pathspec matches the same way. `git diff --name-only --no-renames <BASE_SHA>...HEAD -- ':(glob)<glob>' ':(glob,exclude)<glob without its !>'` prints the paths that make the gate apply. CI splits a rename into a delete and an add, so `--no-renames` lists both paths.

## A gate that needs an earlier gate

A gate that names gates in `after` runs only when each of them exited 0 earlier in the same gate run. Otherwise print `<NAME>_EXIT=BLOCKED` and the gate that did not pass. A `BLOCKED` gate is red. It is never a pass, and never a finding of its own.

Use `after` for an output that an earlier gate writes, such as a build that an end-to-end gate serves. A prerequisite cannot check that output, because the preflight runs before every gate. When the build of the PR is red, the build gate gives the finding, and the next iteration fixes it.

## When a gate cannot start

A gate that applies cannot start when one of these holds:

- An `env` variable is missing.
- A prerequisite `check` fails, and `on_missing` is `stop`.
- A prerequisite `check` still fails after its `start` command ran.
- A `setup` command exits with a code that is not 0.
- The command's script or binary does not exist on this branch, and the gate is not `optional`.

Then print `<NAME>_EXIT=NOT_STARTED` and the reason. Name the variable, the prerequisite with its check output, or the setup command with its output. The run stops in principled incompletion. A `NOT_STARTED` gate is never a pass and never a finding of the PR.

## Read-only commands

A gate command must not write tracked files, other than the files in its `rewrites`. These flags fix the tree: `--write`, `--fix`, `--unsafe`, `--suppress`, `--update-snapshots`, `--apply`, a snapshot-update `-u`, `biome init`, `biome migrate`, `manypkg fix` and each flag in `forbidden.gate_flags`. Before the first gate runs, reject each gate command, `setup` command and prerequisite `check` or `start` that contains one of them. Such a command can hide a red. A rejected command stops the run in principled incompletion.

Formatting and import sorting are code changes. If a real fix needs formatting, format only that finding's file and commit it with the finding.

A tool that a gate runs can write a tracked file that the tool makes, such as the `next-env.d.ts` of a Next.js app. The gate names that file in `rewrites`, with the reason. The run restores the file from the root after the gate, as "Run it" says. A write to another tracked file makes the gate red.

A gate may have effects outside the tree only when its `side_effects` names them. Its `setup` commands and the `start` commands of its prerequisites follow the same rule.

## Secrets

Print a value only when the profile holds it, such as a `ci_env` value. Never print a value from the session or from a file. Such a value can be a secret, such as a token, a key or a database URL. This rule applies to `RUN_CONFIG`, each `_ENV` and `_CMD` line, the iteration output, the final report and the PR comment.

Print each command as the profile writes it, with no variable expanded. Never run a gate script with `set -x` or `bash -x`. Never print the environment with `env`, `printenv` or `export -p`.

## Run it

Run the subshell of each gate with bash, such as `bash -c '<gate script>'`, also when the session shell is another shell. GitHub Actions runs a `run` step with bash. zsh does not split an unquoted `${pattern:+--grep "$pattern"}` into two words, and it has no `PIPESTATUS`. Start the gate script with `set +e`, so that you capture every exit code. Never judge a gate by the tail of its output. If you pipe a gate's output, capture the gate's own exit code with `${PIPESTATUS[0]}`.

In the subshell of the gate, run each entry in its own subshell from the root, as `( cd <WORKTREE> && <entry> )`. An entry is a prerequisite `check`, a `start`, a `setup` command or the gate command. Then a `cd` in one entry never moves the next entry. Each entry gets the CI environment and the `PATH` of the subshell of the gate.

1. Run `git fetch origin <base>`. CI tests the merge of the branch into the base, so do the base check of the preflight again. When the base moved, the branch takes it as `base.sync` says, or the run stops. Print `BASE_SHA` again. Do the CI check of the preflight again. Its result sets the mode of the run. When the run has a PR, read its `headRefOid` again and do the head check again. A push to the PR can move its head. Run the install of the preflight again. Then print `git status --short` as `GIT_STATUS_BEFORE_GATE`. When `git -C <WORKTREE> status --porcelain --untracked-files=all` prints a line, stop with principled incompletion before the first gate, and name each path. CI tests the commit, so a gate never runs on a file that the commit does not hold.
2. For each entry of `gates`, then `test`:
   - If the gate does not apply to the diff, print `<NAME>_EXIT=SKIPPED` and the globs that matched no path.
   - If the command's script or binary does not exist on this branch and `optional` is true, print `<NAME>_EXIT=UNAVAILABLE`.
   - If a gate in its `after` did not exit 0 in this gate run, print `<NAME>_EXIT=BLOCKED` and that gate.
   - Open the bash subshell for the gate. Put its tools first on `PATH`, as "Tool versions" says, and print `<NAME>_TOOLS`.
   - Export its CI environment, and print `<NAME>_ENV`. `<NAME>_ENV` lists the names that the run exports as `<name>=<value>`, which are `CI` and each `ci_env` entry that has a `value`. It lists each other name of the `ci_env` and `env` of the gate as `<name>=set` or `<name>=unset`.
   - Check its `env` and its prerequisites as the preflight does. Then run each `setup` command in order, and print each one with its exit code. If the gate cannot start, print `<NAME>_EXIT=NOT_STARTED` as the section above says.
   - Otherwise print `<NAME>_CMD=<command>`, with the command as the profile writes it. Run it in its own subshell from the root, and print `<NAME>_EXIT=<code>` and the raw output. For long output, save the full output to a file outside the tree, print its path, and print the failing sections and the summary unmodified.
   - Before the subshell of a gate opens, record `git -C <WORKTREE> diff --name-only`. Right after it exits, whatever its exit code, the run restores the `rewrites` paths that were not in that list. It uses `git -C <WORKTREE> checkout -- <path>`. It prints `<NAME>_RESTORED=<path>` for each restored path that `git -C <WORKTREE> diff --name-only` showed before the restore. A `rewrites` path that changed before the gate stays as it is, so the status check after the gates shows it.
3. If `metrics` is set, run `metrics.command`, or `metrics.fallback` when the command's script is missing on this branch. Print `METRICS_CMD`, `METRICS_EXIT` and the raw JSON. Without `metrics`, print `METRICS=UNAVAILABLE`. Never re-create a metrics script from memory. A re-created script measures something else, and a shared temporary path can be overwritten by another session.
4. If `type_coverage` is set, run it and print `TYPE_COVERAGE_CMD`, `TYPE_COVERAGE_EXIT` and `TYPE_COVERAGE_PERCENT`.
5. Print `git status --short` as `GIT_STATUS_AFTER_GATE`. If a tracked file changed after the restore, print `git diff` for it. The gate is red and the run stops in principled incompletion. Never keep or discard the change silently.

`<NAME>` is the gate's `name` in upper case with `-` replaced by `_`.

## Green

The gate is green when all of these hold:

- every gate that ran exited 0, or is an advisory gate of mode `ci_proof`. `SKIPPED` and `UNAVAILABLE` gates are listed, never counted as passes;
- no gate is `NOT_STARTED` or `BLOCKED`;
- if metrics ran, `METRICS_EXIT` is 0 and each key in `metrics.never_increase` is no higher than in the previous iteration, or the baseline for iteration 1;
- if type coverage ran, it is no lower than the baseline and at least `type_coverage.min_percent`;
- no gate changed a tracked file that its `rewrites` does not name.

A red gate is a finding `G<n>.<k>` when the failure is in a file that the PR changed. It is also a finding when the same command is green on the base branch. Name the files in the failure output. Otherwise it is a pre-existing red. List it, and never fix it. The run cannot stop clean while it stays red.

In mode `ci_proof`, a red gate is advisory when the run shows that the CI change of the PR makes it red. The proof names the changed line of the CI diff that the gate does not mirror. It also holds a run of the gate command as the CI of the PR runs it, and that run exits 0. The run gives the command what the changed line gives, such as an `env` value. When the PR removes a CI step that runs a gate command, the gates no longer mirror CI, so the profile must change. Then stop with principled incompletion, and name the step.

Print the gate as `<NAME>_EXIT=<code> ADVISORY_CI_PROOF`, with the proof. Each other red gate blocks, as in the mode `standard`. CI on `PR_HEAD` still gates the merge.

## Iteration output

Every iteration ends with these blocks, in this order:

```text
ITERATION <n>

RULES_RESTATED
<the loop's rules, then the profile's guardrails>

PREVIOUS_COUNTS
<each metrics key and type coverage, from the previous iteration or the baseline>

REVIEW_RAW
<each reviewer's output, unmodified, under its name>

CHECKLIST_FINDINGS
<violations found by the checklist pass>

FINDING_LEDGER
<entries created or changed this iteration>

FIXES_APPLIED
<finding id, files, commit SHAs in order, pushed or not>

COMMENT_GATE
<which runner ran, deletions per file, MUST KILL flags, constraints left open>

DETERMINISTIC_GATE_RAW
<each gate's `<NAME>_ENV` line, each command, its exit code and output, and git status before and after>

GATE_SUMMARY
<NAME>_EXIT: <one line per gate>
METRICS_EXIT:
<one line per metrics key>: <value> (previous <value>)
typeCoveragePercent:
blockingReviewerFindings:
commentGateFindings:
gateFindings:
gitStatusChangedByGate:
diffFiles:
reviewedHead:
headSha:
prHead:
mode: standard | ci_proof
ciReadBack: pass | fail | not_run
decision: continue | stop_clean | stop_recurring | stop_principled_incompletion
```

`blockingReviewerFindings` is the number of blocking reviewer and checklist findings of the iteration. `commentGateFindings` is the number of its findings `C<n>.<k>`, and `gateFindings` is the number of its findings `G<n>.<k>`. `gitStatusChangedByGate` is true when `GIT_STATUS_AFTER_GATE` shows a tracked file that the restore did not restore. `diffFiles` is the number of paths that `git diff --name-only --no-renames <BASE_SHA>...HEAD` prints after the last gate run. A clean stop needs a value above 0. `reviewedHead` is the `REVIEWED_HEAD` of the review step. `headSha` is the output of `git rev-parse HEAD` after the last gate run. A clean stop needs the two values to be equal. `prHead` is the `PR_HEAD` of the last head check, after the push of the decision step, or `none` in a run without a PR. A clean stop in a run with a PR needs it to equal `headSha`. `mode` is the mode of the last CI check of the run. It is `ci_proof` when that check exits 3 with a last line that starts with `ci_proof:`, and `standard` otherwise. A clean stop in mode `ci_proof` needs it to show `ci_proof`, so the final report names the mode. `ciReadBack` is the result of the CI read-back of the iteration, `pass` or `fail`, or `not_run` when the iteration did no read-back. A clean stop in mode `ci_proof` needs `pass`.

## PR comment

When `proof.pr_comment` is set and the branch has a PR, post a comment after each iteration with `gh pr comment <n> --body-file <file>`. It starts with the heading, `<n>` replaced by the iteration number, and carries:

- the head SHA the iteration ended on;
- the iteration number;
- the blocking finding count;
- each gate command as the profile writes it, with its exit code, `SKIPPED`, `UNAVAILABLE`, `NOT_STARTED` or `BLOCKED`;
- the mode, and each advisory gate of mode `ci_proof` with its proof;
- the decision;
- every item in `proof.pr_comment.extra`.

When the profile asks for this comment, the comment is the proof a merge relies on, not the transcript.

## CI read-back

In mode `ci_proof`, the gates mirror the CI of the base, and the PR changes CI. So the review proves the code, and only CI proves the CI change. In that mode, do the read-back after the push of the decision step of each iteration that is clean otherwise, and again before a merge. A clean stop and a merge each need it to pass. Read `gh pr view <n> --json headRefOid`, then `gh pr checks <n> --required --json name,state,bucket,event,workflow,link`, then `headRefOid` again. The read-back passes when each of these holds:

- both reads of `headRefOid` give `PR_HEAD`;
- the list holds at least one required check;
- each required check has the `bucket` `pass` and the `event` `pull_request`.

A `pull_request` run takes its workflows from the merge of the PR head into the base, so it ran the CI of the PR. A `pull_request_target` run takes the workflows of the base, so it proves nothing for the CI change. When a required check is still `pending`, wait with `gh pr checks <n> --required --watch`. Then read again. When a condition fails, the read-back fails. Then never merge, and stop with principled incompletion. The report names each condition that failed, with the check and its link. A required check that is a commit status has no `event`, so it fails the last condition, and the report names it. A run without a PR has no CI run to read, so its `ciReadBack` is `not_run`, and it stops with principled incompletion.

## Unclean stop

When the run ends in `stop_recurring` or `stop_principled_incompletion` and `proof.on_unclean` is set:

- if `draft` is true, return the PR to draft with `gh pr ready <n> --undo`;
- if `label` is set, add it, creating it first with `gh label create` if it is missing;
- post the unresolved findings with their exact reasons to each place in `post_to`. `issue` means the issue the PR body's first line names.

## Final report

1. How the run stopped: clean, recurrence or principled incompletion, and why. Also the mode of the run. In mode `ci_proof`, also each advisory gate with its proof, and the result of the CI read-back.
2. Findings fixed, by id.
3. Real bugs found.
4. Type-only changes.
5. Runtime behaviour changes.
6. Each metrics key and type coverage, before and after.
7. Comment gate totals: deletions, `MUST KILL` flags fixed and open, constraints left unencoded.
8. Comment-rule conflicts: checklist items and reviewer requests that asked for comments the keep list does not cover.
9. The commit list.
10. Unresolved findings, each with its exact reason.
11. The final deterministic gate output.
12. Tool notes: each tool that a gate ran at its local version, with the pin, the local version and the error. A note is not a finding. CI runs the pinned versions, and CI gates the merge. So a local run with a version note is advisory for that tool.
13. Unpushed commits: the `UNPUSHED` list of the last head check. CI did not test these commits.
14. Confirmation that no gate wrote a tracked file outside its `rewrites`, and each file that the run restored.
15. The ledger path.
16. Lesson candidates: each finding whose `class` is `none`, with its id and claim.

## Drive the loop with /goal

A `/goal` condition is judged from the transcript. Build it from the profile:

```text
/goal Run /astack:pr-review-hardening <base> until a transcript-visible GATE_SUMMARY shows decision stop_clean after at least <iterations.min> iterations, with every gate exit 0, or ADVISORY_CI_PROOF only when that GATE_SUMMARY shows mode ci_proof, zero blocking reviewer, comment-gate and gate findings, gitStatusChangedByGate false, diffFiles above 0, reviewedHead equal to headSha, and prHead equal to headSha or none. If metrics ran, that GATE_SUMMARY also shows METRICS_EXIT 0 and every never_increase key no higher than the previous iteration. If the CI check gave mode ci_proof, that GATE_SUMMARY also shows mode ci_proof and ciReadBack pass. Also stop on stop_recurring or stop_principled_incompletion, with the reason printed.
```
