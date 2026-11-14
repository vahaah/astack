# Changelog

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
