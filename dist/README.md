# astack

astack holds skills, rules and hooks for plans, code, comments, tickets and documentation. It builds on pstack by Lauren Tan and on the skills of Matt Pocock. NOTICE gives the credits.

This folder holds generated files. The source repository keeps them under `dist/`. Each tool reads its own folder.

| Tool | Folder | Install |
|---|---|---|
| Claude Code | `claude-code/` | Add this repository as the marketplace `astack`. Then install `astack@astack`. |
| Codex | `claude-code/` and `codex/` | `codex/README.md` |
| Cursor | `cursor/astack/` | `cursor/astack/README.md` |
| Grok Bot | `grok-bot/` | `grok-bot/README.md` |
| Other Agent Skills clients | `agentskills/` | `agentskills/README.md` |

For Claude Code:

```sh
claude plugin marketplace add vahaah/astack
claude plugin install astack@astack
```

Then link the shared rules from a clone of this repository. Claude Code and Grok Build read `~/.claude/rules`. Without the rule card, most chat replies fail the STE check, and each one then costs a rewrite:

```sh
mkdir -p ~/.claude/rules
ln -s <repository root>/rules/astack.md ~/.claude/rules/astack.md
ln -s <repository root>/rules/coding.md ~/.claude/rules/astack-coding.md
ln -s <repository root>/rules/comments.md ~/.claude/rules/astack-comments.md
ln -s <repository root>/rules/typescript.md ~/.claude/rules/astack-typescript.md
ln -s <repository root>/rules/postgres.md ~/.claude/rules/astack-postgres.md
```

## The CLI

The hooks and many skills run the `astack` CLI. It needs Node 22 or later, or Bun. The Claude Code and Cursor plugins hold a copy in `bin/`. For CI, git hooks and other tools, run the package of this repository at a release tag:

```sh
bunx github:vahaah/astack#v0.1.0 --help
```

Run `astack doctor` after an install. It reports the runtime, the installed copies, duplicate skills, untrusted Codex hooks and output-style plugins that conflict with astack.

Version: 0.1.0.
