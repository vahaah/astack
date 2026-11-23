# Keep private configuration in a companion

The companion is a separate private repository.
Do not copy it into the public astack tree.
`examples/companion/` shows the layout with synthetic values.

| Path | Purpose |
|---|---|
| `machine.json` | Machine paths, profile paths, and the public remote URL |
| `projects/<name>.json` | Apply config and repository settings |
| `projects/<name>/pr-review-hardening.profile.md` | Review gates for that project |
| `projects/<name>/branches/<base>/` | Review profile for a branch overlay |
| `deny/names.sha256` | Hashes of private terms |
| `deny/canary` | Positive control for the private-term scanner |
| `rules/` | Private rules |
| `docs/` | Private documentation |
| `tests/` | Companion checks |

Pass the companion path to each command that needs it.

```sh
export ASTACK_COMPANION_DIR=/path/to/private-companion
bun run check:companion
bun scripts/neutral.ts --companion "$ASTACK_COMPANION_DIR"
```

The scanner must read a nonempty deny list.
Keep a canary that matches one of its denied terms.
Do not print that canary in public logs.

Set `machine.json` `publicRemote` to the exact public GitHub repository URL before you enable the pre-push gate.
The pre-push check refuses a missing URL and the synthetic example companion.
Keep that setting in the private companion.

The project configs can name private repositories and paths.
Public fixtures must use synthetic values with the same structure.
An apply write refuses the example companion.
Commit companion changes before an apply that records its provenance.

## Project configs

Apply reads each project config with these rules.

`projects/<name>.json` in the companion holds the apply config for one project.
Its `tracker`, `merge`, `ste`, `domain` and `keepPatterns` fields become the repo's `.astack/profile.json`.
Its `commentConflicts` list the open comment-rule conflicts, and its `commentDecisions` record the owner's decisions.
`projects/<name>/pr-review-hardening.profile.md` is the hardening profile of that repo.

The `branches` object of `projects/<name>.json` holds an overlay for each base branch with its own CI, such as `v2`.
An overlay sets only `gates`, `ciOnlyGates` and `ciParity`, and each other key comes from the top of the config.
`projects/<name>/branches/<branch>/pr-review-hardening.profile.md` is the hardening profile of the overlay.
`scripts/lib/projects.ts` fails a config when that file is missing.

An apply whose `--base` names that branch uses the overlay for the CI parity check and writes the profile of the overlay.
An update takes the overlay from `--overlay <branch>`, and the README gives the rule that refuses an update without it.
A decision citation is a comment that cites an ADR, such as `ADR-0006`, or a comment line that starts with `Source:`.
Apply sends each citation of the repo through the comment hook with `keepPatterns`.
It prints a note for each citation that the hook does not keep.
The note does not fail apply, because a citation alone keeps no comment.
