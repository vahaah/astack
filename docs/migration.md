# Migration from agent-stack

`bun run build` writes this file from `scripts/lib/migration.ts`. `bun run apply --global --dry-run` prints the same steps with the state of each step.

The switch moves the installed agent-stack to astack. Before the switch, the marketplace `agent-stack` serves `pstack`, `craft` and `flow` from `~/Projects/agent-stack/marketplace`. The rule links are `agent-stack-coding.md` and `agent-stack-comments.md` in `~/.claude/rules`. After the switch, the marketplace `astack` serves `astack@astack` from `~/Projects/astack/dist`.

A profile in `machine.json` of the companion can link its `plugins` and `rules` folders and its `settings.json` to `~/.claude`. Then one change in `~/.claude` serves each of these profiles. This switch does not change a profile that has its own config.

Do the steps in order. Start the next step only when the proof of the step passes. Each step takes less than a minute.

## 1. Check the tree

The repo has no commits, so the switch moves the only copy of the source. Start only from a green check.

```sh
cd ~/Projects/agent-stack
bun install
bun run check
bun run apply --global --dry-run
```

Proof. `bun run check` exits 0. The dry run shows each step of this file as todo or manual.

## 2. Close the other sessions

A running session keeps the old hooks from the plugin cache until it starts again. Run the next steps in a plain terminal, or in one session that does not run in the repo.

```sh
cd ~
```

Proof. No other Claude Code session is open in a profile. The coordinator makes sure of this by hand.

## 3. Save the old plugins

The plugin cache holds the only copy of the old craft plugin. A rollback needs it.

```sh
mkdir -p ~/.local/state/astack/migration
cp -R ~/.claude/plugins/cache/agent-stack ~/.local/state/astack/migration/agent-stack-cache
cp ~/.claude/plugins/known_marketplaces.json ~/.claude/plugins/installed_plugins.json ~/.local/state/astack/migration/
```

Proof. The list shows `craft`, `flow` and `pstack`.

```sh
ls ~/.local/state/astack/migration/agent-stack-cache
```

## 4. Remove the old plugins and marketplace

The profiles that link their `plugins` folder to `~/.claude/plugins` share it, so one run changes all of them. Unset `CLAUDE_CONFIG_DIR` for the default profile. With `CLAUDE_CONFIG_DIR=~/.claude`, Claude Code makes a second config file `~/.claude/.claude.json`.

```sh
env -u CLAUDE_CONFIG_DIR claude plugin uninstall craft@agent-stack --scope user
env -u CLAUDE_CONFIG_DIR claude plugin uninstall flow@agent-stack --scope user
env -u CLAUDE_CONFIG_DIR claude plugin uninstall pstack@agent-stack --scope user
env -u CLAUDE_CONFIG_DIR claude plugin marketplace remove agent-stack
```

Proof. The two commands print nothing.

```sh
jq -r '.plugins | keys[] | select(endswith("@agent-stack"))' ~/.claude/plugins/installed_plugins.json
jq -r 'keys[] | select(. == "agent-stack")' ~/.claude/plugins/known_marketplaces.json
```

## 5. Rename the directory

The old rule links point at the old path. They break here, and the step that links the rules replaces them.

```sh
mv ~/Projects/agent-stack ~/Projects/astack
```

Proof. The command prints `renamed`.

```sh
test -f ~/Projects/astack/dist/.claude-plugin/marketplace.json && test ! -e ~/Projects/agent-stack && echo renamed
```

## 6. Add the astack marketplace and plugins

`dist/` is the publish root, so the install reads the files that the public repo gets later. `bun run apply --global` in `~/Projects/astack` runs the same commands and makes the 5 links of the next step.

```sh
env -u CLAUDE_CONFIG_DIR claude plugin marketplace add ~/Projects/astack/dist --scope user
env -u CLAUDE_CONFIG_DIR claude plugin install astack@astack --scope user
```

Proof. The command prints `astack@astack`.

```sh
jq -r '.plugins | keys[] | select(endswith("@astack"))' ~/.claude/plugins/installed_plugins.json
```

## 7. Link the rules

These links also serve each profile that links its `rules` folder to `~/.claude/rules`.

```sh
rm -f ~/.claude/rules/agent-stack-coding.md ~/.claude/rules/agent-stack-comments.md
ln -s ~/Projects/astack/rules/astack.md ~/.claude/rules/astack.md
ln -s ~/Projects/astack/rules/coding.md ~/.claude/rules/astack-coding.md
ln -s ~/Projects/astack/rules/comments.md ~/.claude/rules/astack-comments.md
ln -s ~/Projects/astack/rules/typescript.md ~/.claude/rules/astack-typescript.md
ln -s ~/Projects/astack/rules/postgres.md ~/.claude/rules/astack-postgres.md
```

Proof. The list shows 5 links into `~/Projects/astack/rules` and no `agent-stack` file.

```sh
ls -l ~/.claude/rules
```

## 8. Change the tracked settings

`~/config/claude/settings.json` is the source of the live `~/.claude/settings.json`. The command replaces the two old allow rules and turns off the explanatory and learning output styles, because they conflict with STE replies. It keeps the plugin cache reads and the pstack store rule.

```sh
cd ~/config/claude
jq --indent 2 '
  .permissions.allow |= map(
    if . == "Read(~/Projects/agent-stack/marketplace/**)" then "Read(~/Projects/astack/dist/**)"
    elif . == "Bash(craft:*)" then "Bash(astack:*)"
    else . end)
  | .enabledPlugins["explanatory-output-style@claude-plugins-official"] = false
  | .enabledPlugins["learning-output-style@claude-plugins-official"] = false
  | .enabledPlugins["astack@astack"] = true
' settings.json > settings.json.new
mv settings.json.new settings.json
git -C ~/config/claude diff -- settings.json
```

