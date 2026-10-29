# Contributing to astack

Thank you for helping. This page covers what to read, how to check a change and what a good pull request looks like.

## Before you start

- Read [`AGENTS.md`](AGENTS.md) for the code rules and the list of generated files.
- Read [`docs/design.md`](docs/design.md) before you change the layout or a hook.
- For a larger change, open an issue first so we can agree the approach.

## Set up and check

Use the Bun version pinned in the CI workflow.

```sh
bun install --frozen-lockfile
bun run check:drift
bun run check
```

- `bun run check:drift` compiles the CLI in memory and compares every generated file with the committed one. It changes nothing on disk.
- `bun run check` rebuilds every target and runs validation, scans, STE checks, tests, formatting, lint and type checks.

Run `bun run check` before each commit. Do not weaken a check to make a change pass.

## Making changes

- **Edit the source, not the output.** Change a renderer or source file, then rebuild. Commit the generated files in the same pull request as their source.
- **Leave `upstream/` alone.** Those frozen snapshots are licence evidence and test data.
- **Bugs start with a failing test.** Reproduce the failure first, write `Root cause: X because Y`, and keep the regression test with the fix.
- **Use synthetic data.** Fixtures must not contain captured data.

## Privacy

Never add customer names, credentials, captured identifiers or personal paths. Private config stays outside the repo. Public CI uses synthetic data only, so it cannot catch every private value. Take care with what you paste.

Run the owner companion scan (`bun run check:companion`) before a public release.

## Pull requests

Include:

- the problem
- the new behaviour
- how you verified it, with test counts
- any skipped check and the reason
- how to roll back, if the change affects installed clients

Do not attach private logs or tokens as evidence.

## Releases

Releases follow [`docs/runbooks/publish.md`](docs/runbooks/publish.md). A signed tag triggers a workflow that verifies the tag and commit, runs the release gates and creates a draft release. The maintainer reviews and publishes it. Signing keys stay outside CI.

## Credits

astack adapts MIT-licensed text from pstack, Matt Pocock's skills and the Cursor team kit. If your change brings in material from another project, add it to [`NOTICE`](NOTICE) with its source, commit and licence.
