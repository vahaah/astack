# Review

## Launch the reviewers

The reviewers are the `pr-review-toolkit` agents. Launch them yourself, in parallel, with the Agent tool and `subagent_type: "pr-review-toolkit:<agent>"`. Tell each one to review `git -C <WORKTREE> diff <BASE_SHA>...<HEAD>`, with the path and both SHAs written out. A subagent can start in another directory, so a bare `git diff` can read another checkout.

Never run `/pr-review-toolkit:review-pr <base>`. That command takes review aspects such as `all`, `code` or `tests`, not a branch. It reads a branch name as an aspect. It also scopes itself from `git status` and `git diff`, which are empty on the clean tree that every iteration starts from.

Never launch `pr-review-toolkit:code-simplifier`. It edits code, and the fix fence forbids that.

`reviewers.select` picks the set:

- `applicable`: `code-reviewer` always. `pr-test-analyzer` when the diff changes tests. `silent-failure-hunter` when it changes error handling. `type-design-analyzer` when it adds or changes types. `comment-analyzer` when it adds or changes comments or docs. Only agents listed in `reviewers.agents` are candidates.
- `all`: every agent in `reviewers.agents`, every iteration.

Then run each entry of `reviewers.extra` whose `when` applies, as its `invoke` says.

If a configured reviewer cannot be launched, stop with principled incompletion and name it. Never substitute another reviewer without the user's approval.

## Additional astack reviewers

Two `reviewers.extra` entries fit most repos. Add them to the profile, never on the fly.

- `astack:code-review` reviews `<BASE_SHA>...HEAD` on two axes: Standards, against the repo's rules and `astack:coding-rules`, and Spec, against the ticket the branch delivers. It is model-invocable, so `invoke` names the Skill tool and the base branch as its fixed point. Its two reports stay separate. Each finding is a candidate like any reviewer's, and it counts only after you reproduce it. It reviews committed work only, which matches the clean tree every iteration starts from.
- `astack:interrogate` sends one reviewer per configured model, from more than one model family, to attack the diff. It sets `disable-model-invocation`, so `invoke` says to read its SKILL.md through `astack skill-path astack:interrogate`. Its Act on findings are candidates. Consider, Noted and Dismissed findings never block. It costs more than the default set, so use it only for some PRs. They are a PR that changes a public API, as `astack:coding-rules` defines it, and a PR that adds or edits a database migration. A PR that adds a dependency between workspace packages also gets it.

## Tell each reviewer

Every reviewer prompt carries:

- `WORKTREE` as an absolute path, `BASE_SHA`, the head SHA and the exact diff command, `git -C <WORKTREE> diff <BASE_SHA>...<HEAD>`;
- the paths in `reviewers.checklists`, with their `use`, to apply as checklists;
- the absolute path of the review checklist `references/checklist.md`, with the rule that a question applies only when the diff changes its area;
- the blocking rules below;
- the ledger's `fixed` and `advisory` entries, so they are not raised again unless the code they name changed;
- in mode `ci_proof`, that the gates mirror the CI of the base, so only the review examines the CI files before CI runs. `astack check ci-pins` does not read a tool that a `run` step or a script installs, so a change to such an install is a blocking finding;
- every line of `reviewers.notes`.

Sort the outputs into blocking candidates and suggestions by the labels in "Which findings block". Keep each reviewer's text unmodified under its name.

## Checklist pass

After the reviewers return, read each file in `reviewers.checklists` and check the diff against the part its `use` names. A concrete violation the reviewers missed is a candidate with source `checklist`.

Then go through the review checklist, `references/checklist.md`. Ask the question of each item whose area the diff changes. A concrete failure that the reviewers missed is a candidate with source `checklist` too. Record the class of each candidate in its ledger entry.

A checklist item, or a reviewer request, that demands a comment the keep list does not cover is not a finding. The comment gate decides comments. Record each such item under comment-rule conflicts in the final report.

## comment-analyzer

A request to add, expand or document a comment is advisory. A report that a comment states something false about the code is real. Fix it by deleting the comment, or by correcting it when it is a keep.

## Which findings block

A finding is a blocking candidate when its reviewer label is Critical, Blocker, High or Important. A `normal` label is the same when the reviewer's machine output uses it to mean Important. A finding with an unclear label is a candidate until you triage it. Nit, Style, Suggestion, Pre-existing, Advisory and Informational do not block, unless the finding shows a gate failure.

A checklist violation and a confirmed review-bot thread are candidates too, whatever their label.

A candidate blocks only when its reproduction shows a concrete failure that the PR introduces:

- a deterministic gate that fails or would fail;
- a contract, ADR or documented repo rule that the code breaks;
- behaviour the PR adds with no test that fails when that behaviour is removed;
- a security or correctness defect, with an input that triggers it;
- a doc or comment sentence that states something false about the code.

