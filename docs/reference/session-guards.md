# Session guard requirements

[ADR 0009](../adr/0009-astack-adopts-tstack-as-a-frozen-upstream.md) D3 and D4 govern the tstack skills and the "full send" merge grant.
[ADR 0010](../adr/0010-session-guards-skip-scratch-writes-and-deny-broad-work-loss.md) governs scratch writes, commit checks, work loss and attended detection.
[ADR 0011](../adr/0011-merge-authority-comes-from-the-owner-and-the-base-branch.md) governs base branch authority, harness frames, MCP merges and guard errors.
The [design](../design.md) gives the hook behavior in full.

## Acceptance criteria

- [criterion:SG-merge-grant] A merge needs a grant. A grant comes from `merge.authority` or `merge.standingBases` of the profile on the PR base branch, or from a person's prompt in the current turn. That prompt has an un-negated merge word or "full send" clause.
- [criterion:SG-base-authority] The standing grant and `merge.requireChecks` come only from `.astack/profile.json` at the tip of the PR base branch. An absent or unreadable file gives turn authority. A working-tree edit changes no merge verdict, and a standing profile covers only the PRs of its repo.
- [criterion:SG-framed-prompt] A prompt that opens with a tag, or with a bracket label that is not a Markdown link, gives no grant. A host `source` of `user` still counts. A Cursor prompt gives a grant only in an attended session.
- [criterion:SG-mcp-merge] Each MCP tool with a merge word in the server name or the tool name gets a deny, also with a grant. A state word such as `merged` passes only with a read verb and no write verb. A read tool on a merge request, such as `list_merge_requests`, passes. An MCP input that holds a `gh pr merge` command or a `gh api` merge gets a deny too.
- [criterion:SG-guard-error] An error of the merge guard on a merge command or an MCP merge tool gives a deny that names the error. Each other handler fails open.
- [criterion:SG-full-stop] A "full stop" clause and a negated merge or "full send" clause give no grant. The full-stop procedure never merges.
- [criterion:SG-unattended] In an unattended session, a prompt with no source field gives no grant. The merge denial and `astack doctor` name the variable that makes the session unattended.
- [criterion:SG-scratch] The type, comment and doc STE hooks skip a write or an edit only when its file is a scratch file.
- [criterion:SG-commit-surface] The comment and type hooks examine each path that a commit includes, also a scratch file.
- [criterion:SG-work-loss] The destructive hook denies a git command that discards uncommitted work in the whole tree or in a folder. Each denial names work that git discards.
- [criterion:SG-generated] Each generated file and each bundle of the CLI equals a fresh build of its source.
- [criterion:SG-preserve] A change to a skill, a doc or another command leaves the verdicts of the session guards unchanged.

## Claim boundary

The model covers a finite set of prompts, paths, changes and git commands.
It takes the observations of the hooks as true.
The implementation controls examine the clause grammar, the shell parser and the git status reader.
The full-stop rule that a session never merges is a procedure in the skill text.
The merge guard enforces only the grant part of that rule.
