# 0025. Each text that reads a PR with gh runs the head check command

Status: Accepted
Date: 2026-11-22
Ticket: none
Supersedes: none

## Context

16 skill texts held the manual head check, with 1,009 words in all.
13 of them also held the no-PR rule of `gh pr view`.
`astack check pr-head` already did the same check, but only the engine and the stub fallback ran it.
So a change of the check needed 16 edits, and each copy can drift from the command.

The command gives `no_pr:` with exit 3 only for the no-PR message of gh with no `--pr`.
It gives `ok:` with exit 0 only when HEAD equals the head of the PR or descends from it.
Each other result is `stop:` with exit 1, a usage error with exit 2 or a launcher note with exit 1.

One of the 16 texts is the setup seed `issue-tracker-github.md`.
Setup copies it into a product repo, where an agent can run with no astack.
No ADR governed the head check of the skill texts.

## Decisions

### D1. Each text that reads a PR with gh runs the head check command in one fixed line

Each astack text that reads a PR with gh holds this head line:

```md
Run `astack check pr-head` before you act on a PR, with `--pr <n>` for a named PR. Go on only after exit 0 with an `ok:` last line or exit 3 with a `no_pr:` last line.
```

A text that keeps a `gh pr view` or `gh pr status` read holds the failure line after the head line.
The failure line says that each failure of `gh pr view` is an error, not a missing PR.
A `gh api` read gets no failure line, so the REST paths of file-pr and babysit-pr stay.

The one step after `stop: HEAD does not hold PR_HEAD` is the repair sentence.
It pulls the PR branch and runs the command again.
A push follows only when `UNPUSHED` lists a commit.
Each other stop result stops the text.

The setup seed keeps the manual head check and the no-PR rule, because a product repo can have no astack.
The engine and the stub fallback keep their own forms, and B24 owns the fallback.

#### Formal claim

A text acts on a PR only when gh read that PR and HEAD holds its head.
A text takes no PR only after the no-PR message of gh with no `--pr`.
Each other result stops the text, except one pull after a head stop.

```text
ActOnlyOnHeldHead == a text acts only after gh read the PR, the run had a runtime, and HEAD equals or descends from the PR head
NoPrOnlyOnMessage == a text takes no PR only after the no-PR message with no --pr and a runtime
OtherResultStops  == each decided result other than ok: and no_pr: stops the text and takes no PR
```

The [model](../../formal/PrHeadCheck.tla) and its [configuration](../../formal/PrHeadCheck.cfg) check these invariants.
They cover 3 gh answers, a named PR or none and 4 head relations.
They also cover 3 stop results: a `stop:` line, the launcher note and a usage error.
`Check` runs the command, `Decide` reads its result and `Pull` repairs one head stop.

#### Category composition

```text
selectorOf        : Args -> Selector           effects: none
parsePullRequest  : ViewText -> PullRequest    effects: none
run               : Args -> ExitCode           effects: spawn, fs-write
```

`selectorOf` reads the arguments and returns the PR number, no number or a usage error.
`parsePullRequest` reads the JSON of `gh pr view` and returns the PR number and head, or no value.
`run` spawns gh and git, and `git fetch` writes objects into the repository.

`run` calls `selectorOf` and `parsePullRequest` with plain calls.
It adds no composition operator, map, functor or monad, so no category law applies.
The record uses the `artifact` carrier and declares no composite arrow.
The head line, the failure line and the repair sentence are text rules with no code arrow.

#### Implementation correspondence

The command `astack check pr-head` maps to the `Check` action.
The head line in each PR text maps to the `Decide` action.
The repair sentence in mode `SKILL.md` and in `comments-triage.md` maps to the `Pull` action.
In the model, a result is one model value, and HEAD holds the PR head after one pull.

The command hides the no-PR message, the fetch, the ancestry check and the unpushed list.
Deletion test: without the command, 15 texts hold the check again.

#### Verification

[The proof matrix](../../.astack/proof-coverage.json) links the criteria of [the PR head check requirements](../reference/pr-head-check.md) to their tests.
In the negative control, `Decide` acts after `stop: HEAD does not hold PR_HEAD`. TLC must then report a violation of `ActOnlyOnHeldHead`.
That mutation is the defect of a text that acts on a PR when HEAD does not hold the PR head.
The normal test gate runs the scan controls and the pr-head tests.

### D2. The scan pins the head line, the failure line and the repair, and refuses the old check

The consistency scan reads each Markdown file of the plugin, each rule and each companion profile.
Each text that reads a PR with gh must hold the head line and must not hold the manual check.
Each text with a `gh pr view` or `gh pr status` read must hold the failure line after the head line.
Each text that runs the command names no other result than the two pairs that go on and the repair.
create-pr keeps the list rule of `gh pr list`, which reads an empty list as no PR.
Only the engine, the stub fallback and the setup seed keep their own forms, and each has its reason in the scan.

## Consequences

- Easier: the owner changes the head check in one place, the command, and 15 texts follow it.
- Easier: the skill texts lose 100 words against the merge base, and no cap rises.
- Harder: each text that reads a PR needs astack on the PATH. A run with no runtime gets the launcher note and stops.
- Follow-up: the engine and the stub fallback still say that the launcher exits 0, and one test pins both. The `Not yet specified` list of the review-roadmap index holds that fix until the owner files a ticket.
- Follow-up: B16 moves the PR rules of a mode playbook into `create-pr.md`, and `create-pr.md` must keep the head line.

## Alternatives considered

- A link to the engine section in place of the line. Rejected because the agent then reads another file for each PR text.
- A line that reads only the exit code. Rejected because it drops the last line, which the caller contract of the command needs.
- Keep the manual check in each text. Rejected because 16 copies drift from the command.
- Give the setup seed the head line. Rejected because a product repo can run the seed with no astack.

## Invariant audit

The audit of 2026-11-22 reads `formal/PrHeadCheck.cfg`. Each row names an invariant or a property other than `TypeOK`.

| Invariant | Class | Action | Controls |
|---|---|---|---|
| `ActOnlyOnHeldHead` | independent | It joins the result that `Check` reads from gh, the runtime and the head with the act of `Decide`, and `Pull` can move the head |  |
| `NoPrOnlyOnMessage` | independent | It joins the result that `Check` reads from gh and the runtime with the update of `Decide` |  |
| `OtherResultStops` | restates | `Decide` | `ph-pair` |
