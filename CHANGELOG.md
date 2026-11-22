# Changelog

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
