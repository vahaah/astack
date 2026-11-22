# Working on astack

`docs/design.md` is the authoritative design. Read it before you change the layout or a hook.

## Where things live

- `marketplace/` is the client-neutral Claude Code marketplace `astack`, publishable on its own. It holds the `astack` plugin.
- `marketplace/plugins/astack/` holds the source files of the plugin: skills, agents, `hooks/hooks.json`, the `bin/astack` launcher and the bundled CLI `bin/astack.js`. `scripts/lib/residuals/` holds the residual allow lists.
- `src/astack/` holds the astack CLI sources. `src/astack/hook/` holds the hook dispatcher, and `src/astack/cli/` holds the command registry.
- `.astack/profile.json` in a product repo is the astack profile of that repo. `src/astack/profile.ts` reads it.
- `rules/` holds the always-on rules that users symlink into `~/.claude/rules/`. `rules/astack.md` is the rule card. It is a copy of the mode's `references/card.md`, so the plugin carries it too, and a project apply never copies it into a repo.
- `src/astack/rules.ts` owns shared rule names and selection for installs, doctor, and builds. The scoped packs are `rules/typescript.md` and `rules/postgres.md`.
- `src/astack/hook-profile.ts` parses `hooks.profile` and its `ste`, `types`, and `comments` overrides. Strict is the default. Minimal disables only those quality groups. Every unmarked handler stays required. Invalid settings retain strict runtime behavior. CLI checks stay independent. See `docs/runbooks/hook-profiles.md`.
- `upstream/` holds pristine snapshots of the pinned upstream plugins. `upstream/lock.json` records the repo, path and commit of each.
- The companion is a private folder of the owner, outside this repo. It holds the apply configs, their hardening profiles and the deny list. `scripts/lib/companion.ts` owns its layout. Apply, `bun run deny`, `bun run neutral` and `bun run check:companion` find it through `--companion <dir>`, then `ASTACK_COMPANION_DIR`, then the synthetic `examples/companion/`. The tests always use the example, and a write refuses it. `bun run check:companion` examines each config and profile of the companion, and fails on 0 configs. It also runs each test file that reads `profilePaths` or `scanProjectDirs` from `tests/profile-paths.ts`, with `ASTACK_PROFILE_SCAN_DIR` set to the companion. So the profile and config scans of the tests read each profile and overlay of the companion, with the exception rows of its `profile-scan.json`. It runs each `tests/*.test.ts` of the companion too.
- `projects/<name>.json` in the companion holds the apply config for one project. [The companion runbook](docs/runbooks/private-companion.md#project-configs) gives its fields, its branch overlays and its decision citations.
- `templates/pr-review-hardening.stub.SKILL.md` is the one thin review stub that apply writes into each repo. It invokes the `astack:pr-review-hardening` engine and holds no copy of the loop. When the plugin is absent, it runs no step and gives one install line. Apply renders that line from `MARKETPLACE_REPO` and `PLUGIN_IDS` in place of the install mark of the template. `.astack/pr-review-hardening/FALLBACK.md` is a retired path, so apply deletes an old copy once.
- The gates of a hardening profile mirror the blocking jobs of the repo's CI. [The CI parity runbook](docs/runbooks/ci-parity.md) gives each rule of the parity check, of `astack check ci-pins` and of the gate checks of apply.
- `src/astack/managed.ts` lists the files that apply deletes and merges. [The apply runbook](docs/runbooks/apply.md) gives the rules of managed files, line citations and apply commits.
- Each repo-bound file that holds upstream text declares its source in `scripts/lib/render.ts`. Apply writes `.astack/NOTICE` with the source map and MIT notices. The instructions carry no credit footers. `tests/apply/notices.test.ts` fails when a rendered file shares a run of words with an upstream file that it does not declare.
- `scripts/` holds the build, apply, validate, dist and neutrality scripts, and `scripts/skill-load-report.ts`, which prints source load sets. `docs/runbooks/skill-load-measurement.md` names its limits. `scripts/dist/` holds the per-tool renderers and their checks.
- `dist/` holds the generated install builds, with one folder per tool. The public source root points to them through generated marketplace manifests.
- `tests/` holds unit tests and synthetic fixtures. `tests/fixtures/hook-input/` holds synthetic hook payloads with the shapes that Claude Code sends.
- `docs/` holds the design. `docs/review-lessons.md` records each class of review finding with its rule and its guards. `tests/review-lessons.test.ts` compares it with the guard files and with the review checklist of the engine, `references/checklist.md`.

## Add a hook handler or a CLI command

`hooks/hooks.json` has one dispatcher entry for each event and stays the same byte for byte. Do not edit it to add a check.

1. To add a hook check, write `src/astack/hook/handlers/<id>.ts`. Make the handler with `defineHandler({ id, on, run })` from `src/astack/hook/events.ts`, and export it as `handler`. `on` lists the event kinds. `run` gets only those kinds and returns a `Verdict`.
2. Add the handler to the array in `src/astack/hook/handlers/index.ts`.
3. To add a command, write `src/astack/cli/commands/<name>.ts`. Export `command` with `name`, `summary`, `usage` and `run`, and add it to `src/astack/cli/commands/index.ts`. A new check goes in `src/astack/cli/commands/check/` and in `check/index.ts`. Then `astack check <name>` and `astack check-<name>` both run it.
4. Read a repo setting with `profileSection(projectDir, "<key>")` from `src/astack/profile.ts`, and parse it in your own module.
5. Return a verdict. Never write to stdout or stderr in a handler. `src/astack/hook/encode/` turns the combined verdict into the output of each tool.

## Never hand-edit generated files

Change the source and rerun the command.

| Generated file | Source | Command |
|---|---|---|
| `rules/astack.md` | `marketplace/plugins/astack/skills/mode/references/card.md` | `bun run build` |
| `marketplace/plugins/astack/NOTICE` | the origins of the astack items and `scripts/lib/upstreams.ts` | `bun run build` |
| `marketplace/plugins/astack/bin/astack.js` | `src/astack/` | `bun run bundle` |
| `dist/` | `marketplace/`, `rules/` and `scripts/dist/` | `bun run dist` |
| `.claude-plugin/marketplace.json`, `.cursor-plugin/marketplace.json` | `scripts/build.ts` and the source marketplace | `bun run build` |
| `LICENSE`, `NOTICE` | the astack plugin licence and notice | `bun run build` |
| `package.json` name, version, private, author, license, bin and engines | the astack plugin manifest and `scripts/build.ts` | `bun run build` |

Never edit `upstream/`. It holds frozen snapshots, and no script syncs or ports them (ADR 0001). To take a useful upstream change, copy it by hand as a normal astack change.

`rules/comments.md` is a source file, but never change its four quoted sections. `tests/build.test.ts` compares them with the frozen reviewer.

## Keep the tree client-neutral

No tracked file names a client, a client project, or a customer. No tracked file holds a value of another leak class of `scripts/lib/leak-rules.ts`, such as a local path or a session id. Put project-specific material in the companion, and use synthetic fixtures in tests. `bun run neutral` reads each tracked file and exits 1 on a finding. With the owner's companion, it also reads the owner values of the companion.

## Build the dist

`bun run dist` writes `dist/` from `marketplace/` and `rules/`. Then it runs the checks of each target. The public repo holds the source and these client-neutral builds. The root marketplace manifests point to `dist/`.

| Folder | Tool | What it holds |
|---|---|---|
| `.claude-plugin/`, `claude-code/` | Claude Code, Codex, Grok Build | the marketplace `astack` with a copy of the `astack` plugin, plus `agents/openai.yaml` beside each skill that only the user may start |
| `rules/` | Claude Code, Grok Build | the rule card, coding and comment rules, and scoped language packs, which the owner links into `~/.claude/rules` |
| `.cursor-plugin/`, `cursor/astack/` | Cursor | one plugin with each kept skill and agent as `astack-<name>`, `rules/*.mdc` and Cursor hooks |
| `codex/` | Codex | install steps, `AGENTS.fragment.md`, the hash of `hooks.json` and `hooks.trust.json` with the hash of each hook |
| `grok-bot/` | Grok Bot | flat skills, `astack-rules` and `astack-sync`, and no hooks |
| `agentskills/` | other Agent Skills clients | skills with only `name`, `description`, `license` and `metadata`, and `AGENTS.fragment.md` |
| `package.json`, `cli/astack.js` | CI and git hooks | the CLI package |

- `scripts/dist/capability.ts` decides for each item and tool whether the build emits it, omits it or uses a fallback. Add a case there before you add a target or an item.
- Codex trusts a hook by its hash. `scripts/dist/checks.ts` pins the sha256 of `marketplace/plugins/astack/hooks/hooks.json`, so the build fails when the file changes. Change the file only on purpose. Then change the pin. `src/astack/codex-trust.ts` pins the hash that Codex shows for each of the four hooks. When `codex` is on PATH, `bun run dist` reads them from `codex app-server` in a temporary `CODEX_HOME` and fails on a mismatch. `src/astack/codex-hooks.ts` is the one `hooks/list` reader for the dist check and `astack doctor`. Doctor reads the trust status that Codex reports for each astack hook. With no reply, it compares the trusted hashes of the owner with these pins and warns.
- `scripts/lib/upstreams.ts` holds the source credits. `SKILL_ORIGINS` maps skill names, `AGENT_ORIGINS` maps agent paths, and `PATH_ORIGINS` maps code and rule paths. Keep credits out of skill frontmatter and instructions. Each flat skill licence holds its upstream copyright notices. `bun run build` writes `marketplace/plugins/astack/NOTICE` from the registry. `tests/notice.test.ts` checks the registry against copied text. `tests/dist/real.test.ts` checks each standalone licence and keeps credit blocks out of instructions.
- The flat targets must not hold terms of Claude Code. `scripts/dist/claude-terms.allow` lists each allowed term with its reason, in the format of the residual allow lists.
- `upstream/cursor-plugin-schemas/` holds the pinned Cursor manifest schemas. The build compares the Cursor manifests with them.
- The copy of the astack `plugin.json` in `claude-code/` gets a build stamp, such as `0.1.0+1a2b3c4d5e6f`. The stamp is a hash of the plugin files, so `claude plugin update` sees each new bundle. The Cursor `plugin.json` in `cursor/astack/` gets a stamp of its own plugin files too. The hook event log uses the stamped version as its release key. The release version in `marketplace/` and in `package.json` has no stamp.

## Write no comments

pstack's `upstream/pstack/agents/comment-sicko.md` is the ruler for code in this repo. Names, types and tests carry intent. A comment survives only if it is one of these:

- a license or SPDX header;
- a note on non-obvious behavior that an external dependency, platform, vendor or protocol forces;
- a `prettier-ignore`, or a style-only lint suppression with its reason;
- a doc comment that defines a public API contract;
- an issue or RFC link that explains a constraint the code cannot express.

## Write plain prose

Skills, rules and docs follow the `astack:write-docs` and `technical-writing` skills. Write short sentences with no filler, no emoji and no bold labels.

astack's own text must also pass the ASD-STE100 deny rules with zero findings. [The STE gate runbook](docs/runbooks/ste-gate.md) gives the files, the commands and the exemption rules of that gate.

## Test plugins in isolation

Load a plugin with `claude -p --plugin-dir <dir> --no-session-persistence` from a temporary directory. Set `CLAUDE_CONFIG_DIR` to a temporary directory too, because `claude -p` still writes `projects/<slug>/` into the config dir. A temporary config dir has no login, so export `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN` first. `bun run validate` does this for its load gate when one of them is set. When neither is set, it prints SKIP for the load gate and never runs it against your own config. Never install a work-in-progress plugin into your real Claude Code config.

## Check before you commit

Run `bun run check:drift` before a rebuild. It compares fresh expected artifacts without changing generated files.

Run `bun run check`. It runs `biome ci .` and `tsc -p .` first. Then it builds, bundles, validates, builds and checks `dist/`, and runs the neutrality lint, the STE gates and the skill word budget of `bun run budget`. It also runs the secrets scan of `bun run secrets`. Then it runs the change proof once and the tests last, in parallel. The secrets scan puts the pinned gitleaks into the astack cache folder, so its first run needs network access. To fix formatting, run `bunx biome check --write .`.

Run `bun run check:fast` for a short answer while you work. It runs tsc, biome, build, bundle, dist with `--no-external`, ste and budget. Then it runs the tests that `bun test --changed` selects from the merge base with `origin/HEAD`, and each test file that starts the launcher or the bundle. Its fixed cap is 20 s on the dev machine. It does not fail on time, and it does not replace `bun run check`.

The owner's clone also runs the scan as its git pre-push hook, with `bun scripts/pre-push.ts --companion <companion> "$@"` in `.git/hooks/pre-push`. The flag names the companion also when git runs the hook without the shell profile. The hook acts only on a push to the `publicRemote` of `machine.json` in the companion. It then scans each file of each new commit. It exits 1 on a finding or on an empty deny list. It also refuses the example companion, because the example holds no owner value.
