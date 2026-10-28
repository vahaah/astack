# astack for Codex

Codex reads the Claude Code build in `claude-code/` through its marketplace support. This folder holds what a Codex plugin cannot ship.

## Install

1. Add the marketplace. Use the path of the repository root, or `vahaah/astack` after publish. Then add each plugin:

   ```sh
   codex plugin marketplace add <repository root>
   codex plugin add astack@astack
   ```

2. Start Codex and open `/hooks`. Trust the four astack hooks. Codex runs a plugin hook only after you trust it.
3. Put the astack CLI on PATH, because Codex does not add the `bin/` folder of a plugin to PATH. The skills run `astack`:

   ```sh
   ln -s <repository root>/claude-code/astack/bin/astack ~/.local/bin/astack
   ```

4. Add `AGENTS.fragment.md` to `~/.codex/AGENTS.md`, because a plugin cannot ship that file. `astack print codex-agents` prints the file with the astack block in it. It replaces an old block between the `<!-- astack -->` markers, so an upgrade adds no second copy:

   ```sh
   astack print codex-agents ~/.codex/AGENTS.md > ~/.codex/AGENTS.md.new && mv ~/.codex/AGENTS.md.new ~/.codex/AGENTS.md
   ```

5. Run `astack doctor`. It reports astack hooks that Codex does not trust, and trusted hooks whose hash is not the hash of this release.

## Limits

- Codex trusts each hook by its own hash. `hooks.trust.json` holds the hash that Codex shows for each astack hook of this release, and `astack doctor` compares the `trusted_hash` values in `~/.codex/config.toml` with it. `hooks.json.sha256` holds the hash of the file `claude-code/astack/hooks/hooks.json`. When a release changes either one, trust the hooks again.
- Codex calls a skill with `$`, as in `$astack:plan`.
- Codex reads at most 32 KiB of AGENTS.md text in a session. The fragment has 9573 bytes, and the limit for it is 10 KiB.
- The Codex sandbox has no network access by default, so the tracker steps ask for approval.
- Codex sends a file edit as `apply_patch`. The astack CLI reads the patch and runs the edit checks on each file that it adds or changes. No live Codex session tested this path yet.

Version: 0.1.0.
