# 0034. Public GitHub text passes the deny list, and a second PR of one session needs a split instruction

Status: Accepted
Date: 2026-11-23
Ticket: none
Supersedes: none
Amends: none

## Context

The astack repo is public. A review found 4 open issues that named client projects, and one issue held 4 hits of the hashed deny list.
The only name check ran on commits at push time, in the pre-push scan. No hook read the text that gh or an MCP tool sent to GitHub.
`bun run deny add` wrote only the companion list, and a hook env often has no `ASTACK_COMPANION_DIR`.
The hash matcher lived in `scripts/lib/neutrality.ts` on `Bun.SHA256`, but the CLI bundle builds from `src/astack/` and also runs on node.

The same review found 3 PRs in 21 minutes from one session. The second and the third PR each linked the first with `Part of #1710`, and the owner asked for one PR.
`duplicateReasons` denied only for the same head or a shared ticket key, and `ticketKeys` keeps no `#N` link.
The guard kept no record of the PRs of a session, and it read no instruction to split.

The guards stop agent mistakes, as [ADR 0011](0011-merge-authority-comes-from-the-owner-and-the-base-branch.md) D6 says. They are no boundary against a hostile agent.

## Decisions

### D1. The hash matcher lives in src/astack/deny-list.ts on node:crypto

`HashMatcher`, `parseHashList`, `nameHash`, `wordTokens` and `sha256` live there, and each script and test imports them there.
So the bundle and the scripts share one hash rule.

### D2. The hook reads a state copy of the list, and a bad copy denies each GitHub text write

The copy is `<state>/deny/names.sha256`. `bun run deny add` and `bun run deny sync` write it from the companion, and sync refuses the example.
No copy gives no check. A bad line or a throw of the handler denies each GitHub text write that the parse finds.

### D3. A GitHub text write is a gh issue or PR write, a gh api write or an MCP write tool

A gh write is a create, edit, comment or review of an issue or a PR. A close or reopen with `-c` or `--comment` is one too. A `gh api` write to an issue, pull or graphql path counts too.
An MCP write tool has a write verb in its name, and its server name holds github or its tool name holds `pull_request`.
An issue write tool counts too, when its `url` is a GitHub issue URL or its server is no other known tracker.
Each string at each depth of an MCP input is a text.

### D4. Only a private or internal target passes a text with a listed name

The target is an issue URL, else `--repo`, else `GH_REPO`, else the endpoint or input repo, else each GitHub remote of the folder.
On a hit, gh reads the visibility of each target other than `PUBLIC_REPO`. An answer other than private or internal denies.

### D5. A body that only a variable hides and an unread body file keep their verdict

The guards stop agent mistakes, so `--body "$BODY"` passes. A host tool with no repo field takes the remotes of the project folder.

### D6. A Part of link to an open PR of the author is a one-PR reason

The link can be `#N`, `owner/repo#N` or the URL of the PR.

### D7. A record of each session holds the open of each create that duplicate-pr passes

The record is `<state>/pr-sessions/<session>.json`, and an open holds the root, the repo, the base and the head.
A create gets a one-PR reason when the record holds another open head of its root, repo and base. No session id saves nothing.

### D8. A stacked base or a split instruction clears each one-PR reason of D6 and D7

A stacked base is the head of an open PR. The split instruction counts only in the last person's prompt of the session.

### D9. splitInstructionIn reads the clauses of the merge grant reader

A clause with PR or pull request gives the instruction only when a verb that opens a PR comes before the PR word. These verbs are open, create, make, ship, put, file, raise and split.
Then split before the PR word, or second, separate, another or two just before it, gives the instruction.
A negation, a question, "one PR" and "into one" or "into the first" give none. So a clause that closes, merges, folds or reviews a PR gives none.

### D10. The outbound handler has no model

Its rule has no state and no order, so a model only restates the law of its control. `formal/models.json` gives it an unmodelled row with the control `outbound-text`, and a throw denies.

## Domain and effects

Terms. Outbound deny list, Split instruction

```domain
context Guards
agg  OutboundWrite @ src/astack/outbound.ts: OutboundWrite
inv  OB1 OutboundWrite: a write whose text holds a listed name passes only when each target is private or internal
agg  SessionPrs @ src/astack/pr/split.ts: SessionPrs
inv  SP1 SessionPrs: a create with a Part of link to an open PR, or another open head of its session, root, repo and base, needs a stacked base or a split instruction
step outboundWrites : OutboundCall -> OutboundWrite[]
step sessionReasons : (NewPr, SessionPrs, OpenPr[]) -> string[]
law  L1 OB1 a write with a listed name in each case and spelling gets a deny unless each target is private or internal, and the reason holds no text line   check: prop outbound-text
law  L2 SP1 a create gets a one-PR reason for a Part of link or another open head of its root, repo and base only with no stacked base and no split instruction   check: prop session-pr-rule
rung R4
```

## Consequences

- Easier: an agent cannot post a listed name to a public issue or PR by mistake, and the deny names only the hash prefix.
- Easier: a second PR of one session and worktree needs a stacked base or the owner's split instruction.
- Harder: each machine needs one `bun run deny sync`. A stale or missing copy turns the check off with no message.
- Harder: each hit costs one gh call of up to 4 s for each target other than `PUBLIC_REPO`.
- Harder: an unattended session never gives a split instruction, so its second PR to one base needs a stacked base or the owner.

## Alternatives considered

- A manual audit of the public issues. Rejected because the next issue can name a client again.
- A copy of the matcher in src/astack. Rejected because two hash rules can drift.
- A read of the companion through `ASTACK_COMPANION_DIR`. Rejected because a hook env often lacks it.
- Creates only. Rejected because each comment, review and edit then passes.
- `PUBLIC_REPO` as the only public target. Rejected because a client name in an upstream issue then passes.
- A deny of each unread write. Rejected because it denies each `--body "$BODY"`.
- Ticket keys only. Rejected because the 3 PRs of the review each linked the first by `#N`.
- A session key with no root. Rejected because it denies the Orchestrate worktrees.
- A split grant for the whole session, or a split that the agent decides. Rejected because the owner decides each split.
- A SessionGuards invariant with conformance rows. Rejected because TLC then runs on each change and only restates the law.
