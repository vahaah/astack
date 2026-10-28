# Review lessons

This file records the lessons of the first hardening reviews of astack. The review rounds examined the hardening engine, the review stub, the apply checks and the profiles of the owner's product repos. This file gives each product repo a synthetic name, such as `acme`, and each finding a synthetic ref and round. Codex found some findings on the PRs. Workflow passes found the rest, with the origins `verify`, `pre-review`, `hunt` and `other`.

Each finding is in one class. A class has a rule and one or more guards. A guard is a test or a check that fails when a change breaks the rule. Read this file before you add a profile or change the engine.

## Use this file

- Before you change a profile, the engine, the stub or an apply check, read the rule of each class that the change touches.
- The hardening engine holds the question of each class in `marketplace/plugins/astack/skills/pr-review-hardening/references/checklist.md`. The reviewer and the fixer of each run of the engine go through it. The stub fallback runs without the astack plugin, so it has no checklist pass, and the counterpart table records that reason.
- `bun run check` runs each guard of the kind `test` and `hook`. An `apply-check` guard runs in `bun run apply`, also with `--dry-run`, against the product repo. A `cli-check` guard runs in the gates of the product repo.
- `tests/review-lessons.test.ts` examines this file. Each guard file must exist and hold each part of its locator, and a source file must define its check function. Each class must have a guard of the kind `test`, `apply-check`, `cli-check` or `hook`. Each finding must name a class of the table or a reason to decline it, and a status that fits that cell. The checklist and the classes table must name the same classes. The prose states no count of findings, rounds or classes.
- The test also makes sure that each ref has a synthetic form that names the round of its row. The rounds go from 1 with no gap. The file holds no run of 7 or more hex digits, such as the id of a review comment, a run or a commit.

## Guard kinds

| Kind | What it is |
|---|---|
| `test` | A test in `tests/` that reads each file of its kind, so a new profile or a new text gets the check too. |
| `apply-check` | A check of `bun run apply`. It fails the apply, also with `--dry-run`. |
| `cli-check` | An `astack check` command that a gate runs. |
| `hook` | The astack comment hook or type hook, with a test of its verdict. |
| `pinned-rule` | A test that pins one sentence of the engine or the stub. The agent of the run follows the sentence, so a pinned rule alone is not a guard. |
| `positive-control` | A test that runs the real tool on the input of a scan, such as git on a file that the branch deletes. It shows that the failure that the scan looks for is real. No change to a text can break it, so it is not a guard. |

A locator names the text that the guard file holds. ` > ` separates its parts, such as the name of a `describe` block and the name of a test in it. A source file has the name of its check function as its locator, and the file defines that function.

## Add a lesson

When a review finds a new problem, find its class in the classes table. When a class fits, add or extend a guard of that class, so that the guard fails on the finding. Run the guard before the fix. Record its failure. When no class fits, add a class with its rule and a guard of the kind `test`, `apply-check`, `cli-check` or `hook`. Then add the item of the class to the checklist of the engine.

Last, add a row for each finding to the findings table. Give each finding of a new review the next round and a synthetic ref of that round. Give each product repo a synthetic name. Never write the id of a review comment, a run, a commit or a PR. Then run `bun run check`.

## Classes

The Class and Rule cells are empty on the second guard of a class and on each guard after it.

