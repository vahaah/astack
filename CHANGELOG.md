# Changelog

## 0.1.0

First public release.

- Skills, shared rules and hooks for the path from a goal to a merged pull request.
- Builds for Claude Code, Codex, Cursor, Grok Build, Grok Bot and other Agent Skills clients.
- CLI checks include `pr-head`, `review-growth`, `spec-drift` and `proof`.
- `change-proof` is a mandatory gate on `apply`. A repo that already uses astack needs `.astack/proof.json`, a TLA+ model and a governing ADR before that gate will pass. Follow the [migration guide](docs/runbooks/change-proof-migration.md) in one adoption pull request first.
