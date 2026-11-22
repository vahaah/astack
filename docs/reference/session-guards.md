# Session guard requirements

[ADR 0009](../adr/0009-astack-adopts-tstack-as-a-frozen-upstream.md) D3 and D4 govern the tstack skills and the "full send" merge grant.
[ADR 0010](../adr/0010-session-guards-skip-scratch-writes-and-deny-broad-work-loss.md) governs scratch writes, commit checks, work loss and attended detection.
[ADR 0011](../adr/0011-merge-authority-comes-from-the-owner-and-the-base-branch.md) governs base branch authority, harness frames, MCP merges and guard errors.
The [design](../design.md) gives the hook behavior in full.

## Acceptance criteria

- [criterion:SG-merge-grant] A merge needs a grant. A grant comes from `merge.authority` or `merge.standingBases` of the profile on the PR base branch, or from a person's prompt in the current turn. That prompt has an un-negated merge word or "full send" clause.
- [criterion:SG-base-authority] The standing grant and `merge.requireChecks` come only from `.astack/profile.json` at the tip of the PR base branch. An absent or unreadable file gives turn authority. A working-tree edit changes no merge verdict, and a standing profile covers only the PRs of its repo.
- [criterion:SG-framed-prompt] A prompt that opens with a tag, or with a bracket label that is not a Markdown link, gives no grant. A host `source` of `user` still counts. A Cursor prompt gives a grant only in an attended session.
- [criterion:SG-mcp-merge] Each MCP tool with a merge word in the server name or the tool name gets a deny, also with a grant. A state word such as `merged` passes only with a read verb and no write verb. A read tool on a merge request, such as `list_merge_requests`, passes. An MCP input that holds a `gh pr merge` command or a `gh api` merge gets a deny too. So does a click tool whose input names a merge button.
- [criterion:SG-guard-error] An error of the merge guard on a merge command or an MCP merge tool gives a deny that names the error. Each other handler fails open.
- [criterion:SG-full-stop] A "full stop" clause and a negated merge or "full send" clause give no grant. The full-stop procedure never merges.
- [criterion:SG-unattended] In an unattended session, a prompt with no source field gives no grant. The merge denial and `astack doctor` name the variable that makes the session unattended. A prompt with the source `user` gets the attended note.
- [criterion:SG-scratch] The type, comment and doc STE hooks skip a write or an edit only when its file is a scratch file.
- [criterion:SG-commit-surface] The comment and type hooks examine each path that a commit includes, also a scratch file.
- [criterion:SG-work-loss] The destructive hook denies a git command that discards uncommitted work in the whole tree or in a folder. Each denial names work that git discards. `git apply -R` from stdin, `git read-tree -u --reset`, `git checkout-index -a -f` and `git archive` piped to `tar -x` are such commands.
- [criterion:SG-plain-form] The merge guard and the destructive guard judge the plain form of each shell step. A known wrapper, a brace group, an `if` and a static `sh -c`, `eval` or substitution body give the verdict of the plain command.
- [criterion:SG-dynamic-word] A guarded verb that a variable or a substitution hides is unreadable. An unreadable work-loss command gets a deny on a changed tree when astack can read its folder. Each other unreadable guarded verb gets a deny at once.
- [criterion:SG-api-merge] Each `gh api` merge of a PR gets a deny. A GraphQL body with a merge mutation or a dynamic field gets a deny. So does a body from a pipe or a file that the hook cannot read. A write call to an endpoint that a variable gives gets a deny too.
- [criterion:SG-hook-skip] `--no-verify`, `HUSKY=0`, `LEFTHOOK=0` and a `core.hooksPath` folder that holds no tracked hook file skip the git hooks. Each hook skip on a commit, a push or a config write gets the owner gate.
- [criterion:SG-gates-run] `astack gates run` records HEAD only when each gate that applies exits 0 on a clean tree. A hook-skip push of a recorded source passes.
- [criterion:SG-generated] Each generated file and each bundle of the CLI equals a fresh build of its source.
- [criterion:SG-runtime] `bin/astack` runs the first runtime that it finds, with bun before node, and probes no version before a run. Below node 22, a hook exits 0 with one line on stderr, and each other command exits 1.
- [criterion:SG-preserve] A change to a skill, a doc or another command leaves the verdicts of the session guards unchanged.

## Claim boundary

The model covers a finite set of prompts, paths, changes and git commands.
It takes the observations of the hooks as true.
The implementation controls examine the clause grammar, the shell parser and the git status reader.
The model takes the plain form of each shell step as given. A property test checks the wrapper law of the parser.
The full-stop rule that a session never merges is a procedure in the skill text.
The merge guard enforces only the grant part of that rule.