| Class | Rule | Kind | File | Locator |
|---|---|---|---|---|
| `engine-stub-drift` | Each sentence of the run in the engine has a counterpart in the stub fallback, or a recorded reason. The run is SKILL.md from the arguments to the steps after the stop. It also holds the gate rules, the gate run, the PR comment and the unclean stop of gate.md, and the blocking rules of review.md. A sentence that stops the run never has only a reason. A counterpart keeps the scope of its engine sentence. So in SKILL.md, in each reference and in the stub fallback, only a sentence of a run that reads `headRefName` names it or the branch of the PR. Such a sentence is in a run with `--pr`, or it is the read of the fork fields in the preflight or the push of a PR from a fork. | `test` | `tests/hardening-consistency.test.ts` | `each sentence of the run has a counterpart in the stub fallback > each sentence of %s has one counterpart row, and each row names one sentence` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `each sentence of the run has a counterpart in the stub fallback > the stub fallback holds the counterpart of each sentence of %s` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `each sentence of the run has a counterpart in the stub fallback > each sentence of %s that the stub leaves out follows a key that apply reports when a profile sets it` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `each sentence of the run has a counterpart in the stub fallback > no sentence of %s that stops the run is left out with only a recorded reason` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `each sentence of the run has a counterpart in the stub fallback > the table reads each section of SKILL.md from the arguments to the steps after the stop` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `each sentence of the run has a counterpart in the stub fallback > the sentence split finds a stop that a new sentence adds to a line of the decision` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `the proof, the commits and the stop of the stub fallback > each field of the PR comment of the engine has one row` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `the proof, the commits and the stop of the stub fallback > the PR comment of the stub fallback holds the field of %p` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `the proof, the commits and the stop of the stub fallback > each step of the unclean stop of the engine has one row` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `the proof, the commits and the stop of the stub fallback > the unclean stop of the stub fallback does the step of %p` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `the branch of the fix commits > %s names headRefName only in a sentence of a run that reads it: a run with --pr, the read of gh, or the push of a PR from a fork` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `the branch of the fix commits > the scope check finds a sentence that sends the fix commits of every run to headRefName` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `the branch of the fix commits > the scope check reads each reference of the engine, such as references/fix.md, which says where a push goes` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `the proof, the commits and the stop of the stub fallback > the stub fallback takes the value of each trailer key from the session` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `severity labels > the stub fallback uses the same labels as the engine` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `the branch of the fix commits > %s puts the fix commits of a run without --pr on the current branch` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `the branch of the fix commits > %s pushes the branch of the fix commits, and pushes a branch with no upstream with git push -u origin <branch>` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `arguments of the stub fallback > the fallback parses the arguments with the engine's sentences` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `gate run of the stub fallback > prints %s as the engine does` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `the base, the diff and the gates of the stub fallback match the engine > %s states what * and ** match, as the profile reference does` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `the base, the diff and the gates of the stub fallback match the engine > a red gate that the PR made is a finding, and a pre-existing red is never fixed, in the engine and in the stub fallback` |
| `fallback-key-contract` | Each leaf key of the profile schema is in `FALLBACK_KEYS`, `FALLBACK_UNREAD` or `FALLBACK_EXEMPT`. Each child key of a block that the fallback reads whole is in the recorded list of the block. The stub states how it follows each key that it reads. No step of the run names an exempt key, other than a key of the table. A value that the stub does not follow, such as a prepass other than `contract-coverage`, has an entry in `FALLBACK_UNREAD`. A profile can set a block such as `metrics` to `null`. A sentence of the stub or the engine that runs or prints a key of such a block holds the condition that the block is not `null`. The key check of the stub finds no missing key under a `null` block, as apply does. | `test` | `tests/hardening-consistency.test.ts` | `keys the stub fallback reads > each leaf key of the profile schema is read by the fallback, reported by apply or exempt with a reason` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `keys the stub fallback reads > each block that the fallback reads whole holds only the child keys that the table records, so a new key inside it needs a decision` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `keys the stub fallback reads > each key that the fallback reads has a row that tells how the stub follows it` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `keys the stub fallback reads > the stub fallback states how to follow %s, and the engine holds the sentence that the stub follows` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `keys the stub fallback reads > a text that a step of the run reads names no exempt key, other than a key that the stub follows in its own words` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `keys the stub fallback reads > %s defines every key the fallback reads` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `keys the stub fallback reads > every dotted key in the fallback is a listed fallback key` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `keys the stub fallback reads > %s runs or prints a key of a block that a profile can set to null only when the block is not null` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `keys the stub fallback reads > the key check of the stub fallback, as apply does, finds no missing key under a null block, so a run with metrics: null goes on` |
|  |  | `test` | `tests/apply/render.test.ts` | `review stub and profile copies > reports a profile that sets %s away from its default, because the stub fallback does not follow it` |
|  |  | `test` | `tests/apply/render.test.ts` | `review stub and profile copies > the table of values away from the default names each key that the stub fallback does not follow` |
|  |  | `test` | `tests/apply/render.test.ts` | `review stub and profile copies > the stub fallback follows test adequacy per clause, a contract-coverage prepass, commit trailers and thread answers` |
|  |  | `apply-check` | `scripts/lib/render.ts` | `renderReviewCopies` |
|  |  | `apply-check` | `src/astack/pr-review-profile.ts` | `missingFallbackKeys` |
|  |  | `apply-check` | `src/astack/pr-review-profile.ts` | `unreadFallbackKeys` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `keys the stub fallback reads > the stub fallback states %s, which it needs to follow ledger.carry_over as the engine does` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `the proof, the commits and the stop of the stub fallback > the stub fallback runs only the contract-coverage prepass, and stops on another` |
| `review-target-identity` | Each astack text and profile that reads a PR with gh compares the local head with the head of the PR. It takes only the no-PR answer of gh as no PR. A run with a PR reads the head repository of the PR. A push for a PR from a fork goes to `HEAD:<headRefName>` in the head repository, never to `origin`. A fork that does not allow edits from maintainers stops the run with no fix commit. A step takes the checkout of a PR by its local branch, which is `pr-<n>` for a PR from a fork, never by the name of its head branch. The create-pr and comments triage playbooks of the mode follow the same fork rule, and create-pr takes a PR from a fork that `gh pr list --head` finds only when the branch holds its head. Each git command runs against the fetched base, never against the local base branch. The branch holds each commit of the fetched base before a gate runs. Each reviewer gets the absolute worktree and the pinned SHAs. The stack walk of watch-pr and the frontier walk of orch take only PRs from the same repository, so a PR from a fork never joins a stack. | `test` | `tests/hardening-consistency.test.ts` | `a failed gh is never a run with no PR > each astack text and profile that reads a PR with gh compares the head of the PR with the local head` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `a failed gh is never a run with no PR > each astack text and profile that looks up a PR with gh stops on a failure of gh that is not the no-PR answer` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `a failed gh is never a run with no PR > the scan finds a lookup through gh pr list that reads an empty list as no PR, and each row of the reason table still names a line` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `each diff runs against the fetched base > %s runs no git command against the local base branch, which can be behind` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `the branch of the fix commits > %s sends no fix commit to origin, except the push of a run with no PR or a PR from the same repository` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `the branch of the fix commits > the origin scan finds each push to origin that a run for a PR from a fork can follow` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `the branch of the fix commits > the origin scan reads each astack text, such as the create-pr playbook of the mode, which pushes a PR` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `the branch of the fix commits > %s reads the fork fields of the PR, and pushes nothing to a fork that does not allow edits from maintainers` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `the branch of the fix commits > the create-pr playbook takes a PR from a fork that gh pr list finds by the name of the branch only when the branch holds the head of that PR` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `a run that names a PR reviews that PR > %s takes no checkout of a PR by the name of its head branch, which a branch of a fork can share with a local branch such as main` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `a run that names a PR reviews that PR > the name scan finds a checkout that a run takes by the name of the head branch of the PR` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `a run that names a PR reviews that PR > %s reads isCrossRepository and checks out a PR from a fork on a local branch of its own` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `a failed gh is never a run with no PR > %s never takes another failure of gh as no PR` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `the head of the PR on every path > the engine and the stub fallback check the head of every PR, with --pr or without it: %s` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `the base, the diff and the gates of the stub fallback match the engine > no run diffs against the local base branch` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `the base, the diff and the gates of the stub fallback match the engine > the engine and the stub fallback say %s` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `the base, the diff and the gates of the stub fallback match the engine > %s gives each reviewer the absolute worktree and the pinned SHAs` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `the branch of the fix commits > %s pushes the fixes of a PR from a fork to the head branch in the head repository, never to origin` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `the branch of the fix commits > the preflight of %s reads the head repository of the PR, and stops with no fix commit on a fork that does not allow edits from maintainers` |
|  |  | `test` | `tests/astack/watch-pr/github.test.ts` | `context and stack discovery > leaves each PR from a fork out of the stack, also one whose head branch name matches a base` |
|  |  | `test` | `tests/astack/orch/store.test.ts` | `Store > leaves a pull request from a fork out of the frontier, also one with the head branch of the stack` |
| `clean-stop-criteria` | A clean stop needs a diff from the base that is not empty and a review of the head that the last gate run tested. In a run with a PR, that head is also the head of the PR after the push of the decision step. `GATE_SUMMARY` prints `diffFiles`, `reviewedHead`, `headSha` and `prHead`, and gate.md defines each field. The goal condition checks them, and the stop_clean bullet holds no other condition. The goal condition asks for the metrics output only when metrics ran, as the green gate does. | `test` | `tests/hardening-consistency.test.ts` | `the proof of a clean stop > each condition of a clean stop has one proof row, and each row names one condition` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `the proof of a clean stop > GATE_SUMMARY prints each field that a condition of a clean stop needs` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `the proof of a clean stop > each field that a condition of a clean stop needs has its pinned definition in gate.md` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `the proof of a clean stop > the /goal condition checks each condition of a clean stop` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `the proof of a clean stop > the /goal condition asks for the metrics output only when metrics ran, as the green gate does, because a run with metrics: null prints no METRICS_EXIT` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `the proof of a clean stop > the stop_clean bullet of the engine and of the stub fallback holds only the conditions that the proof rows name` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `a clean iteration commits no fix > %s stops clean only on the head that the reviewers saw, whatever commit came after them` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `a clean iteration commits no fix > %s prints the head that the reviewers get` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `a clean iteration commits no fix > %s never stops clean on a fix that no reviewer saw` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `the head of the PR on every path > %s pushes an unpushed head of the PR, then reads the head of the PR again before the summary` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `the head of the PR on every path > %s stops clean only on the head of the PR, and stops with principled incompletion on a commit that the run cannot push` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `the base, the diff and the gates of the stub fallback match the engine > the engine and the stub fallback say %s` |
| `ledger-continuity` | Each ledger entry has a blob that a later iteration and a later run can compare. The blob of a file that `HEAD` does not hold, such as a file that the branch deletes, is `deleted`. The preflight loads the ledger once per run, and no iteration resets it, so `stop_recurring` reads each entry of the run. A run that is cut off leaves `stopped` at `null`, so the next run resumes its ledger, whatever `ledger.carry_over` says. So each run sets `stopped` to `null` when it loads the ledger, and the engine, its ledger rule and the stub each say so. | `test` | `tests/hardening-consistency.test.ts` | `the ledger keeps the evidence of the whole run > each astack text that takes the blob with git rev-parse HEAD:<file>, HEAD:<path> or HEAD:$ gives the blob of a file that HEAD does not hold` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `the ledger keeps the evidence of the whole run > the blob scan finds the forms HEAD:<file>, HEAD:<path> and HEAD:$, and asks each one for the blob of a deleted file` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `the ledger keeps the evidence of the whole run > the scan reads the review reference and the stub fallback, which take the blob of each ledger entry` |
|  |  | `positive-control` | `tests/hardening-consistency.test.ts` | `the ledger keeps the evidence of the whole run > the positive control of the blob scan: git rev-parse HEAD:<file> exits 128 on a file that the branch deletes, and 0 on a file that it keeps` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `the ledger keeps the evidence of the whole run > %s keeps the ledger of the run for stop_recurring: the preflight holds the rule, and no gate run, baseline or iteration step resets the ledger` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `the ledger keeps the evidence of the whole run > %s resets or loads the ledger only in the rule of the preflight` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `the ledger keeps the evidence of the whole run > the reset scan finds each form of a ledger reset, and passes the rule of the preflight` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `the ledger keeps the evidence of the whole run > the stub fallback renames an earlier ledger in its preflight, before the first iteration` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `the ledger keeps the evidence of the whole run > review.md says that the preflight loads the ledger once per run` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `the ledger keeps the evidence of the whole run > %s resumes the ledger of a run that was cut off, so the rename of ledger.carry_over: false never archives it` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `the ledger keeps the evidence of the whole run > %s defines the stopped field of the ledger, which tells a ledger of a run that was cut off` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `the ledger keeps the evidence of the whole run > the preflight of SKILL.md marks the loaded ledger as the ledger of a run in progress, so a run that is cut off leaves a ledger to resume` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `the ledger keeps the evidence of the whole run > the steps after the stop in %s record the decision in the ledger, so the next run does not resume a run that stopped` |
| `contradicting-commit-rules` | Each text that orders a failing test before its fix holds the astack override. No astack text or profile commits a failing check apart from its fix. The failing check goes in the commit of the fix. | `test` | `tests/hardening-consistency.test.ts` | `commits of a finding > no item with an origin commits a failing check apart from its fix` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `commits of a finding > no astack text commits a failing check apart from its fix` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `commits of a finding > the red-commit pattern finds the order that the rule replaced` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `commits of a finding > the scan of astack texts reads each project profile, whose guardrails the run prints each iteration` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `commits of a finding > %s states the rule in the same words` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `commits of a finding > the stub states the rule in the same words` |
| `tracker-tool-schema` | Each line that uses an optional field of `save_issue`, with or without backticks, names the schema check and the fallback field. This holds for each shipped text, the stub and the profiles of each scanned companion included. | `test` | `tests/tracker-schema.test.ts` | `save_issue fields that some Linear servers lack > %s checks the schema before each such field` |
|  |  | `test` | `tests/tracker-schema.test.ts` | `save_issue fields that some Linear servers lack > the scan reads the vendored pstack and flow plugins, not only astack` |
|  |  | `test` | `tests/tracker-schema.test.ts` | `save_issue fields that some Linear servers lack > the scan reads the review stub and the profiles that apply ships` |
|  |  | `test` | `tests/tracker-schema.test.ts` | `save_issue fields that some Linear servers lack > a field name with no backticks is found, and a plain patch is not a field` |
|  |  | `test` | `tests/apply/flow-config.test.ts` | `renderIssueTracker > uses addLabels and removeLabels only when the save_issue schema lists them, else the full labels list` |
|  |  | `test` | `tests/apply/flow-config.test.ts` | `renderIssueTracker > adds a map decision with patch only when the save_issue schema lists it, else with the full description` |
| `flow-doc-register` | The agent docs keep the assignee claim of a map ticket, which the frontier query reads. A claim of the repo for other work gets a line of its own, outside the wayfinding operations. A bug label without the word bug gets the sentence that the hook takes such a bug from its headings or its title. A child with a label that the repo skips, such as a decision, leaves the frontier query, and the docs say so. A bug names each other label that the register of the repo needs. The domain doc sends `CONTEXT.md` and `GLOSSARY.md` to the glossary of the repo. It sends `CONTEXT-MAP.md` and `GLOSSARY-MAP.md` to the context map that the config names. Apply fails on a glossary, a context map or a reading path that is not a file, and on an ADR dir that is not a directory. The domain doc tells a skill to name a missing file in its output, never to proceed silently. | `test` | `tests/apply/flow-config.test.ts` | `renderIssueTracker > a GitHub tracker keeps the assignee claim that the frontier query reads, and puts each other claim on a line of its own` |
|  |  | `test` | `tests/apply/flow-config.test.ts` | `renderTriageLabels > a bug label without the word bug says that the hook takes such a bug from its headings or its title` |
|  |  | `test` | `tests/apply/flow-config.test.ts` | `renderIssueTracker > a GitHub tracker drops each child with a skipped label from the frontier, and names that label before the other claims` |
|  |  | `test` | `tests/apply/flow-config.test.ts` | `renderTriageLabels > a bug that carries more labels names them after the category roles` |
|  |  | `test` | `tests/apply/projects.test.ts` | `tracker and domain > accepts the skipped frontier labels of a GitHub tracker and the other labels of a bug, and refuses an empty or a broken label` |
|  |  | `test` | `tests/apply/flow-config.test.ts` | `renderDomain > the domain doc of $name sends CONTEXT.md and GLOSSARY.md to its glossary, and CONTEXT-MAP.md and GLOSSARY-MAP.md to its context map` |
|  |  | `test` | `tests/apply/projects.test.ts` | `tracker and domain > accepts the research claim comment and the other claims of a GitHub tracker, and refuses an empty or a broken line` |
|  |  | `test` | `tests/apply/projects.test.ts` | `tracker and domain > accepts a bug label without the word bug, such as the defect label of a repo register` |
|  |  | `test` | `tests/apply/flow-config.test.ts` | `renderDomain > reports a context map, a reading path or an ADR dir that is missing or of the wrong kind` |
|  |  | `apply-check` | `scripts/lib/flow-config.ts` | `domainProblems` |
|  |  | `test` | `tests/apply/ci-parity-apply.test.ts` | `apply --dry-run checks what each gate reads from the tree > a context map that is no file of the repo fails the dry run until it names a tracked file` |
|  |  | `test` | `tests/apply/flow-config.test.ts` | `renderDomain > tells a skill to name a missing file in its output, never to proceed silently` |
| `restated-value` | A doc states no count that a table or another file holds, such as the number of findings, rounds or classes of this file. The next row makes such a count false, so the doc names the table instead. A doc of record in a product repo restates no astack rule and cites no line of a file that apply writes, because each apply update moves those lines. Apply fails on a tracked Markdown file outside the managed paths that cites a managed path with a line number. | `test` | `tests/review-lessons.test.ts` | `docs/review-lessons.md > the prose states no count of findings, rounds or classes, because the next row makes it false` |
|  |  | `test` | `tests/review-lessons.test.ts` | `the checks of the review lessons find each broken row > a count of rounds or findings in the prose is a gap, and a number in a table row is not` |
|  |  | `apply-check` | `scripts/lib/line-citations.ts` | `managedLineCitations` |
|  |  | `test` | `tests/apply/line-citations.test.ts` | `managedLineCitations > a doc of the repo that cites a line of a file that apply writes is stale on the next update` |
|  |  | `test` | `tests/apply/line-citations.test.ts` | `managedLineCitations > passes %s` |
|  |  | `test` | `tests/apply/ci-parity-apply.test.ts` | `apply --dry-run checks what each gate reads from the tree > a doc that cites a line of a rule that apply writes fails the report-only dry run too` |
|  |  | `test` | `tests/apply/ci-parity-apply.test.ts` | `apply --dry-run checks what each gate reads from the tree > a doc that cites a line of a file that apply writes fails the dry run until it cites the file with no line` |
| `prerequisite-semantics` | A prerequisite fails when any one tool that its check runs is missing. A gate that runs curl, wget, lsof, psql, docker, jq, nc or pg_isready has a check that names that tool. A prerequisite never checks a build output, also through a `cd`. The gate names the build gate in `after`. A gate can reach a tool that only one platform ships, such as lockf. It can reach it through its command, a script of the repo or a file that a script runs. Such a gate has a check that fails when the tool is missing, such as `command -v lockf`. Or each call of the tool is in an if of the command whose condition fails when the tool is missing, and whose else branch runs a portable form without the tool. The rest of the command must not reach the tool. A check or a test that only names the tool, or that passes when the tool is missing, is not enough. So a check is not enough when, after the test, it runs `true`, `echo` or `:` in an or-list, or ends in `; true`. | `test` | `tests/profile-shell.test.ts` | `a prerequisite check without one of its tools > %s has no check that passes when one tool that it runs is missing and every other tool exits 0 or 1` |
|  |  | `test` | `tests/profile-shell.test.ts` | `a gate that runs an external tool > %s has a check that names each external tool that a gate command runs` |
|  |  | `test` | `tests/profile-shell.test.ts` | `a prerequisite never checks a build output > %s checks no file that an earlier gate builds` |
|  |  | `test` | `tests/profile-shell.test.ts` | `a prerequisite never checks a build output > the pattern finds the BUILD_ID check that stopped a new worktree before the build gate ran` |
|  |  | `test` | `tests/apply/platform-tools.test.ts` | `a gate that needs a tool that only one platform ships > finds %s` |
|  |  | `test` | `tests/apply/platform-tools.test.ts` | `a gate that needs a tool that only one platform ships > passes %s` |
|  |  | `test` | `tests/apply/platform-tools.test.ts` | `the platform tool check over each profile that apply writes > %s has no gate whose own text needs a tool of one platform with no test for it` |
|  |  | `test` | `tests/apply/platform-tools.test.ts` | `a gate that needs a tool that only one platform ships > an if that tests for lockf with no else branch` |
|  |  | `test` | `tests/apply/ci-parity-apply.test.ts` | `apply --dry-run checks what each gate reads from the tree > a gate whose script runs lockf fails the dry run until a prerequisite tests for lockf` |
|  |  | `apply-check` | `scripts/lib/platform-tools.ts` | `platformToolGaps` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `the base, the diff and the gates of the stub fallback match the engine > a gate whose earlier gate did not pass is BLOCKED in the engine and in the stub fallback` |
| `foreign-process-trust` | A gate that starts a server has a check that fails when a process holds a port that the gate polls. It starts each server from this tree in its command, never in a setup or start entry. It stops only the process groups that it started. A check never asks a server whether it runs, other than a shared service of the table. | `test` | `tests/profile-shell.test.ts` | `a gate that starts a server > %s starts each server from this tree in its own process group, stops only those groups, and checks with lsof that each port it polls is free` |
|  |  | `test` | `tests/profile-shell.test.ts` | `a gate that starts a server > the port check fails when a process holds a port that it checks, and passes when each port is free` |
|  |  | `test` | `tests/profile-shell.test.ts` | `a gate that starts a server > %s starts no server in a setup or start entry, other than a start form of the table` |
|  |  | `test` | `tests/profile-shell.test.ts` | `a check never trusts a server that already runs > %s asks no server whether it runs, other than a shared service of the table that runs no code of the tree` |
|  |  | `test` | `tests/profile-shell.test.ts` | `a check never trusts a server that already runs > the probe finds a server probe with no URL scheme, an lsof that passes on a listener, pg_isready and wait-on` |
|  |  | `test` | `tests/profile-shell.test.ts` | `a smoke gate that starts two servers in their own process groups > with %s it stops each process that it started and their children, with no lsof on the PATH` |
| `secret-output` | The run prints only values that the profile holds. No sentence of the engine or the stub tells the run to print a value of the session or of a file. No profile entry prints the environment, an env file, the keys of a stack or an xtrace. | `test` | `tests/profile-shell.test.ts` | `an entry of a profile prints no secret > %s has no command, setup or check that prints the keys of a stack, the environment, a .env file or a value of the session` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `values that the run prints > %s has no sentence that prints a value of the session or of a file` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `values that the run prints > the gate that cannot start names the variable, never its value` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `the CI environment of a gate > %s prints a value of the profile, and only set or unset for a value of the session` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `values that the run prints > %s never prints a value of the session or of a file` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `values that the run prints > RUN_CONFIG holds no value of the session or of a file` |
| `shared-resource-side-effects` | A gate that resets a stack or a database has a check that a behaviour test ties to this worktree. Else the profile names the shared target. No profile entry deletes files, other than an entry of the table. The run asks the owner before it deletes in a checkout that it did not create. | `test` | `tests/profile-shell.test.ts` | `a gate that resets a stack or a database > %s ties each reset of a stack or a database to this worktree with a check, or names the shared target in an open decision of the profile` |
|  |  | `test` | `tests/profile-shell.test.ts` | `a gate that resets a stack or a database > each tied reset of the table has the check that its behaviour test runs, and the behaviour test exists` |
|  |  | `test` | `tests/profile-shell.test.ts` | `a gate never deletes in the checkout of the run > %s has no command, setup, check or start that deletes files, other than an entry of the table, because a dev server of the owner can use the checkout of the run` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `the node_modules delete in a checkout that the run did not create > %s asks the owner before the first delete` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `the node_modules delete in a checkout that the run did not create > the decide list of SKILL.md names the delete that the owner refused` |
| `gate-shell-and-cwd` | The run starts each entry with bash in its own subshell from the root. Each profile entry and each command key of a profile, such as `metrics.command`, is valid bash. | `test` | `tests/profile-shell.test.ts` | `each entry of a profile is valid bash > %s parses each command, setup, check and start with %s, because the run starts each entry with bash` |
|  |  | `test` | `tests/profile-shell.test.ts` | `each entry of a profile is valid bash > %s parses metrics.command, metrics.fallback, type_coverage.command, merge.command and merge.fallback with %s, after it fills each placeholder` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `the shell and the directory of each gate entry > %s has no entry whose words depend on how the shell splits an unquoted expansion` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `the shell and the directory of each gate entry > %s runs each check, start, setup command and gate command in its own subshell from the root` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `the shell and the directory of each gate entry > %s runs the subshell of each gate with bash, as GitHub Actions runs a run step` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `the shell and the directory of each gate entry > %s runs each check and start with bash, because zsh does not split the word list of a for loop` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `gate run of the stub fallback > %s restores a rewrite from the root, so a cd in the gate command cannot move its pathspec` |
| `long-lived-stack-state` | Each gate on a stack that lives longer than one run proves that the stack holds the migrations of the checkout. A migration check runs after the last migrate step, or the gate runs a reset of the table. The config check watches the files of the table, and the gate resets data that an earlier gate wrote. | `test` | `tests/profile-shell.test.ts` | `the migrations of each gate on a long-lived stack > %s proves that each long-lived stack holds the migrations of the checkout, with a migration check after the last migrate step or a reset of the table` |
|  |  | `test` | `tests/profile-shell.test.ts` | `the migrations of each gate on a long-lived stack > the pattern finds a migrate step of the CLI and of a package script, and not another script of the database` |
|  |  | `test` | `tests/profile-shell.test.ts` | `the config of a long-lived local stack > the detection finds a stack gate from a start, a status, a pg_isready probe or a stack port of the table` |
|  |  | `test` | `tests/profile-shell.test.ts` | `the config of a long-lived local stack > %s compares the files that each long-lived stack read at its start with the files of the checkout` |
|  |  | `test` | `tests/profile-shell.test.ts` | `the config of a long-lived local stack > %s watches the files of the table for each long-lived stack, so the config check sees each file that the stack reads` |
|  |  | `test` | `tests/profile-shell.test.ts` | `a gate on a stack that an earlier gate seeded > %s starts the setup of each gate on a stack with its reset when an earlier gate seeded that stack, unless CI runs both in one job` |
|  |  | `cli-check` | `src/astack/migrations.ts` | `compareMigrations` |
|  |  | `test` | `tests/astack/migrations.test.ts` | `a stack whose rows are larger than the default spawn buffer is read in full` |
|  |  | `cli-check` | `src/astack/stack-config.ts` | `stackConfigVerdict` |
|  |  | `test` | `tests/hardening-consistency.test.ts` | `the migrations of a long-lived local stack > %s compares the stack before and after each supabase migration up` |
| `ignored-file-prerequisites` | A gate that builds, serves or tests an app that reads an env file that git ignores has a prerequisite that checks that file. The check follows the scripts of the repo to each app that a web server of a Playwright suite starts. | `apply-check` | `scripts/lib/env-files.ts` | `envFileGaps` |
|  |  | `apply-check` | `scripts/lib/task-cache.ts` | `serverPackages` |
|  |  | `test` | `tests/apply/ci-parity-apply.test.ts` | `apply --dry-run checks what each gate reads from the tree > a gate that builds an app with an ignored env file fails the dry run until a prerequisite checks the file` |
|  |  | `test` | `tests/apply/env-files.test.ts` | `envFileGaps > a gate that runs a script or a runtime of an app folder with an ignored env file, and has no check for it, is a gap` |
|  |  | `test` | `tests/apply/env-files.test.ts` | `envFileGaps > the server of a folder needs its own check, not the check of another folder` |
|  |  | `test` | `tests/apply/env-files.test.ts` | `envFileGaps through the scripts of the repo > a gate whose root script starts a Playwright suite needs a check for each app that the web servers of the suite start` |
| `workspace-state` | The run deletes `node_modules` and installs frozen in every run, and stops on an untracked file. No gate copies an untracked file. A gate that runs a cached turbo task, also through a short script form, sets `TURBO_FORCE` to `true`. | `apply-check` | `scripts/lib/task-cache.ts` | `taskCacheGaps` |
|  |  | `test` | `tests/apply/ci-parity-apply.test.ts` | `apply --dry-run checks what each gate reads from the tree > a gate that runs a cached turbo task fails the dry run until it sets TURBO_FORCE` |
|  |  | `test` | `tests/apply/task-cache.test.ts` | `taskCacheGaps > a gate whose script runs a cached turbo task with no --force and no TURBO_FORCE is a gap` |
|  |  | `test` | `tests/apply/task-cache.test.ts` | `taskCacheGaps > a gate that runs a script with the short form of bun, pnpm or yarn is followed too, and a command of the tool itself is not` |
|  |  | `test` | `tests/profile-shell.test.ts` | `a gate never copies a file that the commit does not hold > %s has no gate that copies untracked files` |
|  |  | `test` | `tests/profile-shell.test.ts` | `a gate never copies a file that the commit does not hold > the pattern finds the copy of untracked files that the visual gate made, with a long or a short flag` |
|  |  | `test` | `tests/profile-shell.test.ts` | `the node_modules delete of the preflight > it deletes each node_modules of a tracked package and keeps the node_modules of a tree that git does not track` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `the dependencies of every run > %s installs the dependencies as CI does in every worktree, not only in a new one` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `a frozen install starts with no node_modules > %s deletes node_modules before the frozen install` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `a gate run sees only the commit > %s stops on an untracked or uncommitted file before the first gate` |
| `tracked-file-writes` | No gate entry runs a fixer flag, a script that runs one, or a command that `forbidden.commands` forbids. Each tracked file that a tool of a gate writes is in its `rewrites`. The run restores only what that gate wrote. | `test` | `tests/pr-review-profile.test.ts` | `gate entries that fix the tree > %s has no gate command, setup command or prerequisite that runs a fixer flag` |
|  |  | `test` | `tests/pr-review-profile.test.ts` | `gate entries that fix the tree > %s has no gate entry that runs a command that its forbidden.commands forbids` |
|  |  | `apply-check` | `scripts/lib/task-cache.ts` | `scriptFixerGaps` |
|  |  | `test` | `tests/apply/task-cache.test.ts` | `scriptFixerGaps > a gate that runs a script whose body, or a script or a turbo task that it runs, holds a fixer flag is a gap` |
|  |  | `apply-check` | `scripts/lib/next-env.ts` | `rewriteGaps` |
|  |  | `test` | `tests/apply/next-env.test.ts` | `rewriteGaps > a gate that runs supabase gen types with an output redirect into a tracked file, and has no rewrites entry, is a gap` |
|  |  | `test` | `tests/apply/next-env.test.ts` | `rewriteGaps > a gate that writes a tracked file with tee or with an output flag, and has no rewrites entry, is a gap` |
|  |  | `test` | `tests/apply/ci-parity-apply.test.ts` | `apply --dry-run checks CI parity > a gate that runs supabase gen types into a tracked file fails the dry run until the gate names the file in rewrites` |
|  |  | `test` | `tests/apply/ci-parity-apply.test.ts` | `apply --dry-run checks CI parity > a build gate of an app that tracks next-env.d.ts fails the dry run until the gate names the file in rewrites` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `gate entries that fix the tree > %s names each fixer flag that the profile check refuses` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `gate run of the stub fallback > %s restores only the rewrites that the gate itself made, so an earlier write or an uncommitted change stays red` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `gate run of the stub fallback > the restore comes before the status check, so only a write that no entry allows is red` |
| `ci-job-coverage` | Each blocking CI job maps to gates that run its commands on all of its paths, in its order. A mapped step counts only the commands of its own gates. A mapped step whose commands the gate does not run needs a recorded difference that the report prints. The run stops on a PR that changes a tool version that CI sets up or reads from a version file. A PR that changes only CI runs in mode `ci_proof`, and its clean stop and its merge need the required checks of its head to pass on a `pull_request` run. The scan of CI also stops on each YAML form that it does not read with certainty. Another change to a version file, such as a new dependency in `package.json`, gets the gates of the run. | `apply-check` | `scripts/lib/ci-parity.ts` | `checkCiParity` |
|  |  | `apply-check` | `scripts/lib/ci-parity.ts` | `stepVerdicts` |
|  |  | `apply-check` | `scripts/lib/ci-parity.ts` | `orderVerdicts` |
|  |  | `apply-check` | `scripts/lib/projects.ts` | `validateCiParity` |
|  |  | `test` | `tests/apply/ci-parity.test.ts` | `a gate that the config maps to a CI step runs the commands of the step` |
|  |  | `test` | `tests/apply/ci-parity.test.ts` | `a gate that the config maps to a CI step runs the commands of the step > a step counts only the commands of the gates that it maps to, not a command that another gate runs` |
|  |  | `test` | `tests/apply/ci-parity.test.ts` | `gates that map to the steps of one job run in the order of those steps > two gates of one job in the reverse step order fail, and the step order passes` |
|  |  | `test` | `tests/apply/ci-parity.test.ts` | `gates that map to the steps of one job run in the order of those steps > a test step before another gate is a note, because the run always runs the test gate last` |
|  |  | `test` | `tests/apply/ci-parity.test.ts` | `an exclusion holds only when the workflow proves it > an exclusion of a blocking job, of a job that reads only outputs, or of an aggregate of a blocking job fails apply` |
|  |  | `test` | `tests/apply/ci-parity.test.ts` | `a gate runs on every path that its CI job runs on > a narrower gate of an unfiltered job fails, a narrow entry allows it, and a stale entry fails` |
|  |  | `test` | `tests/apply/ci-parity.test.ts` | `checkCiParity > a gate that starts the stack of a CI step through astack stack start prepares that step, also when it sends the output to /dev/null` |
|  |  | `test` | `tests/apply/ci-parity-apply.test.ts` | `apply --dry-run checks CI parity > a profile with a CI gap fails the dry run` |
|  |  | `test` | `tests/apply/projects.test.ts` | `validateProjectConfig > accepts a CI parity block, and rejects an entry without a reason or a job id, or with an empty differs reason` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `when_changed reads both paths of a rename > %s lists the old path of a rename` |
|  |  | `cli-check` | `src/astack/ci-pins.ts` | `checkCiPins` |
|  |  | `cli-check` | `src/astack/ci-pins.ts` | `compareSetups` |
|  |  | `test` | `tests/astack/ci-pins.test.ts` | `astack check ci-pins > a PR that changes only a dependency in package.json passes, because setup-bun reads the same packageManager` |
|  |  | `test` | `tests/astack/ci-pins.test.ts` | `astack check ci-pins > a PR that changes the packageManager of package.json stops` |
|  |  | `test` | `tests/astack/ci-pins.test.ts` | `astack check ci-pins > a package.json with no packageManager gives the engines.bun that setup-bun reads, and one with neither stops when the PR changes it` |
|  |  | `test` | `tests/astack/ci-pins.test.ts` | `astack check ci-pins > setup-bun with no bun-version reads package.json when no bun-version-file gives a version, as setup-bun does` |
|  |  | `test` | `tests/astack/ci-pins.test.ts` | `astack check ci-pins > a version file that is missing or is not a regular file stops, because CI can read another file` |
|  |  | `test` | `tests/astack/ci-pins.test.ts` | `astack check ci-pins > a version-file input in mixed case, after an anchor or through an alias, is read or stops the run` |
|  |  | `test` | `tests/astack/ci-pins.test.ts` | `astack check ci-pins > a local action outside .github/actions, also one that another local action uses, gives the version file that it names` |
|  |  | `test` | `tests/astack/ci-pins.test.ts` | `astack check ci-pins > a uses value on the next line, a folded uses value or an explicit key names the local action that YAML reads there` |
|  |  | `test` | `tests/astack/ci-pins.test.ts` | `astack check ci-pins > setup-node reads volta.node, devEngines.runtime or engines.node from package.json, and the nodejs line of .tool-versions` |
|  |  | `test` | `tests/astack/ci-pins.test.ts` | `astack check ci-pins > a PR that changes .bun-version stops, and a version file that the PR does not change passes` |
|  |  | `test` | `tests/astack/ci-pins.test.ts` | `astack check ci-pins > a PR that changes a workflow, an action under .github/actions or a local action that a workflow uses, and no tool version, exits 3 in mode ci_proof` |
|  |  | `test` | `tests/astack/ci-pins.test.ts` | `astack check ci-pins > a setup action that declares a version-file input and passes it on reads the file that each caller gives, so a README-only PR passes` |
|  |  | `test` | `tests/astack/ci-pins.test.ts` | `astack check ci-pins > a version-file input that astack cannot resolve to a file stops only when the PR changes a file that the action can read, and a path outside the repo always stops` |
|  |  | `test` | `tests/astack/ci-pins.test.ts` | `astack check ci-pins > a check that cannot run exits 2, so the run never takes it as a pass` |
|  |  | `test` | `tests/astack/ci-pins.test.ts` | `astack check ci-pins > a composite action under .github/actions that names the file counts as a workflow` |
|  |  | `test` | `tests/astack/ci-pins.test.ts` | `astack check ci-pins > an input that the scan cannot read, or a file that astack reads no version from, stops only when it can hide a change` |
|  |  | `test` | `tests/astack/ci-pins.test.ts` | `a PR that changes CI and no tool version runs in mode ci_proof > a PR that changes only a run step of a workflow exits 3, and its last line names the mode ci_proof` |
|  |  | `test` | `tests/astack/ci-pins.test.ts` | `a PR that changes CI and no tool version runs in mode ci_proof > a PR that changes CI and a file outside CI exits 1, because a red gate can then come from that file and not from CI` |
|  |  | `test` | `tests/astack/ci-pins.test.ts` | `a PR that changes CI and no tool version runs in mode ci_proof > a PR that changes a workflow and the bun pin in package.json exits 1, because a tool version that CI reads from a file changes` |
|  |  | `test` | `tests/astack/ci-pins.test.ts` | `a PR that changes CI and no tool version runs in mode ci_proof > a PR that changes the version that a workflow gives setup-cli, or the version file that setup-bun reads, exits 1` |
|  |  | `test` | `tests/astack/ci-pins.test.ts` | `a PR that changes CI and no tool version runs in mode ci_proof > a YAML form that astack does not read stops a PR that changes CI, at the head and at the base` |
|  |  | `test` | `tests/astack/ci-pins.test.ts` | `a PR that changes CI and no tool version runs in mode ci_proof > a tool version that astack cannot read, such as a matrix value, stops a PR that changes CI` |
|  |  | `test` | `tests/astack/ci-pins.test.ts` | `a PR that changes CI and no tool version runs in mode ci_proof > a version input of another action is a tool version, so a go-version change exits 1 and a run step change exits 3` |
|  |  | `test` | `tests/astack/ci-pins.test.ts` | `a PR that changes CI and no tool version runs in mode ci_proof > each job keeps its own tool versions, and a new job sets up only a tool version that CI sets up at the base` |
|  |  | `test` | `tests/astack/ci-pins.test.ts` | `a PR that changes CI and no tool version runs in mode ci_proof > a PR that changes the ref, another input or the if of a setup step exits 1, because each of them can change the tool that CI gets` |
|  |  | `test` | `tests/astack/ci-pins.test.ts` | `a PR that changes CI and no tool version runs in mode ci_proof > a job that calls a local action gets the tool versions of that action in its own place, with the inputs of that call only` |
|  |  | `test` | `tests/astack/ci-pins.test.ts` | `a PR that changes CI and no tool version runs in mode ci_proof > an if in a local action that reads an input counts with the inputs of each call, so a swap of those inputs between jobs exits 1` |
|  |  | `test` | `tests/astack/ci-pins.test.ts` | `a PR that changes CI and no tool version runs in mode ci_proof > a job that loses its last setup step, or a job that a rename gives the tool of another job, exits 1` |
|  |  | `test` | `tests/astack/ci-pins.test.ts` | `a PR that changes CI and no tool version runs in mode ci_proof > a PR that changes the runner, a container or service image, the ref of a remote workflow or adds a setup action with no input exits 1` |
|  |  | `test` | `tests/astack/ci-pins.test.ts` | `a PR that changes CI and no tool version runs in mode ci_proof > a version input with an underscore or a toolchain input of another action is a tool version, so its change exits 1` |
|  |  | `test` | `tests/astack/ci-pins.test.ts` | `a PR that changes CI and no tool version runs in mode ci_proof > a plain version input, a version-file path and an expression in a version input of another action each count` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `a PR that changes CI > %s stops, because the gates mirror the CI that apply read` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `a PR that changes CI > the stub fallback stops on each change to a version file only when no astack command is on the PATH` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `a PR that changes CI > %s goes on in mode ci_proof only on exit 3 with a ci_proof: last line, and records the mode` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `a PR that changes CI > the gate run takes the mode of its own CI check, and the ledger and the PR comment hold it` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `a PR that changes CI > the reviewers of mode ci_proof learn that only they examine the CI files and each tool that a run step installs, in the engine and in the stub` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `a PR that changes CI > %s makes a red gate of mode ci_proof advisory only with its proof` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `a PR that changes CI > %s merges a PR of mode ci_proof only when each required check of PR_HEAD passes on a pull_request run` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `a PR that changes CI > a clean stop of mode ci_proof needs a CI read-back that passes, whatever merge.after_clean_stop says, and the /goal ties ADVISORY_CI_PROOF to that mode` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `a PR that changes CI > only a pull_request run proves the CI change, and the final report names the mode, each advisory gate and the read-back` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `a PR that changes CI > the engine merges in mode ci_proof only after the CI read-back, and the stub does the same` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `a PR that changes CI > a finding whose fix needs a CI edit is out-of-scope in mode ci_proof, because a fix never edits CI` |
|  |  | `test` | `tests/astack/ci-pins-adversarial.test.ts` | `finding 1: a node property before a key > an anchor before the bun-version-file key of setup-bun stops when the PR changes .bun-version` |
|  |  | `test` | `tests/astack/ci-pins-adversarial.test.ts` | `finding 2: escapes in a double-quoted key > an escaped uses key of setup-bun stops when the PR changes the packageManager that setup-bun reads by default` |
|  |  | `test` | `tests/astack/ci-pins-adversarial.test.ts` | `finding 3: a merge key under with > a merge key with an alias under the with of setup-bun stops when the PR changes .bun-version` |
|  |  | `test` | `tests/astack/ci-pins-adversarial.test.ts` | `finding 4: a version field that the setup action reads by truthiness > a volta.node that is a number stops when the PR changes it, because setup-node reads it before engines.node` |
|  |  | `test` | `tests/astack/ci-pins-adversarial.test.ts` | `flow style and documents > a workflow in JSON style stops when the PR changes the packageManager that setup-bun reads by default` |
|  |  | `test` | `tests/astack/ci-pins-adversarial.test.ts` | `values > a bun-version-file value on the next line stops when the PR changes .bun-version` |
|  |  | `test` | `tests/astack/ci-pins-adversarial.test.ts` | `line breaks and encodings > a lone CR line break, which YAML 1.2 reads as a line break, stops when the PR changes .bun-version` |
|  |  | `test` | `tests/astack/ci-pins-adversarial.test.ts` | `a bun-version that can be empty > a bun-version that is an env expression stops when the PR changes the packageManager, because an empty value makes setup-bun read package.json` |
|  |  | `test` | `tests/astack/ci-pins-adversarial.test.ts` | `an input of a workflow > a workflow input that a pull_request run leaves empty stops when the PR changes the packageManager, because setup-bun then reads package.json` |
|  |  | `test` | `tests/astack/ci-pins-adversarial.test.ts` | `a local action that the repo does not hold > a local action that a step checks out from another repo stops, because it can read package.json` |
|  |  | `test` | `tests/astack/ci-pins-adversarial.test.ts` | `a plain scalar that goes on to the next line > at the start of the next line of a step name is plain text, so the setup-bun step below it stops when the PR changes the packageManager` |
|  |  | `test` | `tests/astack/ci-pins-adversarial.test.ts` | `a bracket, a brace or a quote that YAML reads as plain text > an inputs block in flow style gives its defaults, so a .bun-version change that a default names stops` |
|  |  | `test` | `tests/astack/ci-pins-adversarial.test.ts` | `a space character that JS reads as a space and YAML does not > a step name with a no-break space` |
|  |  | `test` | `tests/astack/ci-pins-adversarial.test.ts` | `a flow collection that names no version file > a flow with mapping of actions/checkout in a file that names bun-version-file passes a dependency-only PR` |
|  |  | `test` | `tests/astack/ci-pins-adversarial.test.ts` | `an anchor name that YAML parsers can end at another character > an anchor name with a dot before a bun-version-file value stops, because a parser that ends the name at the dot reads another file` |
|  |  | `test` | `tests/astack/ci-pins-adversarial.test.ts` | `a uses value that GitHub splits on a slash or a backslash > oven-sh//setup-bun@v2 in a composite action runs oven-sh/setup-bun, so a packageManager change stops` |
|  |  | `test` | `tests/astack/ci-pins-adversarial.test.ts` | `a bun-version that reaches setup-bun as empty > a caller that gives a local action a blank bun-version makes setup-bun read package.json, so a packageManager change stops` |
|  |  | `test` | `tests/astack/ci-pins-adversarial.test.ts` | `the reader that setup-bun picks by the input as written > bun-version-file: .bun-version/. has the basename . so setup-bun reads package.json, and a packageManager change stops` |
|  |  | `test` | `tests/astack/ci-pins-adversarial.test.ts` | `a key that is an expression > a with key that an expression makes node-version-file stops, because GitHub evaluates the key` |
|  |  | `test` | `tests/astack/ci-pins-adversarial.test.ts` | `a root key of an action that the runner matches by exact case > Inputs: in upper case declares no input for the runner, so the input is empty, setup-bun reads package.json and a packageManager change stops` |
|  |  | `test` | `tests/astack/ci-pins-adversarial.test.ts` | `the lockfile that supabase/setup-cli reads when version is empty > a bare setup-cli step installs the supabase of bun.lock, so a supabase bump in bun.lock stops` |
|  |  | `test` | `tests/astack/ci-pins-adversarial.test.ts` | `a local action named by another form than ./ > uses: $/tools/ci-setup runs tools/ci-setup/action.yml, so a PR that changes that file stops` |
|  |  | `test` | `tests/astack/ci-pins-adversarial.test.ts` | `an action repo that GitHub redirects after a rename > xhyrom/setup-bun redirects to oven-sh/setup-bun, which reads package.json, so a packageManager change stops` |
|  |  | `test` | `tests/astack/ci-pins-adversarial.test.ts` | `a base branch that moves after the merge base > a packageManager bump on main after the merge base stops, because the merge commit that a pull_request run tests has another bun than HEAD` |
|  |  | `test` | `tests/astack/ci-pins-adversarial.test.ts` | `a base branch that moves after the merge base > a CI change on main after the merge base stops, because the mode ci_proof covers only the CI change of the PR` |
|  |  | `test` | `tests/astack/ci-pins-adversarial.test.ts` | `a pnpm-lock.yaml with an alias > an alias in pnpm-lock.yaml makes the lockfile unread, so a supabase bump there stops without a crash` |
| `gate-env-and-tools` | Each variable that a CI job of the gate sets, by any means, is copied, set or left out with a why. Each tool version that CI pins is recorded, and so is each pinned tool that a prerequisite or a setup entry of the gate runs. A version note is advisory, so a profile that merges after a clean stop has a merge condition that checks CI on the head. | `apply-check` | `scripts/lib/ci-parity.ts` | `envFileWrites` |
|  |  | `apply-check` | `scripts/lib/ci-parity.ts` | `exportVerdicts` |
|  |  | `apply-check` | `scripts/lib/ci-parity.ts` | `serviceVerdicts` |
|  |  | `apply-check` | `src/astack/pr-review-profile.ts` | `mergesWithoutCi` |
|  |  | `test` | `tests/apply/ci-parity.test.ts` | `a gate runs with each variable that a step of its job writes to $GITHUB_ENV > a write that the check cannot read fails, unless the project config maps or excludes its step with a reason` |
|  |  | `test` | `tests/apply/ci-parity.test.ts` | `a gate runs with each variable that a step of its job writes to $GITHUB_ENV > readWorkflows reads each name that an echo, a group or a heredoc writes, and marks a write that it cannot read` |
|  |  | `test` | `tests/apply/ci-parity.test.ts` | `a gate accounts for each service of its CI job` |
|  |  | `test` | `tests/apply/ci-parity.test.ts` | `a $GITHUB_ENV value that the shell expands is a CI value that a gate cannot copy` |
|  |  | `apply-check` | `scripts/lib/ci-parity.ts` | `staleTools` |
|  |  | `test` | `tests/apply/ci-parity.test.ts` | `a tool that only a local prerequisite of the gate runs > passes when another CI job of the profile pins the version that the gate records, as a test gate on a local Supabase stack needs` |
|  |  | `test` | `tests/profile-shell.test.ts` | `a gate that runs a pinned tool > %s records in the tools of each gate every tool that the profile pins and that the gate or its prerequisites run, because the run puts only the tools of the gate on the PATH` |
|  |  | `test` | `tests/apply/ci-parity.test.ts` | `a gate runs in the env of its CI job > a gate with no ci_env misses each variable of its job, and CI=true needs no entry` |
|  |  | `test` | `tests/apply/ci-parity.test.ts` | `a gate runs in the env of its CI job > a job gives the env of its container under the workflow env and its own` |
|  |  | `test` | `tests/apply/ci-parity.test.ts` | `a gate runs on the tool versions that its CI job pins > a gate that records another version fails, so a new pin in CI stops apply` |
|  |  | `test` | `tests/apply/render.test.ts` | `review stub and profile copies > reports a profile that merges after a clean stop with no condition that checks CI on the head` |
|  |  | `test` | `tests/pr-review-profile.test.ts` | `the CI environment of a gate > the run never fakes a variable of the GitHub runner` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `the CI environment of a gate > %s exports CI=true and the CI values, and never fakes the runner` |
|  |  | `pinned-rule` | `tests/hardening-consistency.test.ts` | `the tool versions of a gate > %s says that CI runs the pins and gates the merge, so a version note is advisory` |
| `comment-keep-forms` | Each citation form that a repo rule requires, in the spelling of the repo, passes the comment hook through the keep patterns of the repo. Apply checks it in write mode and in report-only mode. A keep pattern keeps only the lines that it matches, so the hook still denies a line beside them that it denies alone, such as provenance, narration, a `file:line` reference, the file's own path, a banner or commented-out code. A line that starts with `Copied from` and has no link is provenance. The text of a `rest` group gets the same checks. A pattern that starts with a comment marker matches only a line with that marker. Each text that sets a length limit on a kept comment says that a legal or license header has no length limit. The hook passes such a header at any length, also when blank lines split it, and also when a keep pattern matches one of its lines. A comment that holds a license line passes at any length, so each part of a split header must hold a license line, such as a warranty disclaimer. A license line names a known license, a license page of a known host or a fixed phrase of a license, so a license word in prose keeps no comment. Each standard license header that the README of the plugin names passes the hook. The hook still denies a line beside a license line that it denies alone. | `apply-check` | `scripts/lib/keep-forms.ts` | `unkeptCitations` |
|  |  | `test` | `tests/apply/ci-parity-apply.test.ts` | `apply --dry-run checks what each gate reads from the tree > a decision citation in the repo fails the dry run until a keep pattern of the repo keeps its spelling` |
|  |  | `test` | `tests/apply/ci-parity-apply.test.ts` | `apply --dry-run checks what each gate reads from the tree > a decision citation fails the report-only dry run too` |
|  |  | `test` | `tests/apply/keep-forms.test.ts` | `unkeptCitations > a hyphenated ADR citation fails with a keep pattern for the spaced spelling only` |
|  |  | `hook` | `tests/apply/projects.test.ts` | `the project configs of each scanned companion > a decided keep form passes the hook only through the repo's keep patterns` |
|  |  | `apply-check` | `scripts/lib/render.ts` | `keepPatternMismatch` |
|  |  | `hook` | `tests/astack/classify.test.ts` | `a project keep pattern does not lift the line limit` |
|  |  | `hook` | `tests/astack/classify.test.ts` | `a project keep pattern keeps only its own line, and the hook still denies %s beside it` |
|  |  | `hook` | `tests/astack/classify.test.ts` | `a project keep pattern checks the text of its rest group as a free line` |
|  |  | `hook` | `tests/astack/classify.test.ts` | `a project keep pattern that starts with a comment marker matches only a line with that marker` |
|  |  | `test` | `tests/astack/hook.test.ts` | `a legal or license header has no length limit > each text that sets a length limit on a kept comment exempts a legal or license header` |
|  |  | `hook` | `tests/astack/hook.test.ts` | `comment enforcement on Edit and Write > an MIT license header of more than 12 lines in %s passes silently, because a legal header has no length limit` |
|  |  | `hook` | `tests/astack/hook.test.ts` | `comment enforcement on Edit and Write > an MIT license header with a line that a keep pattern matches passes silently, because a keep pattern never adds a length limit to a legal header` |
|  |  | `hook` | `tests/astack/hook.test.ts` | `comment enforcement on Edit and Write > %s passes silently, because a legal header has no length limit` |
|  |  | `hook` | `tests/astack/hook.test.ts` | `comment enforcement on Edit and Write > %s is denied, because a license word in prose is no license header` |
|  |  | `hook` | `tests/astack/classify.test.ts` | `a license word in prose keeps no comment > %s` |
| `managed-file-lifecycle` | Apply fails on a tracked file whose name holds the name of a managed skill or command, outside the managed list. Each apply commit subject names the files that it deletes, also with a subject from the project config. A commit that adds no file says update and names only the files that it changes. Each kind of file has its own part of the subject, so a commit that changes only the hardening profile names the profile, not the review stub. `astack managed` follows each symlink to the file that apply writes. | `apply-check` | `scripts/lib/removals.ts` | `strayCopies` |
|  |  | `apply-check` | `scripts/lib/removals.ts` | `planRemovals` |
|  |  | `test` | `tests/apply/removals.test.ts` | `strayCopies > a tracked copy of the hardening skill or command that apply neither writes nor deletes is a stray copy` |
|  |  | `test` | `tests/apply/removals.test.ts` | `strayCopies > a tracked file whose name holds the skill name anywhere in a segment is a stray copy too` |
|  |  | `test` | `tests/apply/worktree.test.ts` | `apply --worktree into a repo that holds an old copy of the hardening command > a tracked copy of the command at another path stops the apply before the commit` |
|  |  | `test` | `tests/apply/worktree.test.ts` | `apply --worktree into a repo that holds an old copy of the hardening command > the create commit deletes the retired command and names the removal in its subject` |
|  |  | `test` | `tests/apply/worktree.test.ts` | `apply --worktree into a repo that holds an old copy of the hardening command > a create commit with a subject from the project config still names the removal` |
|  |  | `test` | `tests/astack/commit-style.test.ts` | `commitSubject with removals > a create subject names the files that astack replaces in the repo's style` |
|  |  | `test` | `tests/apply/worktree.test.ts` | `apply --worktree on a new branch from a main that already holds the astack files > the commit says update and names only the files that it changes, as a follow-up PR after a merged setup PR needs` |
|  |  | `test` | `tests/astack/managed.test.ts` | `astack managed > follows a symlinked skills folder to the file that apply writes` |
|  |  | `test` | `tests/apply/worktree.test.ts` | `the setup commit and the next steps > a commit that changes only the hardening profile names that profile, not the review stub` |
| `astack-provenance` | Apply refuses to write from an astack tree with no commit, or with uncommitted changes in a folder that it renders from, `upstream/` included. Each apply commit, also an update commit, names the astack commit. With `neutralCommit`, the subject, the body and each trailer hold no substring of `lint.denySubstrings`, and the trailer with its provenance key names the astack commit. Such a project, when it merges after a clean stop, sets the subject and the body of the squash commit in its merge command. | `apply-check` | `scripts/lib/project-apply.ts` | `committedSource` |
|  |  | `test` | `tests/apply/worktree.test.ts` | `apply --worktree reads the state of the astack tree that it writes from > refuses an astack tree with no commit, and makes no branch` |
|  |  | `test` | `tests/apply/worktree.test.ts` | `apply --worktree reads the state of the astack tree that it writes from > refuses an astack tree with a change in its sources that is not committed, and ignores a file outside them` |
|  |  | `test` | `tests/apply/worktree.test.ts` | `apply --worktree reads the state of the astack tree that it writes from > refuses an astack tree with an uncommitted change in upstream, which the NOTICE that apply writes reads` |
|  |  | `test` | `tests/apply/worktree.test.ts` | `apply --worktree on a temp repo > commits the files once on a new branch from origin/main` |
|  |  | `test` | `tests/apply/worktree.test.ts` | `apply --worktree --update on a temp repo > adds one follow-up commit that writes the new content and deletes what astack no longer writes` |
|  |  | `test` | `tests/apply/worktree.test.ts` | `apply --worktree with a neutral commit text, as a repo that must not name the tool > the commit message holds no denied substring, and its neutral trailer names the source commit` |
|  |  | `test` | `tests/apply/worktree.test.ts` | `apply --worktree with a neutral commit text, as a repo that must not name the tool > a trailer that holds a denied substring is refused, and nothing is committed` |
|  |  | `test` | `tests/apply/projects.test.ts` | `validateProjectConfig > accepts a neutral commit text with a provenance key, and refuses a key or a subject that holds a denied substring` |
|  |  | `test` | `tests/apply/render.test.ts` | `renderAstackProfile > a project with a neutral commit text writes its denied substrings, so a check in the repo reads the same list, and profile.ts accepts them` |
|  |  | `test` | `tests/astack/commit-style.test.ts` | `the neutral words of a commit > %s names no tool` |
|  |  | `test` | `tests/apply/projects.test.ts` | `the project configs of each scanned companion > a project with a neutral commit text sets the subject and the body of the squash commit, so the commit on main names no tool` |
| `upstream-licence` | The run scan reads each text file of each upstream in `upstream/lock.json`. Each rendered file points to a notice that holds the copyright notice and the permission notice of each upstream that it copies. Each skill and agent names in its origin each upstream that it shares a run of words with. Each flat skill names each upstream that it shares a run of words with. No dist file or rendered file shares a run with an unscanned upstream. | `test` | `tests/apply/notices.test.ts` | `the upstreams that the run scan reads > each source in upstream/lock.json is scanned, or the unscanned table gives the reason, never both` |
|  |  | `test` | `tests/apply/notices.test.ts` | `text that apply copies from upstream > $name declares every upstream it copies` |
|  |  | `test` | `tests/apply/notices.test.ts` | `text that apply copies from upstream > $name: the notice lists each copied file and holds each licence` |
|  |  | `test` | `tests/apply/notices.test.ts` | `text that apply copies from upstream > $name: no rendered file shares a run with an upstream of the unscanned table` |
|  |  | `test` | `tests/dist/real.test.ts` | `the dist of this repo > each astack skill with an origin carries the copyright of each origin upstream in its flat licence` |
|  |  | `test` | `tests/notice.test.ts` | `the notice test > fails on a planted skill or agent that shares a run with an upstream and has no origin, and notes an origin with no shared run` |
|  |  | `test` | `tests/notice.test.ts` | `the notice of each bundled package > gives the licence text of each dependency that the CLI bundle holds, and refuses one that has no LICENSE file` |
|  |  | `test` | `tests/dist/real.test.ts` | `the dist of this repo > a copied upstream shell script in a skill needs the upstream copyright in its licence` |
|  |  | `test` | `tests/dist/real.test.ts` | `the dist of this repo > no dist file shares a run with an upstream of the unscanned table, so the reason of the table holds` |
| `profile-scan-reach` | Each scan of the profiles reads each profile file of the example companion, the profile of each branch overlay included. The scans take the list from `tests/profile-paths.ts`, so no test makes a list of its own. `bun run check:companion` runs the same scans on each profile and overlay of the companion, with the exception rows of its `profile-scan.json`. | `test` | `tests/hardening-consistency.test.ts` | `the profile scans > the profile list of the scans holds each profile that apply writes, the profile of each branch overlay included` |
|  |  | `test` | `tests/check-companion.test.ts` | `bun run check:companion > an entry of the profile of a branch overlay that prints a .env file` |
|  |  | `test` | `tests/check-companion.test.ts` | `bun run check:companion > reads the exception rows of the profile scans from the companion` |
| `apply-copy-scope` | The dry run of apply copies the product repo with the files that git ignores, such as `node_modules`, because its gates need them. It copies no worktree that git records inside the repo, such as a worktree in `.claude/worktrees`. | `test` | `tests/apply/ci-parity-apply.test.ts` | `apply --dry-run copies the repo for its checks > the copy holds the tracked and the ignored files of the repo, and no nested worktree` |
| `pr-graph-walk` | The stack walk of watch-pr keeps a set of the PRs that it visited, and stops when a PR repeats. So a cycle of open PRs, such as A on B and B on A, ends the walk. | `test` | `tests/astack/watch-pr/github.test.ts` | `context and stack discovery > ends the walk down the stack when the bases of open PRs form a cycle` |
| `terminal-control-text` | Each command prints a field from GitHub, such as a comment body, a check name or a query failure, with each C0 control character, DEL and C1 control character escaped. The JSON output escapes them too, and a parser reads the same value back. orch refuses a PR row whose head or base branch name holds such a character. | `test` | `tests/astack/watch-pr/render.test.ts` | `control characters in GitHub text > pretty output escapes each control character of %s` |
|  |  | `test` | `tests/astack/watch-pr/render.test.ts` | `control characters in GitHub text > JSON output escapes DEL and C1 characters, and parses back to the same verdict` |
|  |  | `test` | `tests/astack/orch/store.test.ts` | `Store > refuses a pull request row whose $name holds a control character` |

