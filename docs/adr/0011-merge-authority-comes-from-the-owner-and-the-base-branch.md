# 0011. Merge authority comes from the owner and the base branch

Status: Accepted
Date: 2026-11-22
Ticket: none
Amends: 0010 D4

## Context

A review of the merge guard found four paths that merged with no word of the owner.
`humanPrompt` refused only a prompt that opened with a tag. A workflow brief opens with `[Workflow harness — computed task]`, and a CoCode relay opens with `[CoCode: the agent ...]`.
So the text "Merge #12 when green." in such a brief saved a merge grant.
The Cursor decoder marked each prompt as a person's prompt, also in a background agent.

The guard read `.astack/profile.json` from the working tree.
So an uncommitted edit of `merge.authority` gave standing merge authority, also in an unattended session.
A standing profile also covered a `--repo` merge of a PR of another repo.

The guard denied only `merge_pull_request` and `merge_pr` of a server whose name held `github`.
The CoCode `pull_request_merge` tool and the Linear `merge_diff` tool merged with no deny.
The dispatcher turned an exception of a handler into an allow, so an error in the merge guard let the merge go ahead.

ADR 0010 D4 keeps attended detection as it is. This ADR adds the frame rule to it.

## Decisions

### D1. Standing authority comes from the profile at the tip of the PR base branch

The PR read also reads `.astack/profile.json` at the tip of the base branch of the PR.
It uses `repository.object(expression:)` in the GraphQL call that reads the threads and the checks.
`merge.authority`, `merge.standingBases` and `merge.requireChecks` come only from that read.
An absent file, a file that is not valid JSON and a failed read give turn authority.
No key of the working tree changes a merge verdict, so a merge with no grant now reads GitHub first.
`astack check pr` and the PR body hook keep the working-tree read of `tracker.requirePartOf`, because a lint gives no authority.

#### Formal claim

`formal/SessionGuards.tla` gives the merge group two authority variables.
`baseAuthority` is the profile at the base tip. It holds `turn`, `standing`, `base` or `unread`.
`workingAuthority` is the working-tree profile. `EditProfile` changes it at any step.
`Merge` reads only `baseAuthority`, and it merges only through the `gh` channel with no guard error.

The prompt source has the class `frame`, which is never a person's prompt.

```text
MergeNeedsAuthority == each merge has a base profile grant or a covering prompt of a person
McpMergeDenied      == no merge goes through an MCP tool
GuardErrorDenies    == no merge goes ahead after a guard error
GrantFromPerson     == grant # {} => PersonTyped(saidBy, attended)
```

The [model](../../formal/SessionGuards.tla) and its [configuration](../../formal/SessionGuards.cfg) check these invariants with the earlier ones and no fairness.
The negative control lets `Merge` read `workingAuthority`. It must violate `MergeNeedsAuthority`.
The model takes the base read, the prompt source class and the attended state as true observations.

#### Category composition

The record uses the `artifact` carrier.

```text
mergeGrantIn          : PromptText -> MergeGrant       effects: none
readPullRequestWithGh : PrTarget -> PullRequestState   effects: spawn, network
mergeGuard            : HookCall -> Verdict            effects: fs-read, fs-write, spawn, network
```

`mergeGrantIn` maps the text of a person's prompt to a `MergeGrant`, and the guard saves it only for a person's prompt.
`readPullRequestWithGh` maps a `PrTarget` to a `PullRequestState` that holds a `BaseAuthority`.
`mergeGuard` maps a `HookCall` to a `Verdict`, and it calls the PR read once for each merge.
The dispatcher joins the verdicts of the guards side by side, so the record declares no composite arrow.
This change adds no composition operator, map, functor or monad.
`tests/astack/guard-composition.ts` is the typed witness.

#### Implementation correspondence

| Model concept | Concrete contract |
|---|---|
| `baseAuthority` | `baseAuthorityFrom` in `src/astack/pr/github.ts` gives `committed`, `absent` or `unread` |
| `ProfileCovers` | `grantReasons` with `mergeProfileOf` in `src/astack/pr/merge.ts` |
| `workingAuthority` and `EditProfile` | A write of `.astack/profile.json` in the working tree, which no merge code reads |
| `frame` source | `opensWithHarnessFrame` in `humanPrompt` in `src/astack/ste/session.ts` |
| `channel` | `isMcpMerge` in `src/astack/hook/handlers/merge-guard.ts`, which reads the tool name and the input |
| `fault` | `failed` of the merge guard, which `judgeEach` in `src/astack/hook/dispatch.ts` calls |

