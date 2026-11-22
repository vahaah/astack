# Finding telemetry and own-text requirements

[ADR 0022](../adr/0022-each-hook-finding-leaves-an-event-line-with-no-text.md) governs the event log, the doctor sum, the fence rule and the unit rule.
The [model](../../formal/FindingTelemetry.tla) examines two parallel handler runs with three findings.

## Acceptance criteria

- [criterion:OWN-FENCE] A contraction in a `md`, bare or `prompt` fence of a skill file fails `bun run validate`, and the finding names the line. A `sh` fence and a fence in `docs/` pass. A test pins the list of code and data info strings.
- [criterion:OWN-ZERO] astack's own text and the text that apply renders hold 0 deny findings, also in each fence that is not code or data. Each skill stays at or under its word cap.
- [criterion:UNIT-ONE] A number and its next unit count as one word, also for a decimal such as 3.4. The units are ms, s, min, h, KB, MB, GB and px. A number and a plain noun count as two words.
- [criterion:NOUN-CHECKS] "checks" gives no word-broad note after a number word from two to ten or after a state word such as required. A comma after it also means a noun. "CI checks the branch on each push." keeps its note.
- [criterion:TEL-NOTEXT] Each event line holds only the keys time, turn, release, pid, handler, check, event, surface, rule, outcome and fingerprint. No line holds a sentence, a comment or a path. The release is the manifest version of the plugin build with its build stamp, in the Claude Code and the Cursor build.
- [criterion:TEL-APPEND] 8 parallel hooks of one session that each deny write 8 complete lines. Each line is one append call.
- [criterion:TEL-OUTCOME] The outcome of a line is deny, demoted, advise, quiet, rewrite or pending, as the agent saw the finding. Each line names the handler that found it.
- [criterion:TEL-MASKED] A finding that does not block and has no quiet rule writes masked when its handler run denies.
- [criterion:TEL-SAFE] A log that refuses a line never changes the verdict of the artifact, comment or reply hook. A refresh run writes no line.
- [criterion:TEL-SUM] `astack doctor` sums the events of the last 7 days by rule, surface and outcome. Each count is one note in area `ste-events`, also in `--json`. It skips a broken line and an older event, and it prints a note when no log exists.

## Claim boundary

The model covers two parallel runs of one handler and three findings with one rule of each tier. Each run has a refresh flag, and the log can refuse writes.
It takes the append of one short line as atomic, as the 8-process test measures on a local disk.
The fence rule, the unit rule and the doctor sum are outside the model. Their tests and `bun run validate` examine them.
