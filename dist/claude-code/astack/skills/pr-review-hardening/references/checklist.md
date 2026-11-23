# Review checklist

Each item is a class of finding that earlier hardening runs found and fixed. The question is what to ask of the diff. The guard is the test or check in the astack repo that now enforces the class. `docs/review-lessons.md` in astack maps each class to its rule and guards. It also holds the questions of the classes that only a change of astack can show.

## Use it

- Ask the question of each item whose area the diff changes. The areas are the headings below.
- The items are about the gates of the hardening profile and the CI of the repo. A PR that changes a script that a gate runs gets the items under "Gates of a profile" too.
- A concrete failure that the diff shows is a candidate with source `checklist`. Reproduce it before it counts, as for a violation of a file in `reviewers.checklists`.
- Before you fix a finding, read the item of its class. The guard of the item is in the astack repo. When the guard missed the finding, its fix goes to the astack repo, as "Files that astack writes" in `references/fix.md` says.
- A finding that fits no item is a candidate for a new class and a new guard. Its ledger entry gets the class `none`, and the final report lists it.

## Gates of a profile

### prerequisite-semantics

Does each prerequisite fail when any one tool of its gate is missing? Does a prerequisite check the output of an earlier gate where the gate must name that gate in `after`? Does a gate reach a tool that only one platform ships, such as lockf, with no check that fails when the tool is missing? Does its command test for the tool with no else branch that runs a portable form, or reach the tool outside that if?

Guard: "a prerequisite check without one of its tools", "a gate that runs an external tool" and "a prerequisite never checks a build output" in `tests/profile-shell.test.ts`. Apply runs `platformToolGaps` of `scripts/lib/platform-tools.ts`. It follows the scripts of each gate, and the files that they run, to each such tool. It passes a check that fails when the tool is missing. It removes each if of the gate command whose condition fails when the tool is missing and whose else branch runs a portable form. Then it checks the rest of the command. "the platform tool check over each profile that apply writes" in `tests/apply/platform-tools.test.ts` runs the check on the gates of each profile, the profile of each branch overlay included.

### foreign-process-trust

Does each gate start each server that it tests from this tree, in its command? Does a check fail when a process holds a port that the gate polls? Does the gate stop only the process groups that it started?

Guard: "a gate that starts a server" and "a check never trusts a server that already runs" in `tests/profile-shell.test.ts`.

### secret-output

Can the run or an entry of a profile print a value of the session or of a `.env` file? Can it print the keys of a stack?

Guard: "an entry of a profile prints no secret" in `tests/profile-shell.test.ts`, and "values that the run prints" in `tests/hardening-consistency.test.ts`.

### shared-resource-side-effects

Can a gate reset or delete a stack, a database or a `node_modules` folder that another worktree or session uses?

Guard: "a gate that resets a stack or a database" and "a gate never deletes in the checkout of the run" in `tests/profile-shell.test.ts`.

### gate-shell-and-cwd

Does each gate entry give the same result in bash from the root, whatever shell or folder the agent uses?

Guard: "each entry of a profile is valid bash" in `tests/profile-shell.test.ts`, for each entry and each command key of a profile, and "the shell and the directory of each gate entry" in `tests/hardening-consistency.test.ts`.

### long-lived-stack-state

Does each gate on a long-lived stack prove that the stack holds the migrations, the config and the data that CI starts with?

Guard: `astack check migrations` in `src/astack/migrations.ts`, `astack check stack-config` in `src/astack/stack-config.ts`, and "the migrations of each gate on a long-lived stack", "the config of a long-lived local stack" and "a gate on a stack that an earlier gate seeded" in `tests/profile-shell.test.ts`.

### ignored-file-prerequisites

Does each gate that needs a file that git ignores, such as a `.env` file, have a prerequisite that checks the file?

Guard: the env-file check of apply, `envFileGaps` in `scripts/lib/env-files.ts`. It follows the scripts of the repo to the apps that the web servers of a Playwright suite start.

### workspace-state

Does each gate run on the committed tree, with a new frozen install and no task cache, as CI does?

Guard: the task-cache check of apply, `taskCacheGaps` in `scripts/lib/task-cache.ts`, and "a gate never copies a file that the commit does not hold" in `tests/profile-shell.test.ts`.

### tracked-file-writes

Can a gate change a tracked file, or fix the tree, so that it hides a red or stops the run?

Guard: "gate entries that fix the tree" in `tests/pr-review-profile.test.ts`, the script check of apply, `scriptFixerGaps` in `scripts/lib/task-cache.ts`, and the rewrite check of apply, `rewriteGaps` in `scripts/lib/next-env.ts`.

## CI parity

### ci-job-coverage

Does each blocking CI job and step have a gate that runs its commands, on all of its paths, in its order? Does the run stop on a PR that changes a tool version that CI sets up or reads from a version file? Does a PR that changes only CI run in mode `ci_proof`, with a red gate advisory only on its proof? Does a PR that changes CI and another file run in mode `ci_mixed`, with each gate blocking? Does its merge need green required checks of its head? Does another change to a version file get the gates of the run?

Guard: the parity check of apply, `checkCiParity` in `scripts/lib/ci-parity.ts`, with `stepVerdicts` and `orderVerdicts`. `astack check ci-pins`, `checkCiPins` in `src/astack/ci-pins.ts`, guards the stop of preflight step 8, and `compareSetups` guards its exit 3.

### gate-env-and-tools

Does each gate get each variable and each tool version that its CI job gets? Does each gate record each pinned tool that its prerequisites and setup run? Does a profile that merges after a clean stop check CI on the head?

Guard: the parity check of apply, `envFileWrites`, `exportVerdicts`, `serviceVerdicts` and `staleTools` in `scripts/lib/ci-parity.ts`, "a gate that runs a pinned tool" in `tests/profile-shell.test.ts`, and `mergesWithoutCi` in `src/astack/pr-review-profile.ts`.
