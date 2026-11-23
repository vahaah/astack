# Outbound guard requirements

[ADR 0034](../adr/0034-public-github-text-passes-the-deny-list.md) governs the outbound deny list, the outbound guard and the one-PR rule of a session.
[ADR 0011](../adr/0011-merge-authority-comes-from-the-owner-and-the-base-branch.md) D6 says that the guards stop agent mistakes.
The [design](../design.md) gives the hook behavior in full.

## Acceptance criteria

- [criterion:OB-public-text] Given a state copy of the list, each public GitHub text write with a listed name gets the deny-list deny. The forms are gh issue and PR creates, comments, edits, reviews, close and reopen comments, and merge subjects and bodies. Release, gist and repo creates and edits count too, and so does each `gh api` call that is not a GET. GitHub MCP write tools and host MCP issue tools count too. The reason names only the hash prefix and holds no text line.
- [criterion:OB-mcp-fields] Each string at each depth of the input of an MCP write tool is a text.
- [criterion:OB-private-pass] An issue to a private repo, a clean text, `--body "$TEXT"`, a Linear `save_issue`, `gh issue list` and a private comment get no deny-list deny.
- [criterion:OB-fail-closed] A bad line in the copy, an unread visibility on a hit and a throw of the handler deny each GitHub text write. A body from piped stdin or a variable file denies too. No copy gives no check.
- [criterion:OB-sync] `bun run deny add` and `bun run deny sync` with a companion of the owner write its hashes to the state copy. Both refuse the example companion.
- [criterion:SP-second-pr] After a first create of one session, a create of another head to the same root, repo and base gets the one-PR deny. So do a host MCP create and a `Part of` link to the open PR from another session.
- [criterion:SP-allowed] A stacked base and a split instruction in the last person's prompt pass. A second worktree and a `Part of` link to a closed PR pass too. So does a create after a failed create of a new session.
- [criterion:SP-no-session] A create with no session id passes and saves no record. A denied create saves no record.

## Claim boundary

The guard stops an agent mistake. It is no boundary against a hostile agent, which can hide a name in a variable or a file that the hook cannot read.
The guard reads a body file as the earlier steps of its command leave it, as [ADR 0033](../adr/0033-a-hook-reads-each-body-file-as-its-command-leaves-it.md) says.
Discussions, wiki text and commit text are out of scope. The pre-push scan reads pushed commit text, and the guard reads the subject and body of `gh pr merge`.
A stale or missing state copy turns the outbound check off with no message.
