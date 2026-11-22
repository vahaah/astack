# Review stub requirements

[ADR 0027](../adr/0027-the-review-stub-needs-the-plugin-and-commentkeep-is-the-one-keep-list.md) governs the review stub that apply writes and the one keep list of a repo.
The [model](../../formal/ReviewStub.tla) examines one repo with a plugin that is present or absent, one stub run, one apply update and one profile check.

## Acceptance criteria

- [criterion:RS-INSTALL] Each primary and mirrored stub that `renderReviewCopies` renders holds the install line from `MARKETPLACE_REPO` and `PLUGIN_IDS`. No step follows that line, and no stub links to `FALLBACK.md`.
- [criterion:RS-RETIRE] For a repo with `reviewStub` true that tracks the old fallback, apply deletes it once, with its retired reason. With `reviewStub` false, the entry keeps the reason "astack apply no longer writes it."
- [criterion:RS-RULES] A profile with only its required keys and the `change-proof` gate gets no problem. Apply, doctor and `astack check hardening-profile` read that one rule list.
- [criterion:RS-KEEP] A profile with a boundary cast marker passes apply, doctor and the command when the keep list of the repo matches the marker. With no match, each names the marker.
- [criterion:RS-WINDOW] `astack check hardening-profile` exits 0 on a profile that sets `comments.keep_patterns`. Apply refuses that profile with its repair.
- [criterion:RS-ONE-LIST] `RUN_CONFIG` of the engine names only `commentKeep`. `comments.keep_patterns` stays only in the retired row of `references/profile.md`.

## Claim boundary

The model takes the result of each step as a true observation. It does not read the stub text, the profile text or a regular expression.
The install line fails for a teammate until the owner publishes the marketplace, as the commands of `astack init` do.
An applied product repo keeps its old stub and its old fallback copy until its next apply.
