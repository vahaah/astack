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
