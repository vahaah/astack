# Changelog

## 0.4.0

This release makes each code plan name its side effects, and checks compare that record with the code. Proof now scales with risk, the merge guard takes authority only from the owner, and the full check ends in about 40 s.

### Domain and effects record

- Each plan that names a code path holds one `## Domain and effects` section with one `domain` fence. The fence names the context, the aggregates, the invariants, each capability and each step as `A -> Eff<R, E, B>`. ADR 0018 records the record.
- `astack check-plan` parses the fence and checks names, flows, laws and the rung. A tsc witness compares each linked step with its code.
- `astack check effects` compares the effect classes of each module with the contexts card in `CONTEXT.md` and the plan record. It gives advice today, and a later release makes it fail.
- `Result` gets `map`, `andThen` and `all`. Each claimed law runs as a property test on code, as ADR 0017 says.
- One ADR template holds a domain part and an effects part. `astack check adr` keeps accepted ADR text amend-only.

### Change proof

- Each change carries its own manifest under `.astack/proof/`, as ADR 0016 says.
- The touched paths and the laws give the rung from R0 to R4. Only R4 runs TLC, and only for the models of `formal/models.json` that the paths select. A docs-only diff runs no TLC.
- Each proof stop names its cause and the section of its rule.
- A conformance test drives the real guards from the SessionGuards model table, and fast-check commands drive them beside the model.

### Guards

- A merge needs a grant from a person's prompt of this turn or the profile on the PR base branch. A harness brief, a working-tree profile edit and an MCP merge tool give none.
- A wrapped command gets the verdict of its plain form. A hook skip needs a HEAD whose gates passed with `astack gates run`.
- A broad discard passes in a repo or worktree that this session made.
- Public issue and PR text passes the deny list of the profile.
- A hook reads a body file as its command leaves it, and a denied chain says that nothing ran.
- The guards stop agent mistakes. Branch protection is the control for a hostile agent.

### Review, plan and text

- Each PR has one review record. A fix after a clean head gets a delta review.
- A plan boundary rides in the next session PR, so a session opens no plan-only PR.
- Wrapper skills fold into their homes. Skill text falls to 115,811 words, and a word budget stops each cap from rising.
- `astack doctor` reports the hook trust that Codex enforces and a drifted review profile.
- The repo review stub holds one install line and no engine copy.

### Speed

- `bun run check` runs biome and tsc first, the proof once and the suite in parallel. It ends in about 40 s.
- `bun run check:fast` gives a short answer while you work.
- CI runs Check on a push to main and on each pull request.

### Upgrade

- Move the proof manifest of an open PR to `.astack/proof/<change>.json`, and pass `--base origin/<base>` to the proof in CI.
- Drop the `comments` key from each companion project profile, because apply now refuses it. Then run `apply --update` in each product repo.
- A code plan in a repo with a contexts card needs its `domain` fence. Run `astack check-plan --template=domain` for the grammar.
- Turn on branch protection for each base branch that grants standing merge authority.

## 0.3.0

This release keeps the proof of a PR valid when main moves, when the proof run gets `--base`. It also cuts the parts with no measured use and adds a word budget for skill text.

### Change proof

- With `--base <ref>`, `astack check proof` diffs from the merge base of the ref and HEAD. The manifest `base` can be older, but it must be an ancestor of that merge base. So a merge to main does not make the proof of an open PR stale. ADR 0012 records the rule.
- A manifest base that is not an ancestor stops the proof, and the stop names both commits. The receipt prints the manifest base and the diff base.
- `astack check ci-pins` applies the same ancestor rule to the CI proof records.
- Each base read and each diff read ignores replace objects and grafts.
- A move of main that changes the authority of a ratified ADR stops the proof. The stop names the ADR, both commits and the repair.
- In the CI of this repo, `scripts/check-proof.ts` passes a base on each push and release run too. A branch push whose event payload has no default branch fails.
- The proof contract names the base of each CI run. The refresh playbook and the modernize skill do not set the manifest base by hand.
- The `change-proof` gate of the profile template and of the example companion passes `--base origin/<base>`.

### Upgrade

- Pass the base branch to the proof in the CI job and in the `change-proof` gate. An example is `astack check proof --base origin/main`. Without `--base`, the diff still starts at the manifest base. Then a merge of main puts the paths of main in scope.
- Do not move the manifest base after a merge of main.