A bug fix with no cheap, correct test seam can still pass without a test, as `astack:coding-rules` says. It does not block when the PR's Verification links its failing script or saved transcript. It also does not block when the Verification states the outcome of that run. It shows the failing run first, then the passing run. It blocks again when the reproduction shows such a seam, such as a test that fails on the base commit and passes on the head.

These never block: wording preferences, completeness wishes, docs that are true but could say more, refactors, style, nits, and problems the PR did not introduce. A reviewer's severity is a claim. A fixer never promotes a suggestion to blocking.

With `test_adequacy: control-per-clause`, a contract clause is covered when at least one planted control fails if the clause's code is removed. The PR's coverage matrix must also name that control. Another input for a covered clause, such as another file extension, casing or character, is a suggestion. It becomes a correctness finding only when the code special-cases that input, and then it needs the triggering input. A missing test blocks only when a clause has no covering control.

Mark a candidate advisory only when one of these holds, and record which:

1. The exact reproduction fails on re-run.
2. It names code that is no longer there.
3. It contradicts a green gate and no concrete failing path can be shown.
4. It is pre-existing and this PR did not introduce it.

Never mark a finding advisory because it is hard to fix. A finding whose fix needs a file outside the fix fence is `out-of-scope` and ends the run in principled incompletion.

## Reproduce before it counts

For each candidate, write down the reproduction. It is a command, a test, an input, or the exact lines and the path through them. Run it when it can run. Print the command and its output.

## The ledger

Keep one ledger per branch at `$(git rev-parse --git-common-dir)/pr-review-hardening/<branch>.json`, with each `/` in the branch name replaced by `-`. It sits inside git's own directory, so it is never committed, every worktree of the clone shares it, and it survives the session. Write an entry the moment you create or change it, so a run that is cut off can resume. The ledger also holds `stopped`, the decision of the last run on the branch. It is `null` until that run stops. A ledger with no `stopped` key comes from a run that stopped. The ledger also holds `mode`, the mode of the last CI check of the run, `standard` or `ci_proof`.

Each entry holds:

- `id`, `iteration` and `source` (the reviewer's name, `checklist`, `comment-gate`, `gate`, `thread` or `prepass`);
- `severity` as claimed, `file` and `line`;
- `class`, the id of the item of `references/checklist.md` that the finding fits, or `none`;
- `claim`, one line, and `claim_hash`, the SHA-256 of the reviewer's text with whitespace collapsed;
- `reproduction` and its result;
- `status`: `open`, `fixed`, `advisory`, `out-of-scope` or `recurring`, with the `reason`;
- `commits`, the SHAs of the finding's commits, in order;
- `blob`, from `git rev-parse HEAD:<file>` when the entry was last decided. When `git rev-parse HEAD:<file>` fails because `HEAD` holds no such file, such as a file that the branch deletes, the blob is `deleted`.

Print the entries this iteration touched as `FINDING_LEDGER`.

The preflight loads the ledger once per run, before the prepasses. A ledger whose `stopped` is `null` comes from a run that was cut off, so this run resumes it, whatever `ledger.carry_over` says. A resumed run keeps each entry, and its first iteration is the one after the highest `iteration` of the entries. So each id stays unique, and `iterations.max` bounds both runs. Otherwise, with `ledger.carry_over: true`, a new run starts from the existing ledger. An entry that is `fixed` or `advisory` there is not raised again unless its file's blob has changed since. With `false`, rename an existing ledger to `<branch>.<UTC timestamp>.json` and start empty. Each run sets `stopped` to `null` at this load, and to its decision when it stops.

A finding recurs when, after one fix attempt, a new candidate matches a `fixed` entry's `claim_hash`. It also recurs when the candidate names the same file with a materially similar claim. Mark it `recurring` and stop the run.

## Review-bot threads

With `threads.answer: true`, every review-bot thread on the PR gets an answer before merge. Fix it and resolve it, or refute it with the reproduction and resolve it. A thread whose claim reproduces is a finding like any other. A thread on a file that astack writes is fixed in the astack repo, as "Files that astack writes" in `references/fix.md` says. A thread that only re-raises a ledger entry does not make the iteration unclean. Never resolve a thread without a fix or a reply.

## Prepasses

Prepasses run once, after preflight and before the baseline. Their commits are findings `P.<k>`.

- `contract-coverage`: build a clause-to-control matrix over the specs in `sources`. Plant a control for every uncovered clause. Check each control by removing the line that implements its clause, seeing the control fail, and restoring the line. Commit the controls and the matrix. Hardening starts from that matrix.
- `claims-audit`: split the factual sentences that the diff adds to docs and comments by area. Give each area to one read-only auditor, which compares every sentence with the code or a run. Each false sentence is a finding. Fix it by cutting it back to what the code or a test proves.
