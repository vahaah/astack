# Session guard requirements

[ADR 0009](../adr/0009-astack-adopts-tstack-as-a-frozen-upstream.md) D3 and D4 govern the tstack skills and the "full send" merge grant.
[ADR 0010](../adr/0010-session-guards-skip-scratch-writes-and-deny-broad-work-loss.md) governs scratch writes, commit checks, work loss and attended detection.
The [design](../design.md) gives the hook behavior in full.

## Acceptance criteria

- [criterion:SG-merge-grant] A merge needs a grant. A grant comes from `merge.authority` or `merge.standingBases` of the repo profile, or from a person's prompt in the current turn. That prompt has an un-negated merge word or "full send" clause.
- [criterion:SG-full-stop] A "full stop" clause and a negated merge or "full send" clause give no grant. The full-stop procedure never merges.
- [criterion:SG-unattended] In an unattended session, a prompt with no source field gives no grant. The merge denial and `astack doctor` name the variable that makes the session unattended.
- [criterion:SG-scratch] The type, comment and doc STE hooks skip a write or an edit only when its file is a scratch file.
- [criterion:SG-commit-surface] The comment and type hooks examine each path that a commit includes, also a scratch file.
- [criterion:SG-work-loss] The destructive hook denies a git command that discards uncommitted work in the whole tree or in a folder. Each denial names work that git discards.
- [criterion:SG-generated] Each generated file and each bundle of the CLI equals a fresh build of its source.
- [criterion:SG-runtime] `bin/astack` runs the first runtime that it finds, with bun before node, and probes no version before a run. Below node 22, a hook exits 0 with one line on stderr, and each other command exits 1.
- [criterion:SG-preserve] A change to a skill, a doc or another command leaves the verdicts of the session guards unchanged.

## Claim boundary

The model covers a finite set of prompts, paths, changes and git commands.
It takes the observations of the hooks as true.
The implementation controls examine the clause grammar, the shell parser and the git status reader.
The full-stop rule that a session never merges is a procedure in the skill text.
The merge guard enforces only the grant part of that rule.
