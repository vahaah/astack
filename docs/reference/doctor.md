# Doctor and CLI requirements

[ADR 0021](../adr/0021-doctor-reports-the-trust-that-codex-enforces.md) governs the hook trust, the review profile rules and the base note.
The [model](../../formal/DoctorTrust.tla) examines the trust verdict of doctor over one hook, 3 releases and a read that can fail.

## Acceptance criteria

- [criterion:DT-TRUST] Given a `hooks/list` reply with one astack hook that is `modified`, `untrusted`, off or missing, doctor fails with its name. A `managed` hook that is on gives ok with a note.
- [criterion:DT-FALLBACK] Given no `hooks/list` reply and pinned trusted hashes, doctor prints a WARN with the cause and no ok line for the hooks.
- [criterion:DT-READ-FAIL] A fake codex that hangs, exits 1 or returns a JSON-RPC error gives a failed read with its cause before the deadline. The reader sends `hooks/list` only after the initialize reply.
- [criterion:DT-SKIP] Given a config folder saved with `--skip-profile`, doctor prints one NOTE for that folder and no FAIL from it. A folder that doctor does not examine and a failed write exit 1 with the path.
- [criterion:CLI-VERSION] Given each of the 3 dist bundles, `astack --version` prints the release version and exits 0. A script with no versioned manifest above it exits 1.
- [criterion:HP-RULES] Given a review profile with no `change-proof` gate, `astack check hardening-profile` exits 1 and prints the gate issue with its repair. A missing profile or fenced block exits 2 with the path and its repair. Doctor notes a repo with no review profile.
- [criterion:DT-BASE] Given a base with `protected` false and no blocking ruleset rule, doctor prints a NOTE that names the base, and no FAIL. Doctor reads at most 3 bases, and the first gh failure ends the reads with one note.
- [criterion:WP-DEADLINE] Given `--timeout 5`, a 60 s interval and a pending check, watch-pr sleeps 5 s and returns TIMEOUT. A retry backoff stops at the deadline too.
- [criterion:CLI-MANAGED] `astack managed` on a repo file prints `repo` and exits 0. A profile with no managed list still exits 2.

## Claim boundary

The model covers one hook, 3 releases, the owner trust and toggle actions, a managed flag and a read that can fail.
It takes the status that Codex reports as a true observation of the trust that Codex enforces.
The tests replay a recorded reply of codex-cli 0.171.0, so a later Codex reply shape needs a new recording.
The review profile rules, the base note, the version, the skip file and the watch-pr clamp have no model state. Their tests examine them.
