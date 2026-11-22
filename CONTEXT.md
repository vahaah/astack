# Astack delivery assurance

This context governs evidence and admission for engineering changes.
Product contexts keep their own terms, code, and decisions.

## Language

### ChangeProof

A contract that links one candidate change to its domain, composition, decisions, formal model, and implementation controls.
_Avoid_: Reasoning transcript, proof receipt
_Code_: `src/astack/change-proof/`

### Proof admission

The decision that the required artifacts and current model controls satisfy the delivery contract.
It does not establish every property of the implementation.
_Avoid_: Code correctness certificate

### Candidate inputs

The current source, configuration, model closure, and contract that a proof run binds together.
_Avoid_: Last successful commit

### Manifest base

The fixed commit that a ChangeProof names in its `base` field.
Ratification history stays bound to it. It must be an ancestor of the diff base.
_Avoid_: Current main tip
_Code_: `ProofBase.manifest`

### Diff base

The commit that the scope check and the input snapshots read from.
With a `--base` ref, it is the merge base of that ref and HEAD. Without a ref, it is the manifest base.
_Avoid_: Pinned base
_Code_: `ProofBase.diff`

### Model control

A fresh positive model run or a named mutation that must produce its expected violation.
_Avoid_: Any failed command

### Proof rung

The level of evidence that the changed paths and the profile floor give a ChangeProof, from R0 to R4.
Only R4 runs TLC. A pull request cannot lower the floor of its diff base.
_Avoid_: Proof level that the author picks, skip flag
_Code_: `deriveLadder`

### Model registry

The file `formal/models.json`, which maps each path to its models, a fail-closed stop, an unmodelled control or a contract-only rung.
_Avoid_: Model list in the profile, verdict cache
_Code_: `ModelRegistry`

### Composition record

The declared objects, typed arrows, effects, equality, laws, and witnesses for a candidate change.
_Avoid_: Private reasoning

### Abstraction relation

The mapping between a concrete contract or implementation action and its selected model representation.
_Avoid_: Same name means same behavior

### Implementation control

A test or probe that checks an observable implementation contract.
_Avoid_: Model result

### Law control

An implementation control that examines a claimed law on the real function with generated inputs.
A manifest cites it as the witness of the law.
_Avoid_: Model law, sample loop
_Code_: `tests/property/`

### ReviewRun

A bounded review whose ledger owns findings, recurrence, and iteration use.
Its fixed growth record survives resumes and later runs.
_Avoid_: Proof admission

### Effective decision

A current accepted ADR decision or a ratified proposal with checked authority and history.
Its history remains available after a later ADR replaces it.
_Avoid_: Deleted decision

### Ratified proposal

A Proposed ADR integrated under a ratification process before the fixed implementation base.
Its governing authority remains bound to that integrated record.
Its status does not claim completed implementation.
_Avoid_: New self-approved proposal
_Code_: `AdrRatification`

### Landing metadata

A factual lifecycle value whose permitted change leaves decision authority unchanged.
Its selected Accepted process defines that duty.
_Avoid_: Mutable decision authority
_Code_: `AdrRatification.governingMetadata`

### Ratification process

An accepted decision that defines when an integrated proposal has authority for implementation.
Review must examine its meaning and the actual owner grant.
Git history alone cannot establish that grant.
_Avoid_: Automatic approval from ancestry

### CI proof record

A separate current proof explanation used beside a CI change.
It supplies no authority, implementation, model, or control input.
_Avoid_: Arbitrary formal document
_Code_: `ciProofRecords`

### Session guard

A hook handler that judges one tool call or prompt of an agent session and returns one verdict.
A deny of one guard stays a deny when the dispatcher joins the verdicts of all guards.
_Avoid_: Linter, advisory check
_Code_: `Handler`

### Merge grant

The PRs that an agent can merge with no new question to the owner.
It comes from the base branch authority of the PR.
It also comes from merge words or an un-negated "full send" clause in a person's prompt of the current turn.
_Avoid_: Approval, green light
_Code_: `MergeGrant`

### Base branch authority

The merge keys of `.astack/profile.json` at the tip of the base branch of a PR, read with the PR.
An absent or unreadable file gives turn authority. A working-tree edit gives nothing.
_Avoid_: Local profile, working-tree grant
_Code_: `BaseAuthority`

### Harness frame

A tag, or a bracket label that is not a Markdown link, at the start of a prompt that a host relays.
A framed prompt is never a person's prompt, unless the host marks it with the source `user`.
_Avoid_: Wrapper text, system prompt
_Code_: `humanPrompt`

### Unattended session

A session that the host starts with `CLAUDE_CODE_SESSION_ATTENDED=0` or with an `sdk` entrypoint.
A prompt with no source field in such a session is not a person's prompt.
_Avoid_: Background mode, headless override
_Code_: `unattendedReason`

### Scratch file

