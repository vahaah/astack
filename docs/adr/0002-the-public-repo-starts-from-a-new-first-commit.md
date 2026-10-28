# 0002. The public repo starts from a new first commit

Status: Accepted
Date: 2026-10-24
Ticket: none
Supersedes: none

## Context

The private astack repo has history since 2026-10-18. Its commits and files hold client names, local paths and session ids. A public repo must hold none of them.

## Decisions

### D1. The public repo starts from a new first commit, made from a tree with no personal content

The private repo keeps its full history. The public repo never receives an old commit.

The public tree includes the source and its generated install builds under programme decision D3.
It includes only synthetic project and machine fixtures.
Root marketplace manifests point to the generated builds in `dist/`.

### D2. The owner creates the public repo and pushes its first commit

An agent prepares the scanned tree. The creation of a public repo is an account step, so it waits for the owner.

## Consequences

- Easier: no client name can leak from an old commit.
- Harder: the public repo shows no history before its first commit. The private repo stays the record of that history.

## Alternatives considered

- Rewrite the history with git filter-repo. Rejected because one missed name stays public in each clone.
- Make the private repo public as it is. Rejected because it leaks client content.
