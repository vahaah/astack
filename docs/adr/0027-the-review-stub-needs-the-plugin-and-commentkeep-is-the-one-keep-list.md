# 0027. The review stub needs the plugin, and commentKeep is the one keep list

Status: Accepted
Date: 2026-11-22
Ticket: none
Supersedes: none

## Context

Apply wrote a 5,625-word copy of the hardening loop into each repo, at `.astack/pr-review-hardening/FALLBACK.md`.
The review stub sent each session with no plugin to that copy.
The verifiers of the refocus found 0 loop runs from the copy in 30 days.
The copy caused 18 of the 163 finding rows of `docs/review-lessons.md`, and 291 of the 1,036 tests of `tests/hardening-consistency.test.ts` named it.
Three key tables in `src/astack/pr-review-profile.ts` placed each profile key for the copy, and apply refused a profile that broke them.

A repo also had two keep lists.
Apply wrote `keepPatterns` of the project config as `commentKeep` in `.astack/profile.json`, and the comment hook read it.
The hardening profile held a second list, `comments.keep_patterns`.
Apply refused a profile whose second list differed from the first, and the boundary cast marker rule read only the second list.

## Decisions

### D1. The review stub invokes the engine, and with no plugin it runs no step and gives one install line

The stub template holds no copy of the loop.
When the Skill tool lists `astack:pr-review-hardening`, the stub invokes it.
Otherwise it runs no step of the loop and gives one install line. Its next sentence sends each other tool to the README of the marketplace repo.

#### Formal claim

A loop step runs only through the engine.
The stub gives the install line only when the plugin is absent, and always then.
After an apply update, the repo holds no fallback copy.
The check that the engine runs fails only on an unkept marker, and never on a profile that apply accepted.
The marker rule reads only the keep list of the repo.

```text
NoStepWithoutEngine     == a loop step ran => the stub invoked the engine
InstallOnlyWhenAbsent   == the stub gave the install line <=> the plugin is absent
NoFallbackAfterUpdate   == apply updated the repo => the repo holds no fallback copy
PreflightAcceptsApplied == the check failed => an unkept marker, and apply did not accept the profile
OneKeepList             == the marker problem = a marker that commentKeep does not match
```

The [model](../../formal/ReviewStub.tla) and its [configuration](../../formal/ReviewStub.cfg) check these invariants.
The model has one repo and a plugin that is present or absent. The repo tracks an old copy or not, and its profile sets `comments` or not.
The profile sets a boundary cast marker or not, and `commentKeep` matches it or not.
`RunStub` is one run of the stub, `Apply` is one apply update, and `Check` is one run of `astack check hardening-profile`.

#### Category composition

```text
renderReviewCopies    : (ProjectConfig, dir) -> Rendered                           effects: fs-read
reviewProfileProblems : (ProfileText, readonly RegExp[]) -> ReviewProfileProblem[] effects: none
planRemovals          : RemovalInput -> RemovalPlan                                effects: none
```

`renderReviewCopies` reads the stub template and the profile.
It replaces the install mark with the install line for each primary and mirrored stub.
It calls `retiredCommentsProblem` and `reviewProfileProblems`, with `keepPatterns` of the project config as the keep list.
`reviewProfileProblems` takes the text of a profile and the keep list of the repo as a `readonly RegExp[]`.
`planRemovals` is pure over its probe port, and the probe does the file read at the edge.

The arrows use plain calls and add no composition operator, map or monad.
No two arrows compose, so the record declares no composite arrow, and no category law applies.

#### Implementation correspondence

`renderReviewCopies` in `scripts/lib/render.ts` maps to `RunStub`, because it writes the only text that the stub runs.
`planRemovals` in `scripts/lib/removals.ts` and `RETIRED_PATHS` in `src/astack/managed.ts` map to `Apply`.
`retiredCommentsProblem` maps to the refusal of `Apply` for a profile that sets `comments`.
`reviewProfileProblems` in `src/astack/pr-review-profile.ts` maps to `Check`, and the command and doctor give it `commentKeep`.