Proof. The diff changes only the allow rules and plugin entries. The `grep` command prints 0.

```sh
grep -c 'agent-stack\|craft' ~/config/claude/settings.json
```

## 9. Change the private overlay

Only the owner does this step, because agents must not read `~/.claude/settings.private.json`. That file holds the entries with absolute paths.

```sh
grep -c 'agent-stack' ~/.claude/settings.private.json
```

When the count is not 0, open the file in an editor. Delete each key that ends in `@agent-stack`. Replace the `agent-stack` entry under `extraKnownMarketplaces` with this entry, and write your home folder in the path:

```json
"astack": { "source": { "source": "directory", "path": "/Users/<you>/Projects/astack/dist" } }
```

Proof. The `grep` command prints 0.

```sh
grep -c 'agent-stack' ~/.claude/settings.private.json
```

## 10. Apply the settings

`settings.py check` prints the diff. It reads the private overlay, so do not paste its output. `settings.py apply` writes `~/.claude/settings.json`.

```sh
~/config/claude/settings.py check
~/config/claude/settings.py apply
```

Proof. The first command prints `false` for each output style and `true` for each current plugin. The second command prints nothing.

```sh
jq '.enabledPlugins["explanatory-output-style@claude-plugins-official"], .enabledPlugins["learning-output-style@claude-plugins-official"], .enabledPlugins["astack@astack"]' ~/.claude/settings.json
jq -r '.permissions.allow[] | select(test("agent-stack|craft"))' ~/.claude/settings.json
```

## 11. Verify each profile

Each profile must show each astack plugin one time. `astack doctor` reads every profile, Codex and Cursor.

```sh
env -u CLAUDE_CONFIG_DIR claude plugin list
CLAUDE_CONFIG_DIR=~/.claude-a claude plugin list
CLAUDE_CONFIG_DIR=~/.claude-b claude plugin list
~/Projects/astack/dist/claude-code/astack/bin/astack doctor
```

Proof. Each list shows `astack@astack` one time, and each one is on. No list shows a plugin from `agent-stack`, and the two output-style plugins are off. `astack doctor` shows no FAIL line for a profile that shares `~/.claude/plugins`. It can still show FAIL lines for a profile with its own config, Codex, Cursor and `~/.agents/skills`. The last step sets up Codex and Cursor. `bun run apply --global --dry-run` prints the commands that remove the duplicate skills.

## 12. Run a headless deny test

The test sends one Write payload to the installed hook. It needs no model call.

```sh
probe="$(mktemp -d)"
hook="$(jq -r '.plugins["astack@astack"][0].installPath' ~/.claude/plugins/installed_plugins.json)/bin/astack"
printf '{"session_id":"migration-probe","cwd":"%s","hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":"%s/a.ts","content":"export const x: any = 1;\\n"}}' "$probe" "$probe" | "$hook" hook claude-code PreToolUse; echo "exit $?"
```

Proof. The output starts with `astack blocked this write` and ends with `exit 2`.

## 13. Clean up

The uninstall keeps the old cache. Earlier test runs left empty data folders and project folders in the real config. A run with `CLAUDE_CONFIG_DIR=~/.claude` left the second config file. Update each memory note that the last command shows.

```sh
rm -rf ~/.claude/plugins/cache/agent-stack
find ~/.claude/plugins/data -maxdepth 1 -type d -empty \( -name '*-agent-stack' -o -name craft-inline -o -name probe-inline -o -name probeplan-inline \) -print -delete
find ~/.claude/projects -maxdepth 1 -type d -name '-private-tmp-claude-*-scratchpad-*' -print -exec rm -rf {} +
rm -f ~/.claude/.claude.json
grep -rl 'agent-stack' ~/.claude*/projects/*/memory/
```

Proof. The last command shows only the notes that you updated, or nothing.

## 14. Set up Codex and Cursor

Codex reads the same marketplace, and it runs a plugin hook only after you trust it. Cursor ignores symbolic links, so the command copies the plugin. Run the `cat` command one time only.

```sh
codex plugin marketplace add ~/Projects/astack/dist
codex plugin add astack@astack
cat ~/Projects/astack/dist/codex/AGENTS.fragment.md >> ~/.codex/AGENTS.md
sed -i '' -e '/^\[plugins\."explanatory-output-style@claude-plugins-official"\]$/,/^enabled = /s/^enabled = true$/enabled = false/' -e '/^\[plugins\."learning-output-style@claude-plugins-official"\]$/,/^enabled = /s/^enabled = true$/enabled = false/' ~/.codex/config.toml
mkdir -p ~/.cursor/plugins/local
rm -rf ~/.cursor/plugins/local/astack
cp -R ~/Projects/astack/dist/cursor/astack ~/.cursor/plugins/local/astack
```

Then start Codex, open `/hooks` and trust the four astack hooks. Reload Cursor, and turn off the two output-style plugins that Cursor imported.

Proof. `astack doctor` shows no FAIL line for Codex and Cursor.

```sh
~/Projects/astack/dist/claude-code/astack/bin/astack doctor
```

## Roll back

The repo has no commits, so a rollback cannot bring back the old source. The saved cache holds the old plugins. These commands remove astack and start a session with the old plugins:

```sh
env -u CLAUDE_CONFIG_DIR claude plugin uninstall astack@astack --scope user
env -u CLAUDE_CONFIG_DIR claude plugin marketplace remove astack
claude --plugin-dir ~/.local/state/astack/migration/agent-stack-cache/craft/* --plugin-dir ~/.local/state/astack/migration/agent-stack-cache/pstack/* --plugin-dir ~/.local/state/astack/migration/agent-stack-cache/flow/*
```
