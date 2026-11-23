# Review checklist

Each item is a class of finding that earlier hardening runs found and fixed. The question is what to ask of the diff. The guard is the test or check in the astack repo that now enforces the class. `docs/review-lessons.md` in astack maps each class to its rule and guards.

## Use it

- Ask the question of each item whose area the diff changes. The areas are the headings below.
- Most items are about the hardening profile, the review stub and the other files that astack apply writes. A PR that changes a script that a gate runs still gets the items under "Gates of a profile".
- A concrete failure that the diff shows is a candidate with source `checklist`. Reproduce it before it counts, as for a violation of a file in `reviewers.checklists`.
- Before you fix a finding, read the item of its class. The guard of the item is in the astack repo. When the guard missed the finding, its fix goes to the astack repo, as "Files that astack writes" in `references/fix.md` says.
- A finding that fits no item is a candidate for a new class and a new guard. Its ledger entry gets the class `none`, and the final report lists it.

## The run

### review-target-identity

Does each step that acts on a PR compare the local head with the head of the PR, and diff against the fetched base? Does it stop on each failure of gh that is not the no-PR answer? Does each push for a PR from a fork go to the head repository, so that the run never pushes a branch to `origin`? Does a fork that does not allow edits from maintainers stop the run with no fix commit? Does each step take the checkout of a PR from a fork by its local branch, never by its head branch name? Does each sentence that names the head branch of the PR belong to a run that reads it?

Guard: "a failed gh is never a run with no PR" and "each diff runs against the fetched base" in `tests/hardening-consistency.test.ts`. They scan each astack text and profile. "the branch of the fix commits" in the same file reads SKILL.md and each reference. It finds the head branch of the PR in a sentence outside a run with `--pr`. Only a sentence in the section of `--pr`, or a sentence that starts with "In a run with `--pr`" or "With `--pr`", is in such a run. The read of the fork fields in the preflight, and a sentence that starts with "When `isCrossRepository` is true", also pass. Its origin scan reads each astack text and each profile. The playbooks of the mode that push a PR are astack texts too. It finds each sentence that names `origin` as the remote of `git push` or as the target of a push or of the fix commits. It exempts the push sentence of a run with no PR or a PR from the same repository. It exempts the negation in the push for a PR from a fork, and nothing else. "a run that names a PR reviews that PR" in the same file finds each sentence that takes a checkout by the name of the head branch.

### clean-stop-criteria

Can the run stop clean on an empty diff, or on a commit that no reviewer saw? Can it stop clean on a local head that the PR does not have? Does the goal condition ask for an output that a run with `metrics: null` never prints?

Guard: "the proof of a clean stop" in `tests/hardening-consistency.test.ts`. It maps each condition of a clean stop to a field of `GATE_SUMMARY` with its definition, and to a clause of the goal condition. It finds each sentence of the goal condition that asks for the metrics output with no "If metrics ran".

### ledger-continuity

Does each ledger entry get a blob that a later iteration and a later run can compare, also for a file that the branch deletes? Does only the preflight load and reset the ledger, so that `stop_recurring` sees the findings of each iteration? Does a run after a run that was cut off resume its ledger, whatever `ledger.carry_over` says?

Guard: "the ledger keeps the evidence of the whole run" in `tests/hardening-consistency.test.ts`. Its positive control shows that the blob command of the ledger fails on a deleted file. Its scan finds each form of the command with a placeholder or a variable, such as `HEAD:<path>` or `HEAD:$file`. Each text that holds a form must give the blob of a deleted file for that form. It also finds a word that renames, empties, resets or loads the ledger in the gate run, the baseline or a step of an iteration. In `references/gate.md` and `references/review.md`, it finds such a sentence outside the rule of the preflight. Each preflight must resume a ledger whose `stopped` is `null` before it renames a ledger. The steps after the stop record the decision.

## Instruction texts

### contradicting-commit-rules

Does an astack text tell the agent to put a failing check in a commit apart from its fix?

Guard: "commits of a finding" in `tests/hardening-consistency.test.ts`. It scans astack instruction text and profiles.

### tracker-tool-schema

Does each text that uses an optional field of `save_issue` check the schema first and name the fallback field?

Guard: "save_issue fields that some Linear servers lack" in `tests/tracker-schema.test.ts`. It scans each shipped text, the stub and the profiles included.

### flow-doc-register

Do the agent docs keep the assignee claim of a map ticket, which the frontier query reads? Does each other claim of the repo get a line of its own? Does a bug label without the word bug say how the hook finds a bug? Does the domain doc send each source file name to the repo file with that role, such as its glossary or context map? Does apply fail on a domain path that is missing or of the wrong kind? Does the domain doc tell a skill to name a missing file, never to proceed silently?

