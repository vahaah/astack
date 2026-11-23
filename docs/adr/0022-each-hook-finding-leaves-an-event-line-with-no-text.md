# 0022. Each hook finding leaves an event line with no text

Status: Accepted
Date: 2026-11-22
Ticket: none
Supersedes: none

## Context

Review B7 found that the STE hooks keep no record that can tune a rule.
The deny ledger holds one count for each fingerprint of a measured rule, with no surface, outcome or time.
The exact rules, the reply rewrite and the comment hook record nothing.
On the owner's machine, 171 session folders held 26 ledgers and 0 event logs.

Review B1 found 20 deny findings in the prose fences of astack's own templates, which agents copy.
The own-text gate read no fence, so it found none of them.
Review B8 found that the word-broad rule reads "checks" as a verb after a number word or a state word.

Index D11 of the review roadmap keeps the 20 and 25 word limits.
B11 softens a rule only after one week of this log.

## Decisions

### D1. Each STE and comment finding appends one event line with no text

The STE artifact hook, the STE reply hook and the comment hook append one JSON line for each finding.
The file is `events.jsonl` in the session folder `<state>/ste/<session>/`.
A line holds the keys time, turn, release, pid, handler, check, event, surface, rule, outcome and fingerprint.
No line holds a sentence, an excerpt, a comment or a path, because the transcript holds the text.
A labeller finds the text through the session, the turn and the time, and runs the check again.

A fingerprint is the rule and an FNV-1a hash of the normalized sentence or comment quote.
The release is the version of the plugin manifest beside the running script, with its build stamp.
Each line is one append call of the whole line.
No write reads and rewrites the log, because parallel hooks of one session append at the same time.
`pruneSessions` deletes a session folder after 14 days, so no log lives longer.

#### Formal claim

A handler run returns the verdict that its findings give, whatever the log does.
Each line holds only the event keys, and a refresh run writes no line.
When the log takes each line, each finding of a finished run that is not a refresh has exactly one line.
A masked line comes only from a run that denies.

```text
LogNeverChangesVerdict == the verdict of each run is the verdict that its findings give
NoTextInEvent          == each line holds only the event keys
RefreshWritesNothing   == no line comes from a refresh run
OneLinePerFinding      == a finished run that is not a refresh has one line for each finding
MaskedOnlyUnderDeny    == a masked line comes only from a run that denies
```

The [model](../../formal/FindingTelemetry.tla) and its [configuration](../../formal/FindingTelemetry.cfg) check these invariants.
They cover two parallel runs and three rules, one for each tier.
Each run has a refresh flag, and the log can refuse writes.
Each append of one line is one atomic step, so the two runs interleave line by line.

#### Category composition

```text
outcomeOf    : Findings     -> Outcome      effects: none
outcomeIn    : Observation  -> EventOutcome effects: none
withLedger   : Outcome      -> Judged       effects: fs-read, fs-write, env
logRun       : Judged       -> Verdict      effects: fs-read, fs-write, clock, env
writeEvents  : EventEntries -> EventLog     effects: fs-read, fs-write, clock, env
sumSteEvents : EventLog     -> SteEvents    effects: none
```

`outcomeOf` is pure. It gives the verdict of one target and the shown outcome of each finding.
`outcomeIn` is pure. It turns a shown outcome into masked when the handler run denies.

`withLedger` reads the deny ledger, records the denies of the measured rules and joins the outcomes of one run.
`logRun` writes one line for each finding of a run that is not a refresh, and returns the verdict with no change.

`writeEvents` stamps each entry with the time, turn, release and pid, and appends each line. The reply hook calls it directly.
`sumSteEvents` is pure. It takes the log text and the current time, and returns the counts of the last 7 days.

The record uses the `artifact` carrier and declares no composite arrow, so no composition, functor or monad law applies.
[The witness module](../../tests/astack/telemetry-composition.ts) binds each arrow to its declared type, and `tsc` examines it.

#### Implementation correspondence

`outcomeOf` and `withLedger` map to the `Judge` action, and the shown outcome maps to `Outcome`.
`logRun`, `writeEvents` and `appendEvents` map to the `Write` action. A refused append maps to `broken`.
The return of the handler verdict maps to the `Return` action.