A file outside the project with no `.git` or `.astack/profile.json` at or above it, or a file in the OS temp folder outside the project.
The write-time quality hooks skip it. A commit of it keeps every check.
_Avoid_: Ignored file, temp file
_Code_: `isScratchPath`

### Work-loss command

A git command that discards uncommitted work that `git status` shows in the whole tree or in a folder.
It is an owner gate.
_Avoid_: Destructive command, cleanup
_Code_: `workLossReasons`

### Plain form

The command that a shell step runs, after astack drops reserved words and braces and unwraps a known wrapper or a static shell body.
A step that a variable hides is unreadable.
_Avoid_: Normalized command, raw command
_Code_: `shellSteps`

### Hook skip

A git commit or push that runs without the git hooks of the repo.
It is `--no-verify`, `HUSKY=0`, `LEFTHOOK=0` or a `core.hooksPath` folder where HEAD does not hold each active hook as an executable file. A `core.hooksPath` with a `..` segment or a symlink is a hook skip too.
_Avoid_: Bypass, quiet push
_Code_: `skipForm`

### Gate record

The record that `astack gates run` writes in the state folder when each gate that applies exits 0 at a clean HEAD.
A hook-skip push of a recorded source passes.
_Avoid_: Green stamp, gate cache
_Code_: `GateRecord`

### Skill word budget

The cap on the `*.md` words of each skill tree and on their total, in `scripts/lib/budget.json`.
`bun run budget` fails when a skill or the total passes its cap.
_Avoid_: Size limit, token budget
_Code_: `budgetReport`

### Installed copy

A skill folder that an install or a build wrote, such as a plugin cache or `dist/`.
An agent reads it, but never edits it, because the next install or build replaces it.
_Avoid_: Plugin copy, local skill
_Code_: `marketplace/plugins/astack/skills/reflect/SKILL.md`

### Source checkout

A git work tree that tracks a skill, outside an installed copy and the apply `managed` list.
An accepted skill edit goes there. With no source checkout, the edit goes to Backlog.
_Avoid_: Source copy, repo copy
_Code_: `marketplace/plugins/astack/skills/reflect/SKILL.md`

### Finding event

One JSON line in the `events.jsonl` file of a session folder for one STE or comment finding of a hook.
It holds the rule, the surface, the outcome and a fingerprint, and no sentence, comment or path.
_Avoid_: Fire log, telemetry record
_Code_: `FindingEvent`

### Zero-use part

A skill, agent, command or module with no measured use in 30 days and no live dependent.
A live dependent is code, a route, a test or an accepted ADR that needs the part.
_Avoid_: Unused code, dead skill

### Session boundary

The plan edits that follow the merge of a `now` session PR. They run once and commit first on the next session branch.
The last session PR carries the close and deletes the plan.
_Avoid_: Plan sync, plan-only PR
_Code_: `marketplace/plugins/astack/skills/plan/references/upkeep.md`

### Graduated row

A decision row that shrinks to `Graduated to ADR NNNN Dm` when that ADR heading resolves.
It leaves the live rows, and its handle never becomes live again.
_Avoid_: Deleted row
_Code_: `Retirement`

### Plan state folder

The folder `astack/plans/<slug>/` in the git common dir of a plan. It holds the trail, the drafts and the session records.
A plan path finds it from any folder.
_Avoid_: Plan cache
_Code_: `planStateFor`

### Codex hook trust

The trust status that Codex reports for one hook in its `hooks/list` reply: `trusted`, `managed`, `modified` or `untrusted`.
Codex binds it to the hook hash and to a content hash that changes in each release, so a pinned hook hash proves no trust.
_Avoid_: Trusted hash, pin match
_Code_: `CodexHooksRead`

### Hardening profile rule

A rule that a review profile must pass before a hardening run loads it.
Apply, `astack check hardening-profile` and doctor read one list of these rules, and each problem has a repair.
_Avoid_: Profile lint, profile schema
_Code_: `reviewProfileProblems`

### Fixture template

A git repo, or a folder of repos, that a heavy test file builds once and copies for each test.
Each copy points its git config at itself, so a write in a copy never reaches the template or another copy.
_Avoid_: Shared repo, golden repo
_Code_: `buildTemplate`

### Waiting item

A call that only the owner can take.
Examples are a green PR with no merge grant, an open question, a draft finding and an owner gate.
A status ask lists each waiting item on its own line. A checkpoint reply names up to 3 and gives their count past 3.
_Avoid_: Pending call, owner todo
_Code_: `marketplace/plugins/astack/skills/mode/references/resume.md`

### Head check

The run of `astack check pr-head` before a text acts on a PR.
A text goes on only after exit 0 with an `ok:` last line, or exit 3 with a `no_pr:` last line.
After `stop: HEAD does not hold PR_HEAD`, the one next step is a pull of the PR branch and a second run.
Each other result stops the text.
_Avoid_: Manual head check, head compare
_Code_: `src/astack/cli/commands/check/pr-head.ts`