## Findings

The table holds each finding of the review ledger. A Codex finding has two rows when the ledger gave it a second title. The ref of a Codex finding is `codex:r<round>-<n>`, and the ref of a workflow finding is `wf:r<round>:<slug>`. A declined finding and a duplicate have the reason in place of a class. The Status cell is `fixed` when the guards of the class hold the finding, and `open` when the owner still has a step. It is `declined` or `duplicate` for a finding with no class.

| Ref | Round | Origin | Severity | Title | Class | Status |
|---|---|---|---|---|---|---|
| `codex:r1-1` | 1 | codex | P1 | "Preserve all blocking severity aliases" | `engine-stub-drift` | `fixed` |
| `codex:r1-1` | 1 | codex | P1 | "The stub fallback counts only Critical and Important as blocking" | `engine-stub-drift` | `fixed` |
| `codex:r1-2` | 1 | codex | P1 | "Migrate the slash-command entry point" | `managed-file-lifecycle` | `fixed` |
| `codex:r1-2` | 1 | codex | P1 | "The stale /pr-review-hardening command wrapper and GOAL file contradict the stub" | `managed-file-lifecycle` | `fixed` |
| `codex:r1-3` | 1 | codex | P2 | "Define the fallback's terminal policy" | `fallback-key-contract` | `fixed` |
| `codex:r1-3` | 1 | codex | P2 | "The stub fallback reads profile keys that the rendered profile does not define" | `fallback-key-contract` | `fixed` |
| `codex:r1-4` | 1 | codex | P2 | "Reconcile the failing-test commit requirement" | `contradicting-commit-rules` | `fixed` |
| `codex:r1-4` | 1 | codex | P2 | "The commit-the-failing-test rule conflicts with one commit per finding" | `contradicting-commit-rules` | `fixed` |
| `codex:r1-5` | 1 | codex | P2 | "Preserve required ADR annotations" | `comment-keep-forms` | `fixed` |
| `codex:r1-5` | 1 | codex | P2 | "The comment keep list drops ADR citations that repo rules require" | `comment-keep-forms` | `fixed` |
| `codex:r1-6` | 1 | codex | P2 | "Include the copied MIT license notice" | `upstream-licence` | `fixed` |
| `codex:r1-6` | 1 | codex | P2 | "Copied upstream text ships with no MIT notice" | `upstream-licence` | `fixed` |
| `wf:r1:verify:acme-adr-hyphen` | 1 | verify | minor | "The acme keep pattern misses the hyphen ADR form" | `comment-keep-forms` | `fixed` |
| `wf:r1:verify:flat-licence-pstack` | 1 | verify | minor | "Flat dist skill licences omit pstack for derived astack skills" | `upstream-licence` | `fixed` |
| `wf:r1:verify:managed-symlink` | 1 | verify | minor | "astack managed does not follow a symlink to a managed file" | `managed-file-lifecycle` | `fixed` |
| `wf:r1:verify:astack-no-commit` | 1 | verify | minor | "The astack source repo has no commit, so a PR reply cannot cite an astack change" | `astack-provenance` | `open` |
| `wf:r1:reapply:create-subject-removal` | 1 | other | minor | "The create-mode commit subject hides the files that apply deletes" | `managed-file-lifecycle` | `fixed` |
| `codex:r2-1` | 2 | codex | P2 | "Detect tracked writes during the baseline" | `engine-stub-drift` | `fixed` |
| `codex:r2-1` | 2 | codex | P2 | "The stub fallback baseline does not compare git status" | `engine-stub-drift` | `fixed` |
| `codex:r2-2` | 2 | codex | P2 | "Use the supported labels field for Linear updates" | declined: the live Linear schema of the owner lists the label fields. The later fix is the entry in class `tracker-tool-schema`. | `declined` |
| `codex:r2-2` | 2 | codex | P2 | "Linear label updates use addLabels and removeLabels that some servers lack" | `tracker-tool-schema` | `fixed` |
| `codex:r2-3` | 2 | codex | P2 | "Replace the unsupported map patch operation" | declined: the live Linear schema of the owner lists the map field. The later fix is the entry in class `tracker-tool-schema`. | `declined` |
| `codex:r2-3` | 2 | codex | P2 | "The wayfinder map update uses patch that some Linear servers lack" | `tracker-tool-schema` | `fixed` |
| `codex:r2-4` | 2 | codex | P2 | "Keep each bug-fix commit green" | `contradicting-commit-rules` | `fixed` |
| `codex:r2-4` | 2 | codex | P2 | "The commit rule makes a red commit against globex G1" | `contradicting-commit-rules` | `fixed` |
| `codex:r2-5` | 2 | codex | P2 | "Parse the advertised --pr argument in the fallback" | `engine-stub-drift` | `fixed` |
| `codex:r2-5` | 2 | codex | P2 | "The stub fallback does not parse --pr" | `engine-stub-drift` | `fixed` |
| `wf:r2:verify:pstack-principle-red-commit` | 2 | verify | minor | "The pstack principle skill keeps the red-commit order with no astack override" | `contradicting-commit-rules` | `fixed` |
| `codex:r3-1` | 3 | codex | P2 | "Run the repository's complete lint gate" | `ci-job-coverage` | `fixed` |
| `codex:r3-1` | 3 | codex | P2 | "globex lint gate runs Biome directly and never runs manypkg check" | `ci-job-coverage` | `fixed` |
| `codex:r3-2` | 3 | codex | P2 | "Exercise the blocking browser suite for layout changes" | `ci-job-coverage` | `fixed` |
| `codex:r3-2` | 3 | codex | P2 | "globex has no Playwright browser-smoke gate for layout diffs" | `ci-job-coverage` | `fixed` |
| `wf:r3:verify:gate-narrower-than-job` | 3 | verify | major | "globex browser-smoke and portal-build skip paths that CI tests, and parity ignores when_changed" | `ci-job-coverage` | `fixed` |
| `wf:r3:verify:unproven-exclusion` | 3 | verify | major | "ci-parity accepts an exclusion of any job, so blocking globex visual had no gate" | `ci-job-coverage` | `fixed` |
| `wf:r3:verify:foreign-dev-servers` | 3 | verify | major | "Browser gate prerequisites accept dev servers from another checkout" | `foreign-process-trust` | `fixed` |
| `wf:r3:verify:untracked-env-files` | 3 | verify | minor | "hooli e2e and app-build need untracked .env files that no prerequisite names" | `ignored-file-prerequisites` | `fixed` |
| `codex:r4-1` | 4 | codex | P1 | "Check out the pull request named by --pr" | `review-target-identity` | `fixed` |
| `codex:r4-1` | 4 | codex | P1 | "--pr run never checks out or verifies the PR head" | `review-target-identity` | `fixed` |
| `codex:r4-2` | 4 | codex | P2 | "Run the browser smoke gate in CI mode" | `gate-env-and-tools` | `fixed` |
| `codex:r4-2` | 4 | codex | P2 | "Gates run without CI=true, so forbidOnly is off" | `gate-env-and-tools` | `fixed` |
| `wf:r4:pre-review-1:stale-local-base` | 4 | pre-review | P1 | "The base is a bare local branch that is never fetched" | `review-target-identity` | `fixed` |
| `wf:r4:pre-review-1:next-env-rewrite` | 4 | pre-review | P1 | "Next.js build gates rewrite the tracked next-env.d.ts and stop every run" | `tracked-file-writes` | `fixed` |
| `wf:r4:pre-review-1:build-output-prereq` | 4 | pre-review | P2 | "BUILD_ID prerequisites run at preflight and turn a red build into NOT_STARTED" | `prerequisite-semantics` | `fixed` |
| `wf:r4:pre-review-1:empty-diff-clean` | 4 | pre-review | P2 | "An empty diff reaches stop_clean" | `clean-stop-criteria` | `fixed` |
| `wf:r4:pre-review-1:stub-glob-rule` | 4 | pre-review | P2 | "The stub does not define * and ** in when_changed globs" | `engine-stub-drift` | `fixed` |
| `wf:r4:pre-review-1:red-gate-finding` | 4 | pre-review | P2 | "The stub never makes a red gate a finding or splits PR reds from pre-existing reds" | `engine-stub-drift` | `fixed` |
| `wf:r4:pre-review-1:reviewer-cwd` | 4 | pre-review | P2 | "Reviewer subagents get only a cwd-relative diff in the --pr worktree path (PLAUSIBLE)" | `review-target-identity` | `fixed` |
| `wf:r4:pre-review-1:unread-profile-keys` | 4 | pre-review | P2 | "The fallback ignores profile keys that change which findings block" | `fallback-key-contract` | `fixed` |
| `wf:r4:pre-review-1:ledger-path` | 4 | pre-review | P3 | "ledger.carry_over true points to previous records, but the stub never says where the ledger is" | `fallback-key-contract` | `fixed` |
| `wf:r4:pre-review-2:tool-pins` | 4 | pre-review | P1 | "Parity drops the bun and Supabase CLI pins of CI" | `gate-env-and-tools` | `fixed` |
| `wf:r4:pre-review-2:merge-ref-base` | 4 | pre-review | P1 | "Gates test the PR head, but CI tests the merge into the base" | `review-target-identity` | `fixed` |
| `wf:r4:pre-review-2:acme-seed-residue` | 4 | pre-review | P1 | "acme test gate runs on the lane stack after seed:e2e, so pgTAP access-matrix is red" | `long-lived-stack-state` | `fixed` |
| `wf:r4:pre-review-2:stack-migrations` | 4 | pre-review | P1 | "Stack gates run on a long-lived stack that never applies the PR migrations" | `long-lived-stack-state` | `fixed` |
| `wf:r4:pre-review-2:turbo-cache` | 4 | pre-review | P2 | "turbo replays a cached green for globex test and lint" | `workspace-state` | `fixed` |
| `wf:r4:pre-review-2:smoke-dev-servers` | 4 | pre-review | P2 | "globex browser-smoke tests bun dev servers with real keys, not the built portal" | `ci-job-coverage` | `fixed` |
| `wf:r4:pre-review-2:acme-draft-grep` | 4 | pre-review | P2 | "acme e2e gate always runs the draft lane grep, and the profile said a run cannot stop clean while CI fails" | `ci-job-coverage` | `fixed` |
| `wf:r4:pre-review-2:initech-test-order` | 4 | pre-review | P2 | "initech runs bun run test after pgTAP and seed replay, unlike CI" | `ci-job-coverage` | `fixed` |
| `wf:r4:verify:globex-env-prereq` | 4 | verify | minor | "globex portal-build and browser-smoke have no prerequisite for the ignored .env files" | `ignored-file-prerequisites` | `fixed` |
| `wf:r4:verify:acme-session-db-url` | 4 | verify | minor | "acme lane prerequisite does not check a session DATABASE_PRIMARY_URL under CI=true" | `shared-resource-side-effects` | `fixed` |
| `wf:r4:verify:next-env-apply-check` | 4 | verify | minor | "No apply check for a build gate whose app tracks next-env.d.ts" | `tracked-file-writes` | `fixed` |
| `wf:r4:verify:container-step-env` | 4 | verify | minor | "Parity skips container.env and the step env of a whole-mapped job" | `gate-env-and-tools` | `fixed` |
| `codex:r5-1` | 5 | codex | P1 | "Make the mandatory portal build read-only" | `tracked-file-writes` | `fixed` |
| `codex:r5-1` | 5 | codex | P1 | "portal-build rewrites the tracked next-env.d.ts, so every run stops" | `tracked-file-writes` | `fixed` |
| `codex:r5-2` | 5 | codex | P2 | "Refuse to certify gates with unpinned fallback tools" | declined: an owner decision. The run does not refuse a clean stop on an unpinned tool, because each merge path checks CI on the head. A profile that merges after a clean stop needs a merge condition that checks CI on the head, and the profile check refuses one without it. The later fix is the entry in class `gate-env-and-tools`. | `declined` |
| `codex:r5-2` | 5 | codex | P2 | "Report does not say that a local version note is advisory" | `gate-env-and-tools` | `fixed` |
| `codex:r5-3` | 5 | codex | P2 | "Rebuild the browser database from the checked-out migrations" | `long-lived-stack-state` | `fixed` |
| `codex:r5-3` | 5 | codex | P2 | "Stack gate trusts a long-lived stack whose applied migration bodies changed" | `long-lived-stack-state` | `fixed` |
| `wf:r5:p1-hunt:cd-moves-next-entry` | 5 | pre-review | P1 | "A cd in one gate entry moves the next entry" | `gate-shell-and-cwd` | `fixed` |
| `wf:r5:p1-hunt:restore-pathspec-cwd` | 5 | pre-review | P1 | "Rewrites restore uses a pathspec relative to the current folder" | `gate-shell-and-cwd` | `fixed` |
| `wf:r5:p1-hunt:zsh-word-split` | 5 | pre-review | P1 | "Gates run in zsh, which breaks the acme grep split and PIPESTATUS" | `gate-shell-and-cwd` | `fixed` |
| `wf:r5:verify:restore-hides-earlier-write` | 5 | verify | minor | "Rewrites restore can hide a write of an earlier gate" | `tracked-file-writes` | `fixed` |
| `wf:r5:fix:psql-enobufs` | 5 | other | unrated | "Migration check fails with ENOBUFS on a large stack" | `long-lived-stack-state` | `fixed` |
| `codex:r6-1` | 6 | codex | P1 | "Verify the implicitly discovered PR head" | `review-target-identity` | `fixed` |
| `codex:r6-1` | 6 | codex | P1 | "Run without --pr never compares HEAD with the PR head" | `review-target-identity` | `fixed` |
| `codex:r6-2` | 6 | codex | P1 | "Require lsof before relying on smoke cleanup" | `prerequisite-semantics` | `fixed` |
| `codex:r6-2` | 6 | codex | P1 | "lsof prerequisite passes when lsof is missing, and cleanup kills by port" | `foreign-process-trust` | `fixed` |
| `codex:r6-3` | 6 | codex | P2 | "Install frozen dependencies in every selected worktree" | `workspace-state` | `fixed` |
| `codex:r6-3` | 6 | codex | P2 | "Frozen install runs only in a new --pr worktree" | `workspace-state` | `fixed` |
| `codex:r6-4` | 6 | codex | P1 | "Redact environment values from gate output" | `secret-output` | `fixed` |
| `codex:r6-4` | 6 | codex | P1 | "Run prints session secret values in <NAME>_ENV" | `secret-output` | `fixed` |
| `wf:r6:hunt:false-clean:rename-hides-old-path` | 6 | hunt | P1 | "when_changed hides the old path of a renamed file" | `ci-job-coverage` | `fixed` |
| `wf:r6:hunt:false-clean:untracked-files` | 6 | hunt | P1 | "Gates run on the working tree, so an untracked file gives a false clean" | `workspace-state` | `fixed` |
| `wf:r6:hunt:stale-state:untracked-files` | 6 | hunt | P1 | "Gates run on the working tree, not on HEAD (duplicate)" | declined: a duplicate of `wf:r6:hunt:false-clean:untracked-files`, which is in class `workspace-state`. | `duplicate` |
| `wf:r6:hunt:false-clean:ci-change-parity` | 6 | hunt | P1 | "A PR that changes CI runs against gates that mirror the old CI" | `ci-job-coverage` | `fixed` |
| `wf:r6:hunt:false-clean:stale-sim` | 6 | hunt | P1 | "hooli e2e accepts a sim and fake Trigger.dev of another checkout" | `foreign-process-trust` | `fixed` |
| `wf:r6:hunt:stale-state:stale-sim` | 6 | hunt | P1 | "hooli e2e tests a sim of another tree or an older commit (duplicate)" | declined: a duplicate of `wf:r6:hunt:false-clean:stale-sim`, which is in class `foreign-process-trust`. | `duplicate` |
| `wf:r6:hunt:false-clean:unseen-fix-commit` | 6 | hunt | P1 | "stop_clean can certify a step-4 fix commit that no reviewer saw" | `clean-stop-criteria` | `fixed` |
| `wf:r6:hunt:stale-state:frozen-install-keeps-removed-dep` | 6 | hunt | P1 | "Frozen install keeps a removed dependency in node_modules" | `workspace-state` | `fixed` |
| `wf:r6:hunt:stale-state:stale-stack-config` | 6 | hunt | P1 | "Long-lived Supabase stack keeps the config.toml of its start" | `long-lived-stack-state` | `fixed` |
| `wf:r6:hunt:secrets-side-effects:acme-lane-reset` | 6 | hunt | P1 | "acme lane check lets bun run reset hit a stack this worktree does not own" | `shared-resource-side-effects` | `fixed` |
| `wf:r6:hunt:shell-tools:gh-failure-means-no-pr` | 6 | hunt | P1 | "A failed gh lookup counts as no PR and skips the head check" | `review-target-identity` | `fixed` |
| `wf:r6:verify:stack-config-compares-times` | 6 | verify | major | "check stack-config compares commit times, not the config the stack holds" | `long-lived-stack-state` | `fixed` |
| `wf:r6:verify:gh-no-pr-case` | 6 | verify | minor | "No-PR rule matches only the lowercase gh message" | `review-target-identity` | `fixed` |
| `wf:r6:verify:supabase-start-prints-keys` | 6 | verify | minor | "Secret sweep missed supabase start, which prints the stack keys" | `secret-output` | `fixed` |
| `wf:r6:verify:node-modules-delete-owner-checkout` | 6 | verify | minor | "node_modules delete runs in the owner checkout with no owner gate" | `shared-resource-side-effects` | `fixed` |
| `wf:r6:verify:globex-curl-prereq` | 6 | verify | minor | "globex smoke uses curl but checks only lsof" | `prerequisite-semantics` | `fixed` |
| `wf:r6:fix-3:stack-start-hides-ci-step` | 6 | other | unrated | "astack stack start wrapper hid the CI start step from parity" | `ci-job-coverage` | `fixed` |
| `codex:r7-1` | 7 | codex | P2 | "Provide Supabase to the test gate" | `gate-env-and-tools` | `fixed` |
| `wf:r8:open:create-subject-kinds` | 8 | other | minor | "A follow-up create commit says add and names every kind that apply writes" | `managed-file-lifecycle` | `fixed` |
| `wf:r9:design:stub-comment-fields` | 9 | other | unrated | "The stub fallback posts the Hardening comment with no list of its fields" | `engine-stub-drift` | `fixed` |
| `wf:r9:critique-2:stub-unclean-trailers` | 9 | other | minor | "The stub fallback still leaves on_unclean, trailers and the database gates underspecified" | `engine-stub-drift` | `open` |
| `wf:r9:critique-2:prepass-claims-audit` | 9 | other | minor | "Moving prepasses whole lets a claims-audit prepass pass apply while the stub ignores it" | `fallback-key-contract` | `fixed` |
| `wf:r9:critique-2:claim-line` | 9 | other | major | "The session claim replaces the wayfinder Claim line, and a research claim by comment leaves the ticket on the frontier" | `flow-doc-register` | `fixed` |
| `wf:r9:critique-1:flow-docs-register` | 9 | other | major | "The agent docs still send astack skills to a flow that is not the flow of the repo" | `flow-doc-register` | `fixed` |
| `wf:r9:critique-1:commit-names-plugins` | 9 | other | major | "The apply commit names the plugins outside the paths that may name them" | `astack-provenance` | `fixed` |
| `wf:r9:critique-2:merge-names-astack` | 9 | other | major | "The configured merge command puts the tool name into a squash commit on main" | `astack-provenance` | `fixed` |
| `wf:r9:critique-2:keep-free-line` | 9 | other | major | "The keep patterns keep a second free line and free text, not only the three forms" | `comment-keep-forms` | `fixed` |
| `wf:r10:keep-free-line` | 10 | verify | major | "The initech keep patterns keep a free second line with each of the 3 forms, so they keep more than the 3 forms" | `comment-keep-forms` | `fixed` |
| `wf:r10:keep-free-text` | 10 | verify | minor | "The context and TODO patterns keep free narration on one line, and a TS comment that starts with `-- Context:`" | `comment-keep-forms` | `fixed` |
| `wf:r10:stub-keep-marker` | 10 | verify | minor | "The stub fallback comment gate does not say 'with or without its comment marker', and initech now mixes the two anchors" | `fallback-key-contract` | `fixed` |
| `wf:r10:flow-decision-frontier` | 10 | verify | minor | "The initech agent docs still let a frontier agent claim and close a decision sub-issue of the Map" | `flow-doc-register` | `fixed` |
| `wf:r10:pin-test-weakened` | 10 | verify | minor | "A fix commit weakens the keep-pattern pin test of all projects" | `comment-keep-forms` | `fixed` |
| `wf:r10:untested-claims` | 10 | verify | minor | "Three claims of the initech commits have no failing test" | `astack-provenance` | `fixed` |
| `wf:r10:deny-upstream-name` | 10 | verify | minor | "initech denySubstrings do not hold the flow upstream name, so the product-file lint and the neutral-commit check miss it" | `astack-provenance` | `fixed` |
| `wf:r10:deny-tooling-names` | 10 | verify | minor | "The initech deny list misses names that the five tooling paths hold" | declined: a duplicate of `wf:r10:deny-upstream-name`, which is in class `astack-provenance` | `duplicate` |
| `wf:r10:commit-text-check` | 10 | verify | minor | "No automatic check keeps plugin names out of initech commit messages, the PR title and the PR body" | `astack-provenance` | `fixed` |
| `codex:r11-1` | 11 | codex | P2 | "Define the fix branch when no PR exists" | `engine-stub-drift` | `fixed` |
| `codex:r11-2` | 11 | codex | P2 | "Allow ledger entries for deleted files" | `ledger-continuity` | `fixed` |
| `codex:r11-3` | 11 | codex | P2 | "Reset the ledger only once per hardening run" | `ledger-continuity` | `fixed` |
| `wf:r11:verify:push-branch-without-pr` | 11 | verify | minor | "each-commit pushes to the branch of a PR that a run without --pr does not have, and a new branch has no upstream" | `engine-stub-drift` | `fixed` |
| `wf:r11:verify:headrefname-scope-lexical` | 11 | verify | minor | "The headRefName scope check passes a sentence that names --pr anywhere, and headRefName with no backticks" | `engine-stub-drift` | `fixed` |
| `wf:r11:verify:ledger-reset-forms` | 11 | verify | minor | "The ledger reset scan misses the gate run, other word forms and a reset through a reference" | `ledger-continuity` | `fixed` |
| `wf:r11:verify:blob-scan-forms` | 11 | verify | minor | "The blob premise test reads English stderr, and the blob scan misses two other forms of the command" | `ledger-continuity` | `fixed` |
| `codex:r12-1` | 12 | codex | P1 | "Make the e2e hardening command portable" | `prerequisite-semantics` | `fixed` |
| `codex:r12-2` | 12 | codex | P2 | "Stop when local HEAD is ahead of the PR" | `clean-stop-criteria` | `fixed` |
| `codex:r12-3` | 12 | codex | P2 | "Map CONTEXT.md to the context map" | `flow-doc-register` | `fixed` |
| `codex:r12-4` | 12 | codex | P2 | "Exempt legal headers from the comment length limit" | `comment-keep-forms` | `fixed` |
| `codex:r12-5` | 12 | codex | P2 | "Make metrics execution conditional" | `fallback-key-contract` | `fixed` |
| `codex:r13-1` | 13 | codex | P1 | "Push fork PR fixes to the head repository" | `review-target-identity` | `fixed` |
| `wf:r13:verify:lessons-count` | 13 | verify | minor | "docs/review-lessons.md states a findings count in prose that drifts" | `restated-value` | `fixed` |
| `wf:r12:verify:context-map-check-test` | 12 | verify | minor | "A commit says that apply checks the context map path, but no test holds it" | `flow-doc-register` | `fixed` |
| `wf:r12:verify:domain-proceed-silently` | 12 | verify | minor | "The domain doc says to proceed silently when the glossary or the context map is missing" | `flow-doc-register` | `fixed` |
| `wf:r13:verify:profile-scan-overlays` | 13 | verify | minor | "The profile scans read only the top profile of each project, and skip the profile of a branch overlay" | `profile-scan-reach` | `fixed` |
| `wf:r12:verify:stub-null-block-test` | 12 | verify | minor | "No test holds the stub sentence that keeps a run with metrics: null from a stop on a missing metrics.command" | `fallback-key-contract` | `fixed` |
| `wf:r12:verify:goal-metrics-condition` | 12 | verify | major | "The /goal template asks for METRICS_EXIT 0 with no condition, so a run with metrics: null can never meet it" | `clean-stop-criteria` | `fixed` |
| `wf:r11:verify:ledger-resume` | 11 | verify | minor | "No text defines resume, and with carry_over false the preflight archives the ledger of a run that was cut off" | `ledger-continuity` | `fixed` |
| `wf:r13:verify:fork-checkout-by-name` | 13 | verify | minor | "The --pr lookup takes a checkout by the name of the head branch, so a PR from a fork with the head branch main runs in the local main checkout" | `review-target-identity` | `fixed` |
| `wf:r13:verify:playbook-fork-push` | 13 | verify | minor | "The create-pr and comments triage playbooks push a PR from a fork with no read of its head repository, and create-pr finds a PR by a branch name of any owner" | `review-target-identity` | `fixed` |
| `wf:r12:verify:license-header-forms` | 12 | verify | minor | "The hook denies a license header that blank lines split, and a license header with a line that a keep pattern matches" | `comment-keep-forms` | `fixed` |
| `wf:r10:verify:copied-from-beside-kept` | 10 | verify | minor | "A copied-from line beside a line that a keep pattern keeps gets no verdict, and the same line alone gets judge" | `comment-keep-forms` | `fixed` |
| `wf:r13:verify:dry-run-copy-worktrees` | 13 | verify | minor | "The apply dry run copies the whole product repo with its nested worktrees, so a dry run of globex took 30 minutes" | `apply-copy-scope` | `fixed` |
| `wf:r12:verify:platform-tool-any-test` | 12 | verify | major | "The platform tool guard passes any test for the tool, also a gate with no portable form, and any prerequisite that only names the tool" | `prerequisite-semantics` | `fixed` |
| `wf:r12:verify:platform-tool-apply-test` | 12 | verify | minor | "The platform tool check has no test through apply, and no test runs it over each profile under projects/, the profile of each branch overlay included" | `prerequisite-semantics` | `fixed` |
| `wf:r13:verify:profile-commit-label` | 13 | verify | minor | "The apply writer names a commit that changes only the hardening profile as a change of the review stub" | `managed-file-lifecycle` | `fixed` |
| `wf:r14:lesson:managed-line-citation` | 14 | other | minor | "An ADR of initech cited lines of files that apply writes, and each apply update moved those lines, so the PR needed 4 hardening runs" | `restated-value` | `fixed` |
| `wf:r12:verify:license-patterns-in-prose` | 12 | verify | major | "The wider license patterns run before every deny rule, so prose with one license-like line passes silently" | `comment-keep-forms` | `fixed` |
| `wf:r12:verify:license-header-mpl-isc` | 12 | verify | major | "The hook still blocks two common license headers, MPL-2.0 and a split ISC header" | `comment-keep-forms` | `fixed` |
| `wf:r12:verify:platform-tool-guard-scope` | 12 | verify | major | "One guarded if exempts the whole gate, so an unguarded lockf call in the same gate passes" | `prerequisite-semantics` | `fixed` |
| `wf:r11:verify:ledger-null-at-load` | 11 | verify | major | "No test holds the step that marks a run in progress, so the sentence that sets stopped to null at the load can go with every test green" | `ledger-continuity` | `fixed` |
| `wf:r12:verify:context-map-apply-test` | 12 | verify | major | "No test holds that apply runs domainProblems or fails on its result, so apply can only log a wrong context map with every test green" | `flow-doc-register` | `fixed` |
| `wf:r14:verify:line-citation-report-only` | 14 | verify | major | "No test covers the line citation check of the report-only path, which initech uses" | `restated-value` | `fixed` |
| `wf:r15:preflight:version-file-stop` | 15 | other | major | "Preflight step 8 stops a PR that changes only a dependency in package.json, because a workflow reads the bun version from that file" | `ci-job-coverage` | `fixed` |
| `wf:r16:ci-pins:node-property` | 16 | other | major | "An anchor or a tag before a key under with or inputs gives no key, so the scan misses a version-file input" | `ci-job-coverage` | `fixed` |
| `wf:r16:ci-pins:quoted-key-escape` | 16 | other | major | "The scan does not decode the escapes of a double-quoted key, so it misses a version-file input" | `ci-job-coverage` | `fixed` |
| `wf:r16:ci-pins:merge-key` | 16 | other | major | "The check of a merge key under with never runs, because the key pattern never matches the merge key" | `ci-job-coverage` | `fixed` |
| `wf:r16:ci-pins:reader-truthiness` | 16 | other | major | "The setup-node reader falls through on a field that is present but is not a string, where setup-node reads it by truthiness" | `ci-job-coverage` | `fixed` |
| `wf:r16:ci-pins:adversarial-round-1` | 16 | other | major | "An adversarial run finds 38 more YAML forms and reader paths that hide a CI tool version from the line scan" | `ci-job-coverage` | `fixed` |
| `wf:r17:ci-pins:adversarial-round-2` | 17 | other | major | "A second adversarial run finds 13 more ways to hide a CI tool version and 4 false stops, most of them in the line scan" | `ci-job-coverage` | `fixed` |
| `wf:r17:ci-pins:flow-inputs` | 17 | other | major | "An inputs block in flow style gives no defaults to the line scan, so a version file that a default names is missed" | `ci-job-coverage` | `fixed` |
| `wf:r17:ci-pins:pnpm-alias` | 17 | other | minor | "A pnpm-lock.yaml with many nested aliases makes the check crash with a stack trace" | `ci-job-coverage` | `fixed` |
| `wf:r18:watch-pr:stack-walk-cycle` | 18 | other | unrated | "The stack walk of watch-pr has no visited set, so a cycle of open PRs makes it loop forever" | `pr-graph-walk` | `fixed` |
| `wf:r18:watch-pr:stack-fork-identity` | 18 | other | unrated | "Stack discovery keys PRs by the head branch name only and takes PRs from forks, so a PR from a fork with a matching branch name joins the stack" | `review-target-identity` | `fixed` |
| `wf:r18:watch-pr:pretty-control-characters` | 18 | other | unrated | "renderPretty prints GitHub fields with their C0 and C1 control characters, so a crafted comment can send terminal escapes" | `terminal-control-text` | `fixed` |