`renderReviewCopies` hides the stub source, the install line and the mirror paths. A caller knows only the artifacts and the problems.
Deletion test: without the retired entry, each product repo keeps a stale fallback that `strayCopies` reports on each apply.

#### Verification

[The proof matrix](../../.astack/proof-coverage.json) links the criteria of [the review stub requirements](../reference/review-stub.md) to their tests.
In the negative control, `Apply` keeps the tracked copy. TLC must then report a violation of `NoFallbackAfterUpdate`.
That mutation is the plain removal of the managed path, which leaves the old copy in each repo.
The normal test gate runs the apply, profile, command, doctor and consistency tests.

### D2. Apply renders the install line from the marketplace repo and the plugin ids

The line is `claude plugin marketplace add <repo>`, then `claude plugin install <id>` for each id, joined by `&&`.
The repo is `MARKETPLACE_REPO`, and the ids are `PLUGIN_IDS`, as `astack init` prints them.
A template with no install mark is an apply problem.

### D3. The fallback path is a retired path

`.astack/pr-review-hardening/FALLBACK.md` moves from `MANAGED_PATHS` to `RETIRED_PATHS` with its reason.
Apply deletes a tracked copy once, and `strayCopies` does not report it.
`planRemovals` keeps one entry for each path, and the retired reason wins.
With `reviewStub` false, the entry keeps the reason "astack apply no longer writes it."

### D4. The fallback key tables leave the shared rule list

`FALLBACK_KEYS`, `FALLBACK_UNREAD`, `FALLBACK_EXEMPT`, `PROFILE_LEAF_KEYS` and their readers go, with their two problems.
Each optional key keeps its default in `references/profile.md` of the engine.

### D5. commentKeep is the one keep list of the comment gate, the marker rule and apply

The boundary cast marker rule takes the keep list as a parameter.
Apply passes `keepPatterns` of the project config. The command and doctor pass `commentKeep` from the profile at the repo root.
`comments.keep_patterns` stays legal and unread, so `astack check hardening-profile` passes a profile that still sets it.
Apply refuses a companion profile that sets `comments`, with its repair.

## Consequences

- Easier: the loop has one copy, the engine, and a session with no plugin gets one clear next step.
- Easier: one keep list feeds the comment hook, the comment gate of the engine and the marker rule.
- Harder: a repo with no plugin cannot run the loop. Before the owner publishes the marketplace, the install line fails for a teammate, as the commands of `astack init` do.
- Harder: apply refuses each companion profile that sets `comments`, so the companion drops the key before each product repo applies.
- Follow-up: a later block drops `comments` from the profile shape after each product repo applies.

## Alternatives considered

- A one-page minimum loop in the stub. Rejected because it is a second copy that drifts from the engine.
- Keep the 5,625-word copy. Rejected because it ran 0 loops in 30 days and caused 18 finding rows.
- The plugin ids alone as the install line. Rejected because a reader cannot install an id before the add of its marketplace.
- The `--marketplace-repo` value of apply. Rejected because an update without the flag drops it.
- A plain removal of the managed path. Rejected because `planRemovals` refuses the old entry and `strayCopies` reports the file.
- A drop of the `comments` key now. Rejected because it stops each applied product profile at preflight until its apply.

## Invariant audit

The audit of 2026-11-22 reads `formal/ReviewStub.cfg`. Each row names an invariant or a property other than `TypeOK`.

| Invariant | Class | Action | Controls |
|---|---|---|---|
| `NoStepWithoutEngine` | restates | `RunStub` | `rs-install` |
| `InstallOnlyWhenAbsent` | restates | `RunStub` | `rs-install` |
| `NoFallbackAfterUpdate` | restates | `Apply` | `rs-retire` |
| `PreflightAcceptsApplied` | independent | It joins the fail result of `Check` with the refusal of `Apply`, which read the same marker |  |
| `OneKeepList` | restates | `Check` | `rs-one-list`, `rs-keep-command` |
