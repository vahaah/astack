# 0024. Orchestrate supervises through the board, a status ask lists each waiting item, and watch-pr watches one PR

Status: Accepted
Date: 2026-11-22
Ticket: none
Supersedes: none

## Context

B18 cut `astack orch` and its store module ([ADR 0013](0013-astack-keeps-a-part-only-on-measured-use.md)).
The Orchestrate playbook still told the coordinator to make and write that store.
It had 2,997 words, and no session read it since the 0.2.0 install.
In one product repo, the hand-kept file of orders grew to 1,077 items and 751,891 bytes.

The owner asked for status 11 times, and no route of the card or the routes matched "status".
The resume rows told the agent to continue from the next step, so a status ask started work.
A checkpoint reply gave the count of open questions, which hides each PR that waits for a merge grant.

`astack watch-pr` had a stack runner and a queued-stack runner with 0 runs in all history.
`watch-pr --pr` ran 13 times in 30 days, and [ADR 0009](0009-astack-adopts-tstack-as-a-frozen-upstream.md) keeps it.

## Decisions

### D1. Orchestrate keeps only supervision rules over the plan, the board, the tracker and git

Orchestrate reads the state with `astack board <index>`.
It drains the open PRs first, starts at most 5 sessions with `astack session start` and writes each brief that the board names.
It treats a completion as a queue event and keeps one writer for each branch.
It never resumes an agent to probe it, and it abandons a unit after two retries.
It keeps the escalation list, and it puts each finding outside the frontier in the drafts file with `astack plan draft`.
A verdict holds for one PR head, and green CI is only input.

The playbook has at most 400 words. It keeps no store file, no status file and no file of orders that each spawn pastes.
A stable order goes into the brief template, the repo profile or an ADR.
`paths-and-wakeups.md` names the plan, the board, the tracker and git as the programme state.
The store path stays for decision trails, the agent records of Autopilot-full and resume notes, because two playbooks and the install settings use it.

### D2. A status ask goes to a Catch up part that only reads and lists each waiting item

"status", "where are we" and "what waits on me" go to the Catch up part of mode `resume.md`.
The card folds the words into its resume row, because the card holds 40 of 40 lines.
The Catch up part reads the state of `resume.md`, and `astack board <index>` for a programme.
It changes nothing and starts no work.

A waiting item is a call that only the owner can take.
Examples are a green PR with no merge grant, an open question, a draft finding and an owner gate.
The reply opens with one sentence that names what waits, or says that nothing waits.
Each waiting item gets one line with its link, the call, the pick and its risk.
A failed read of gh or of the board gets its own line, and the list says unknown for a fact that it cannot read.

#### Formal claim

A catch-up lists each item that waited at that reply.
A checkpoint lists up to 3 waiting items. Past 3, it gives their count and the status pointer.

```text
CatchUpListsEach       == a catch-up reply lists the whole waiting set of its moment
CheckpointHidesNothing == a checkpoint lists the set up to 3 items, or gives its count and the pointer
```

The [model](../../formal/OwnerCatchUp.tla) and its [configuration](../../formal/OwnerCatchUp.cfg) check these invariants over 4 waiting items.
`Raise` and `Settle` change the waiting set. `CatchUp` and `Checkpoint` write the one reply.
With 4 items, a reply over 3 items and a reply over 4 items are both reachable.

#### Category composition

```text
parseWatchArgs : Argv -> WatchArgs          effects: none
resolveContext : WatchArgs -> PrContext     effects: spawn
runSimple      : PrContext -> TerminalVerdict  effects: spawn, clock
```

`parseWatchArgs` reads the flags of one watch and returns a `Result`. A removed stack flag is an unknown option.
`resolveContext` reads the origin remote or `gh pr view` when the flags do not name the owner, the repository and the PR.
`runSimple` polls one PR through `gh` until it reaches a terminal verdict or the deadline.

`main` calls the three arrows in order with plain calls.
It adds no composition operator, map, functor or monad, so no category law applies.
The record uses the `artifact` carrier and declares no composite arrow.
The catch-up and the checkpoint are text rules with no code arrow.

#### Implementation correspondence

The Catch up part of mode `resume.md` and the status ask of Orchestrate map to the `CatchUp` action.
The checkpoint line of the mode `SKILL.md` and the Orchestrate checkpoint, which follows that line, map to the `Checkpoint` action.
`astack plan draft` adds a draft finding, so it maps to `Raise`.
An owner answer, a merge or a closed draft maps to `Settle`.
In the model, each waiting item is one model value.
The reply holds the waiting set of its moment, the listed set, a count and a pointer flag.

D1 and D4 change no reply rule.
They map to the type invariant of the model and to the preservation relation of the session guards.

#### Verification

[The proof matrix](../../.astack/proof-coverage.json) links the criteria of [the programme supervision requirements](../reference/programme-supervision.md) to their tests.
The negative control makes `CatchUp` fold 4 items into a count, and it must violate `CatchUpListsEach`.
That mutation is the defect of a catch-up that hides each item behind a count, as the old checkpoint did.
The normal test gate runs the text controls, the watch-pr tests and the check-plan tests.

### D3. A checkpoint reply names each waiting item, and past 3 gives their count

A checkpoint reply gives the commit or PR link, the gate counts, the next step and each waiting item, in that order.
Past 3 waiting items, it gives their count and says that "status" lists them, so it keeps its 6 lines.
The Orchestrate checkpoint follows this line and adds the board counts. Its status ask gets the Catch up part.

### D4. watch-pr watches one PR

`astack watch-pr` loses `--stack`, `--queued-stack`, `--stack-prs`, `--sweep-interval`, the stack walk and the queue runner.
Each removed flag exits 64 with an unknown option error and makes no reader call.
The JSON lines of a single-PR watch stay byte for byte, because callers parse them.
They keep `schemaVersion` 1, `mode` set to `single` and the `single` READY scope.
Babysit watches the frontier with `--pr`, and moves to the next PR at READY.
After the top PR, it watches each lower PR again, so a stale READY cannot end the babysit.
Shipping waits for the checks with `--pr`, and reads back each merge with `gh pr view`, because a `READY` is not proof of a merge.

## Consequences

- Easier: the owner can leave a programme for a day, and learn each waiting call from one reply.
- Easier: Orchestrate falls from 2,997 to 385 words, and no file of orders grows.
- Easier: watch-pr loses approximately 1,100 lines of code and tests.
- Harder: a stack watch takes one watch for each PR in turn.
- Harder: the card resume row holds the status words, and the Codex fragment has 5 free bytes.
- Follow-up: the store data on the owner's disk stays until the owner deletes it.

## Alternatives considered

- Keep the store text. Rejected because B18 cut the store code, and the hand-kept file of orders grew to 1,077 items.
- Delete the playbook as pstack did. Rejected because the card `/goal` route names it.
- A new card row for the status words. Rejected because the card holds 40 of 40 lines.
- A link to a PR comment in place of the list. Rejected because the owner then opens another page for each call.
- A new catch-up skill. Rejected because the resume reads already give each fact.
- Keep the watch-pr stack runners. Rejected because they have 0 runs in all history.
- Drop `mode` from the JSON lines. Rejected because that shape change needs a new schema version.
