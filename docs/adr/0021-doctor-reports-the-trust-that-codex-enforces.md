# 0021. Doctor reports the trust that Codex enforces, a drifted review profile and an unprotected base

Status: Accepted
Date: 2026-11-22
Ticket: none
Supersedes: none

## Context

Codex runs a plugin hook only when the owner trusts it in `/hooks`.
Codex 0.171 binds that trust to the hook hash and to a content hash that changes in each release.
`astack doctor` compared only `trusted_hash` in `~/.codex/config.toml` with the pins in `src/astack/codex-trust.ts`.
After the 0.2.0 release, Codex marked the 4 astack hooks `modified` and skipped them, and doctor printed ok.

The `hooks/list` request of `codex app-server` returns `trustStatus` and `enabled` for each hook.
The status is `managed`, `untrusted`, `trusted` or `modified`.
A run of `codex app-server` writes state files into `CODEX_HOME`.

`astack apply` examined a review profile with rules that no CLI command ran in a repo.
So a drifted profile stopped the hardening run at load, and nothing named the problem before the run.
A pushed edit of the review profile needs review only when a rule of the base blocks an unreviewed push.

## Decisions

### D1. Doctor says ok only for a hook that Codex trusts now

Doctor asks `codex app-server` for `hooks/list` when astack is on in Codex.
`src/astack/codex-hooks.ts` holds the one reader, and the dist check uses it through `scripts/dist/codex-hooks.ts`.
The reader waits for the initialize reply before it sends `hooks/list`, and it stops at the deadline of its caller.

An astack hook that is on and `trusted` gives ok.
A `managed` hook that is on gives ok with a note, because a managed config sets its trust.
A `modified`, `untrusted`, disabled or missing astack hook gives a FAIL that names it.
Each error of a `hooks/list` entry gives a WARN.

#### Formal claim

An ok line for the Codex hooks means that Codex runs each astack hook now.
An ok line needs a `hooks/list` reply.
With a reply, doctor says ok exactly when the hook is on and its status is `trusted` or `managed`.

```text
OkMeansCodexTrusts  == report = "ok" => the hook is on and its status is trusted or managed
OkNeedsReply        == report = "ok" => read = "listed"
ListedReportIsExact == a report from a reply is ok exactly when the hook is on and trusted or managed
```

The [model](../../formal/DoctorTrust.tla) and its [configuration](../../formal/DoctorTrust.cfg) check these invariants.
The model has 3 releases with a new content hash each, an owner trust action, an owner toggle and a managed flag.
It also has a `hooks/list` read that can fail and one doctor report after each read.
The model takes the status that Codex reports as a true observation of the trust that Codex enforces.

#### Category composition

```text
readCodexHooks : Io -> CodexHooksRead   effects: spawn, env, clock
gather         : Io -> Snapshot         effects: fs-read, spawn, env
diagnose       : Snapshot -> Findings   effects: none
```

`readCodexHooks` starts `codex app-server` with the PATH of its caller and returns a listed reply or a failed read with its cause.
`gather` reads the config files, calls `readCodexHooks` and the `gh` base reads, and returns one `Snapshot`.
`diagnose` is pure. It maps a `Snapshot` to the findings that doctor prints.
The command calls `gather` and then `diagnose`, so it runs the effects first and the rule last.
The record uses the `artifact` carrier and declares no composite arrow, so no composition, functor or monad law applies.

#### Implementation correspondence

`readCodexHooks` maps to the `Read` action. A listed reply maps to `read = "listed"`, and a failed read maps to `read = "failed"`.
`codexFindings` in `src/astack/doctor.ts` maps to the `Report` action.
`listedFindings` is the branch of `Report` with a reply, and `pinnedFindings` is the branch with no reply.

A new release of astack maps to `Release`, and a trust in `/hooks` maps to `Trust`.
An on or off switch in `/hooks` maps to `Toggle`.
The model has one hook. The code applies the same rule to each of the 4 astack hooks.

#### Verification

[The proof matrix](../../.astack/proof-coverage.json) links each criterion of [the doctor requirements](../reference/doctor.md) to its tests.
The negative control makes `Report` read only the hook hash, and it must violate `OkMeansCodexTrusts`.
That mutation is the defect of the old doctor, which printed ok for a hook that Codex marked `modified`.
The doctor tests replay a recorded `hooks/list` reply through a fake `codex` on the PATH of the test, so no test starts the real Codex.

### D2. With no reply, doctor warns and prints no ok line

A failed read has a cause: no codex on PATH, a 10 s timeout, an exit before the reply or a JSON-RPC error.
Then doctor compares each `trusted_hash` with its pin, prints a WARN with the cause and prints no ok line for the hooks.
A missing or wrong `trusted_hash` still gives a FAIL.
The lowest enforcement rung of Codex stays at 5, because no read shows that the hooks run.
A pin match proves no trust, because Codex also compares a content hash.

Doctor writes only its skip file, its runtime file and the state that `codex app-server` keeps in `CODEX_HOME`.
A temporary `CODEX_HOME` cannot see the trust of the owner, so doctor uses the real one.

### D3. One rule list examines a review profile

`reviewProfileProblems` in `src/astack/pr-review-profile.ts` holds the parse and schema issues of a review profile and the apply rules.
The apply rules are the `change-proof` gate rule, the fallback keys that the profile leaves out and the keys that the fallback does not follow.
Each problem has a repair.
`astack check hardening-profile`, doctor, apply and `bun run check:companion` call it.
The command exits 1 on a problem, and 2 for a missing profile or a profile with no fenced block.
The hardening skill runs the command when it loads the profile.

The profile parser uses the bundled `yaml` package, because the CLI bundle runs on node.
A repeated key keeps its last value, as `Bun.YAML` did.

### D4. A base counts as protected only with a rule that blocks an unreviewed push

A base counts as protected with a ruleset rule of type `pull_request`, `update` or `required_status_checks`.
It also counts with classic protection whose required check enforcement is not `off`.
Other classic protection gives a note, because only an admin can see a required review.
A base with no such rule gives a note that names it, and no FAIL.

Doctor reads the default branch, then at most 3 bases: the default branch and then the standing bases in profile order.
A note names each base past the cap.
The first `gh` failure gives one note and ends the reads, so a run makes at most 7 `gh` calls.
Doctor reads nothing outside a git repo with a GitHub remote.

## Consequences

- Easier: a clean `astack doctor` after a release means that Codex runs the astack hooks.
- Easier: a drifted review profile shows up in doctor and in one command, with the repair, before a hardening run.
- Harder: doctor writes Codex state and adds at most 10 s for a Codex read and 28 s for the `gh` reads.
- Harder: a Codex release with no `trustStatus` or `enabled` field gives a WARN until astack reads the new shape.
- Follow-up: B24 removes the stub fallback, and then the fallback key rules leave the shared list.

## Alternatives considered

- Pin the content hash too. Rejected because only Codex computes it, and it changes in each release.
- FAIL on each status other than `trusted`. Rejected because it fails a managed hook and passes a disabled one.
- Read `hooks/list` in a temporary `CODEX_HOME`. Rejected because that home cannot see the trust of the owner.
- A second rule list in the CLI. Rejected because the two lists drift apart.
- Read the protection endpoint. Rejected because it needs admin rights.
- A push guard for a profile edit. Rejected because branch protection already controls a pushed edit.