These links describe the abstraction relation.
They do not show that the TypeScript code refines the model.

#### Verification

[The proof matrix](../../.astack/proof-coverage.json) links SG-framed-prompt, SG-base-authority, SG-mcp-merge and SG-guard-error of the [session guard requirements](../reference/session-guards.md) to their controls.
The merge guard, dispatch, Cursor hook, STE and hook suites run each control through the normal test gate.
The negative control must violate `MergeNeedsAuthority` with a counterexample, and the unchanged model must pass again with the same state counts.

### D2. A standing profile covers only the PRs of its own repo

The base read takes the profile from the repo of the PR.
So `merge.authority` and `merge.standingBases` of one repo never cover a PR of another repo.

### D3. A framed prompt is harness text

A prompt that opens with a tag, or with a bracket label that is not a Markdown link, is not a person's prompt.
A host `source` field still wins, as ADR 0010 D4 says.
A Cursor prompt is a person's prompt only in an attended session.
A person's prompt that opens with a bracket label, such as a pasted `[Image #1]`, gives no grant. The owner then says the grant again.

### D4. Each MCP tool with a merge word gets a deny

The guard splits a tool name on `_`, `-`, `.`, each case change and each change between a letter and a digit.
An acronym is one token, so `createPRMerge` holds the token `merge`.
A token that holds `merg` is a merge token.
A merge token that ends in `merged`, `mergeable` or `mergeability` names a state. Each other merge token is a merge word, such as `prmerge` or `automerge`.

A name with a merge token and a merge word or a write verb gets a deny on each server, also with a grant.
So `get_and_merge_pr` and `mark_merged` get a deny, and `show_merged_prs` passes.
A read tool on an exact list, such as `list_merge_requests` and `get_merge_request`, passes.
The rule also denies a merge that is not a PR merge, such as a database branch merge. Such a merge is an owner gate.

The guard also reads each key and each value of the input of an MCP call, because a generic API tool can post a merge.
It reads the decoded values, not the JSON text, so a tab or a line break before a mutation name does not hide it.
It also decodes each JSON escape in a value, because the body of a raw request can hold escapes that the forge decodes.
An input that holds `mergePullRequest`, `enablePullRequestAutoMerge`, `enqueuePullRequest` or `mergeBranch` gets a deny.
A merge queue entry merges the PR later, and a branch merge goes into the base with no PR.
An input with a `pulls/<n>/merge` path and a write method, such as `PUT`, gets a deny too.
The `<n>` part can be any path segment, such as the route template `{pull_number}`.
A `repos/<owner>/<repo>/merges` path with a write method gets a deny for the same reason as `mergeBranch`.
An input value that holds a `gh pr merge` command gets a deny, because a shell tool can run it with no check of the guard.

### D5. An error of the merge guard on a merge gives a deny

A handler can name a failure verdict, and the dispatcher uses it when the handler throws.
When the merge guard throws, it denies each MCP merge call and each merge command that its shell parse finds. The deny names the error.
Each other handler still fails open.

### D6. The merge guard guards against mistakes

The merge guard stops an agent that merges by mistake.
It is not a security boundary against a hostile agent, which can write the grant file or call the REST API with its own tool.
Branch protection and required reviews are the control for a hostile agent.

### D7. A turn grant stays until the next prompt of a person

A prompt that is not a person's prompt leaves the grant of the turn as it is.
The next prompt of a person sets the grant again, or ends it.

## Consequences

- Easier: the owner can give standing authority and trust that a session write does not widen it.
- Easier: a workflow brief, a relay message and an MCP merge tool cannot merge with no owner word.
- Harder: a merge with no grant reads GitHub before it denies.
- Harder: a profile edit grants nothing until it merges into the base branch, through the same guard.
- Limit: a repo with no branch protection lets a session push a profile edit straight to the base branch.

## Alternatives considered

- Read `origin/<base>` from local git. Rejected because a session can move a remote-tracking ref with `git update-ref` or a fetch.
- Deny each write of the profile. Rejected because shell writes, branch switches and old worktrees are open sets.
- Refuse a dirty profile. Rejected because a local commit or a branch switch changes HEAD.
- Add only the literal prefix `[Workflow harness`. Rejected because the next frame label passes again.
- Keep an exact deny list of MCP merge tools. Rejected because the list missed CoCode and Linear, and it drifts with each host.
- Let each name that starts with a read verb pass. Rejected because `get_and_merge_pr` then merges.
- Keep the allow on a guard error. Rejected because an error then merges with no check.