Guard: "a GitHub tracker keeps the assignee claim that the frontier query reads, and puts each other claim on a line of its own", "a bug label without the word bug says that the hook takes such a bug from its headings or its title", "the domain doc of $name sends CONTEXT.md and GLOSSARY.md to its glossary", "reports a context map, a reading path or an ADR dir that is missing or of the wrong kind" and "tells a skill to name a missing file in its output" in `tests/apply/flow-config.test.ts`. The path check of apply is `domainProblems` in `scripts/lib/flow-config.ts`.

### restated-value

Does a doc state a count that a table or another file holds, such as the number of findings of a table? The next row makes such a count false. Does a doc of record restate an astack rule, or cite a line number of a file that apply writes? Each apply update moves that line.

Guard: "the prose states no count of findings, rounds or classes" in `tests/review-lessons.test.ts`. It reads `docs/review-lessons.md` of the astack repo. `managedLineCitations` in `scripts/lib/line-citations.ts` fails apply on a tracked Markdown file that cites a file that apply writes with a line number.

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

Does each blocking CI job and step have a gate that runs its commands, on all of its paths, in its order? Does the run stop on a PR that changes a tool version that CI sets up or reads from a version file? Does a PR that changes only CI run in mode `ci_proof`, with a red gate advisory only on its proof? Does its merge need green required checks of its head? Does another change to a version file get the gates of the run?

Guard: the parity check of apply, `checkCiParity` in `scripts/lib/ci-parity.ts`, with `stepVerdicts` and `orderVerdicts`. `astack check ci-pins`, `checkCiPins` in `src/astack/ci-pins.ts`, guards the stop of preflight step 8, and `compareSetups` guards its exit 3.

### gate-env-and-tools

Does each gate get each variable and each tool version that its CI job gets? Does each gate record each pinned tool that its prerequisites and setup run? Does a profile that merges after a clean stop check CI on the head?

Guard: the parity check of apply, `envFileWrites`, `exportVerdicts`, `serviceVerdicts` and `staleTools` in `scripts/lib/ci-parity.ts`, "a gate that runs a pinned tool" in `tests/profile-shell.test.ts`, and `mergesWithoutCi` in `src/astack/pr-review-profile.ts`.

## Apply and the files that it writes

### comment-keep-forms

Does each decision citation in the repo pass the comment hook with the keep patterns of the repo? Does a rule set a length limit that cuts a legal or license header?

Guard: the citation note of apply, `unkeptCitations` in `scripts/lib/keep-forms.ts`. "a legal or license header has no length limit" in `tests/astack/hook.test.ts` reads each text that sets the limit, and runs the hook on a long license header.

### managed-file-lifecycle

Does apply delete each stale copy of a file that it writes, and name each deletion in its commit subject? Does a commit that adds no file say update and name only the files that it changes? Does the subject name the hardening profile and the review stub apart?

Guard: the stray-copy check of apply, `strayCopies` in `scripts/lib/removals.ts`, and "commitSubject with removals" in `tests/astack/commit-style.test.ts`. "the setup commit and the next steps" in `tests/apply/worktree.test.ts` gives each kind of file its own part of the subject.

### astack-provenance

Does each apply into a product repo come from a committed astack tree, and name that commit? Does the commit text of a repo with `neutralCommit` hold no substring of `lint.denySubstrings`? Does such a repo, when it merges after a clean stop, set the subject and the body of the squash commit?

Guard: `astackSource` in `scripts/lib/project-apply.ts`, and "apply --worktree reads the state of the astack tree that it writes from" and "apply --worktree with a neutral commit text, as a repo that must not name the tool" in `tests/apply/worktree.test.ts`.

### upstream-licence

Does each package or standalone skill carry its notices? Do the notices name each copied file and hold each upstream's copyright and permission notices?

Guard: "the upstreams that the run scan reads" and "text that apply copies from upstream" in `tests/apply/notices.test.ts`.

### profile-scan-reach

Does each scan of the profiles in the astack repo read each profile that apply writes, also the profile of a branch overlay?

Guard: "the profile scans" in `tests/hardening-consistency.test.ts`. It compares the list in `tests/profile-paths.ts`, which each profile scan reads, with the profile of each project and of each branch overlay.

### apply-copy-scope

Does a step of apply copy a worktree that git records inside the product repo, such as the worktree of an agent session? Does the copy of the dry run still hold each file that git ignores and a gate needs, such as `node_modules`?

Guard: "apply --dry-run copies the repo for its checks" in `tests/apply/ci-parity-apply.test.ts`. The dry run reads the nested worktrees with `nestedWorktrees` in `scripts/lib/project-apply.ts`, and copies each other entry of the repo.

## Commands that read GitHub

### terminal-control-text

Does a command print a field from GitHub with its control characters, such as a comment body, a check name or a branch name? Does its JSON output leave a DEL or a C1 character raw?

Guard: "control characters in GitHub text" in `tests/astack/watch-pr/render.test.ts`. It renders a review thread, a failed check, a status-query blocker and a query failure that hold ESC, BEL, CR, LF, DEL and C1 characters.
