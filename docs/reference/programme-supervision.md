# Programme supervision requirements

[ADR 0024](../adr/0024-orchestrate-supervises-and-a-status-ask-lists-each-waiting-item.md) governs the Orchestrate rules, the catch-up route, the checkpoint reply and the one-PR watch.
The [model](../../formal/OwnerCatchUp.tla) examines 4 waiting items, a catch-up reply and a checkpoint reply.

## Acceptance criteria

- [criterion:WP-ONE-PR] `astack watch-pr --stack`, `--queued-stack`, `--stack-prs 3,4` and `--sweep-interval 30` exit 64 with an unknown option error and make no reader call. The help, the usage and the summary name no stack mode. Each `astack watch-pr` command of the skill texts and the README parses.
- [criterion:WP-SINGLE-JSON] With a fake reader and one ready PR, `astack watch-pr --pr 12` and `astack watch-pr --pr 12 --status-only` print the JSON lines of trunk, byte for byte.
- [criterion:OR-NO-STORE] Orchestrate has at most 400 words and names no store file. `paths-and-wakeups.md` keeps no programme state in the store. Orchestrate keeps each supervision rule of ADR 0024 D1.
- [criterion:CU-LIST] The card row and the routes row send "what waits on me" to the Catch up part of `resume.md`. The two rows and that part say that a status ask only reads and starts no work. That part gives each waiting item one line and each failed read its own line.
- [criterion:CU-CHECKPOINT] A checkpoint reply names each waiting item up to 3. Past 3, it gives their count and says that "status" lists them.
- [criterion:AN-NAMES] A plan question that cites an unknown principle gets a warning that names `astack:principles` and no pstack name. The rule header of setup-models names astack.

## Claim boundary

The model covers 4 waiting items and one reply at a time.
It takes the reads of the plan, the board and gh as true observations.
The text controls and the STE gates examine the words of the texts. The model does not read them.
The card line cap of the build keeps the card at 40 lines.
