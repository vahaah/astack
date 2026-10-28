# astack

astack holds skills, agents, rules, and hooks for planning, coding, review, tickets, and documentation.
One `astack` plugin supplies the kept pstack and Matt Pocock material.
This repository holds the source and each generated client build.
`LICENSE` and `NOTICE` record the licence and credits.

## Install a release

The CLI needs Node 22 or later, or Bun.
Choose a published signed release from [the release list](https://github.com/vahaah/astack/releases).
The commands below use `v0.1.0` as an example.
They require that public release to exist.
Review the tag's commit and verified signature before installation.

```sh
ASTACK_TAG=v0.1.0
ASTACK_RELEASE="$HOME/.local/share/astack/releases/$ASTACK_TAG"
git clone --branch "$ASTACK_TAG" --depth 1 https://github.com/vahaah/astack.git "$ASTACK_RELEASE"
```

Use a new destination for each release.
For development, set `ASTACK_RELEASE` to a built local checkout.
Before publication, the cloud guides also support local exported bundles.

### Claude Code and Grok Build

```sh
claude plugin marketplace add "$ASTACK_RELEASE"
claude plugin install astack@astack
```

Link the shared rules as `dist/README.md` describes.
The plugin carries its CLI and hooks.
Grok Build uses the Claude plugin build.
Follow its client's marketplace install procedure.

### Codex

```sh
codex plugin marketplace add "$ASTACK_RELEASE"
codex plugin add astack@astack
```

Follow `dist/codex/README.md` for the rules fragment and four trusted hook hashes.
Use the hashes from that same release.

### Cursor

Use the local-copy procedure in `dist/cursor/astack/README.md` from the tagged checkout.
The generated plugin includes flat skills, scoped rules, read-only reviewers, and hooks.
For cloud agents, follow [the Cursor cloud guide](docs/runbooks/install-cursor-cloud.md).
Use repository skills for automation runs.

### Grok Bot

Follow [the Grok Bot guide](docs/runbooks/install-grok-bot.md).
It imports private skills from the tagged source archive.
It keeps reference files and a CLI runtime in the Bot's workspace.
This target ships no astack hooks.

### Other clients

`dist/agentskills/` holds portable skills and a rules fragment.
Use a project install and preserve each skill's other files.
Avoid duplicate global copies when a client already loads the plugin.

## Use astack

- `/astack:mode` reads the plan, tracker, and git state, then selects the next step.
- `/astack:plan` plans new work or resumes a plan.
- `/astack:pr-review-hardening` runs the repository profile's review gates.
- Cursor and portable clients use flat names, such as `/astack-mode`.

The rule card also routes requests such as "create pr" and "update from main".
The catalog covers planning, coding, review, domain modeling, research, tickets, documentation, and tool control.
Each client build keeps the skills and references that its capability map supports.

## Language review packs

The TypeScript pack covers `.ts`, `.tsx`, `.mts`, and `.cts` files.
The PostgreSQL pack covers SQL in repositories that use PostgreSQL.
Detailed checklists live under `skills/code-review/references/` in each relevant build.

The optional `typescript-reviewer` and `postgres-reviewer` agents share those checklists.
They inherit the selected model and allow only Read, Grep, and Glob tools.
The parent runs executable proof and makes accepted fixes.
Adding a pack does not start a reviewer or change `reviewers.extra`.
Portable clients can apply the checklists in their main review.

## Hook profiles

Strict is the default hook profile.
Minimal disables the STE, type, and comment quality groups.
A separate Boolean can override each quality group.
Required workflow guards remain active.
CLI and CI quality commands still run independently.

```json
{
  "hooks": {
    "profile": "minimal",
    "types": true
  }
}
```

Keep this block in the repository's `.astack/profile.json`.
[The hook profile guide](docs/runbooks/hook-profiles.md) explains presets, overrides, and overlapping comment checks.
A client with no astack hooks receives text guidance only.

## The CLI

```sh
"$ASTACK_RELEASE/dist/claude-code/astack/bin/astack" --help
"$ASTACK_RELEASE/dist/claude-code/astack/bin/astack" skill-path astack:principles references/fix-root-causes.md
```

Keep the plugin folder beside this launcher so reference discovery works.
The standalone `dist/cli/astack.js` serves direct checks in CI and git hooks.
It does not carry its own skill library.

Run `astack doctor` after an install to examine that local setup.
It reads installed profiles, duplicate skills, rules, runtime availability, and hook trust.

## Build and verify

```sh
bun install --frozen-lockfile
bun run check:drift
bun run check
```

The frozen install pins Claude Code for plugin validation.
The drift command reads fresh expected build outputs without rewriting generated files.
The full check builds every target and runs validation, neutrality, and secret scans.
It also runs STE checks, tests, formatting, lint, and typecheck.
The authenticated Claude load test needs an API key or OAuth token in its isolated environment.
Without one, the check reports that gate as skipped.
A local pass does not establish a hosted CI pass or a live cloud install.

## Source layout

| Folder | Purpose |
|---|---|
| `marketplace/plugins/astack/` | Plugin source, skills, agents, hooks, and launcher |
| `src/astack/` | CLI and hook implementation |
| `rules/` | Shared rules, scoped language packs, and the generated rule card |
| `scripts/` | Build, apply, scans, and per-tool renderers |
| `dist/` | Generated install builds |
| `tests/` | Tests and synthetic fixtures |
| `examples/companion/` | Synthetic companion example |
| `upstream/` | Frozen test data and licence evidence |
| `docs/` | Design, decisions, and runbooks |

Change generated files at their source.
`AGENTS.md` names each generated path and its build command.
No script syncs or ports a frozen snapshot.

## Private companion

Keep project configs, machine settings, private rules, and deny lists in a separate private repository.
Pass its path through `--companion` or `ASTACK_COMPANION_DIR`.
Without one, read commands use the synthetic example.
Write commands refuse that example.

[The companion guide](docs/runbooks/private-companion.md) explains the layout.
[The repository install guide](docs/install-repo.md) covers apply and branch overlays.
Public CI uses synthetic data and cannot identify every owner's private value.

## Contribute and release

Read [CONTRIBUTING.md](CONTRIBUTING.md) before a change.
Use [SECURITY.md](SECURITY.md) for a private report.
[The publication runbook](docs/runbooks/publish.md) requires a scanned tree and a new first commit.
The owner creates that first commit and pushes it.
Keep old private history outside the public repository.

The signed-tag workflow verifies the tag and exact commit before running release gates.
It creates a draft release for owner review.
Signing keys stay outside CI.
Publish only after the owner reviews the draft and its checks.