### Removed parts

ADR 0013 records the keep rule. A part stays only with measured use or a live dependent. Each part below had 0 use in 30 days, or no caller.

- The skills `wait-what`, `wizard`, `blast-radius`, `correct`, `create-verification-skill`, `maintain-verification-skill`, `to-spec`, `to-questionnaire`, `implement`, `implement-spec` and `triage`. Each route that named one points to its successor. The plugin now holds 50 skills.
- The `researcher` agent. The research skill starts a background general-purpose agent with the same brief.
- `astack orch`. Its store data on disk stays.
- `astack plan move` and `astack plan import`. `astack plan export`, `drift` and `keys` stay.
- The agent-stack migration module and `docs/migration.md`. `apply --global --dry-run` prints the plan and the verify part only.
- The hook tools `codex` and `grok-build`. Codex and Grok Build run `astack hook claude-code`.
- The read of a string-only problems record in the Cursor stop hook. No astack revision wrote that record.

### Word budget

- `bun run budget` counts the words of the Markdown files in each skill tree. It fails when a skill or the total passes its cap in `scripts/lib/budget.json`, and it names that skill. `bun run check` runs it.
- A cap rises only in a PR that moves text into that skill while the total falls by more. Review enforces that rule.

### Other changes

- The duplicate-skill report names the route successor of each cut skill. It never calls a cut skill superseded.
- `bun run validate` prints a labelled SKIP when `claude` is not on PATH. `bun run dist` prints SKIP, not PASS, for a probe that did not run.
- The README opens with a short description of astack.

## 0.2.0

This release adds the tstack skills and the lessons from an analysis of approximately 3,000 agent sessions.

### New skills from tstack

- `babysit-pr`, `file-pr`, `leaving-pr-comments`, `modernize` and `takeover` run the existing astack playbooks, with the tstack rules that astack did not have.
- `council`, `full-send`, `full-stop` and `sol-loop` are user-only skills. `council` and `sol-loop` take their seats from new `setup-models` roles.
- A typed "full send" is a merge grant for that prompt. "full stop" never is. ADR 0009 records the adoption and these rules.
- `upstream/tstack` holds the frozen snapshot, and `NOTICE` holds its MIT notice.

### Hooks

- The type, comment and doc STE write checks skip a scratch file outside the project with no git work tree or astack profile above it. Commit, PR and ticket checks do not change.
- The destructive guard denies git commands that discard uncommitted work, such as `git reset --hard` or `git checkout -- .` on a dirty tree.
- The merge denial says when a session is unattended and names the setting that made it so. `astack doctor` and the session-start note name it too.
- The plan-file hook notes only the findings that an edit adds.
- The type hook allows the Effect 4 service class helpers, and its message lists a limited number of files.
- Fewer STE false positives for a sentence-final noun, "could not" and a field label with a digit.

### CLI

- Each command and check prints its usage on `--help`.
- `check pr` notes a PR body over 40 lines.
- `skill-path` exits 3 and lists the folder when an installed skill does not hold the file.
- `check proof` names every scope gap and spec-drift finding in one stop.
- `check-plan` resolves a plan outside the repo against the repo of the run.

### Skills and playbooks

- New fork-sync playbook. Shipping reads what a merge starts, examines the base before the merge, follows a release to its end and settles the local state.
- The STE pre-check is a step before each commit message, ticket and PR text.
- Owner calls go in one round with one format in grilling and plan.
- Clearer rules for isolated agents, PR waits, standing orders, loop limits and hardening fixes.
- README has update steps for each client.

## 0.1.0

First public release.

- Skills, shared rules and hooks for the path from a goal to a merged pull request.
- Builds for Claude Code, Codex, Cursor, Grok Build, Grok Bot and other Agent Skills clients.
- CLI checks include `pr-head`, `review-growth`, `spec-drift`, `ci-pins` and `proof`.
- `change-proof` is a mandatory gate on `apply`. A repo that already uses astack needs `.astack/proof.json`, a TLA+ model and a governing ADR before that gate will pass. Follow the [migration guide](docs/runbooks/change-proof-migration.md) in one adoption pull request first.