The reply hook has no `Judge` state in the model. Its rewrite and pending lines use the same `writeEvents` arrow.
`sumSteEvents`, the fence rule and the unit rule have no model state, and their tests examine them.

#### Verification

[The proof matrix](../../.astack/proof-coverage.json) links the criteria of [the requirements](../reference/finding-telemetry.md) to their tests.
The negative control makes the `Write` action set the verdict to allow when the log refuses a line.
It must violate `LogNeverChangesVerdict`.
That mutation is the defect of a log error that escapes to the dispatcher, which turns a deny into an allow.
The hook tests run the bundled CLI with 8 parallel hooks, a refused log and each outcome.

### D2. The outcome names what the agent saw

The outcome is one of these values:

- `deny`: the finding blocks.
- `demoted`: a measured finding whose fingerprint the ledger demoted, so the agent saw it as advice.
- `advise`: the finding is in the advice note.
- `quiet`: a rule of the quiet set, which the note leaves out.
- `masked`: a finding that does not block and has no quiet rule, under a deny of its handler run. The agent never sees it.
- `rewrite`: a finding of a reply that the Stop hook sends back for one rewrite.
- `pending`: a finding that the rewrite still holds.

A log write error never changes a verdict.
A refresh run writes no line, because the ledger skips a refresh and B11 compares all outcomes.
A note that another handler hides stays `advise`, and B11 finds it through the pid.

### D3. astack doctor sums the events of the last 7 days

`astack doctor` reads each `events.jsonl` of the state folder.
It prints one note in area `ste-events` for each rule, surface and outcome, with its count.
`--json` prints the same notes, so the JSON output has no new field.
It skips a broken line and an event older than 7 days. It prints a note when no log exists.
astack adds no new command or report script for the counts.

### D4. B11 changes a rule only after one week of this log

The week starts when the owner installs a release with this change, not at the merge.
B11 draws a sample from the log, labels it and changes a rule only from those counts.
The deny ledger is not the source, because it records only the denies of the measured rules.

### D5. astack's own templates pass the deny tier

The own-text gate reads each fence outside `docs/` whose info string is not on the pinned code and data list.
`scripts/lib/ste-own.ts` holds that list.
A bare fence and a `prompt` fence count as prose. A fence of data lines takes a data info string, such as `tsv`.
`docs/` stays out, because each prose fence of an ADR holds a formula.

The masker joins a number and its next unit into one word, also for a decimal such as 3.4.
The units are ms, s, min, h, KB, MB, GB and px.
The length fix text also tells the writer to put a list of 3 or more items in a bullet list.
`NOUN_SIDE` holds the number words two to ten and the state words required, failed, failing, passing, green, red, flaky and pending.
A comma after a word means that no object follows it.

## Consequences

- Easier: B11 tunes each rule from counts of real outcomes, for each release.
- Easier: the templates that agents copy pass the deny tier.
- Harder: each finding costs one append to a local file.
- Harder: a parallel hook of another handler can hide a note, and only the pid links the two runs.
- Follow-up: B11 labels a sample and changes the rules that give false denies.

## Alternatives considered

- Store the sentence in the event for labels. Rejected because the transcript holds the text, and the log must hold no client text.
- One shared log outside the session folder. Rejected because the session folder already has a 14-day prune.
- Record only denies. Rejected because B11 compares all outcomes.
- A log error that denies. Rejected because telemetry must never block the work.
- A new CLI command for the counts. Rejected because doctor already reports the local state.
- Soften the hooks now. Rejected because no data shows which rule gives false denies.

## Invariant audit

The audit of 2026-11-22 reads `formal/FindingTelemetry.cfg`. Each row names an invariant or a property other than `TypeOK`.

| Invariant | Class | Action | Controls |
|---|---|---|---|
| `LogNeverChangesVerdict` | independent | It joins the verdict of `Judge` with `Write` and `Return`, which must keep that verdict |  |
| `NoTextInEvent` | restates | `Write` | `tel-notext` |
| `RefreshWritesNothing` | restates | `Judge` | `tel-refresh` |
| `OneLinePerFinding` | independent | It joins the pending set of `Judge` with each `Write` and with the guard of `Return` |  |
| `MaskedOnlyUnderDeny` | restates | `Write` | `tel-masked` |
