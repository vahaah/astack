# Pass the STE gate on astack's own text

The STE gate of `bun run validate` follows these rules.

astack's own text must also pass the ASD-STE100 deny rules with zero findings.
That is the Markdown under `marketplace/plugins/astack/`, `rules/`, `docs/`, `formal/`, `templates/` and `examples/`, `README.md`, `AGENTS.md`, `CONTRIBUTING.md`, `SECURITY.md` and each skill description.
`bun run validate` runs that gate, and `scripts/lib/ste-own.ts` lists the files and the exemptions.
The gate also examines the Markdown that apply renders for each project of `examples/companion/`, so a sentence in `scripts/lib/flow-config.ts` must pass too.
`bun run check:companion` examines the profiles of the companion and the Markdown that apply renders for each of its projects.

The exemption cap is 0.
Do not add prose exemptions.
The gate skips the four protected upstream quotations in `rules/comments.md`.
Fix a finding at its source, never in a generated file.
To see the findings of one file, run `bun src/astack/cli/bin.ts check-ste <file>`.
`bun run ste` runs the precision gate on `tests/fixtures/ste/labelled.txt`.
The STE engine is in `src/astack/ste/`, and `docs/ste-targets.md` maps the reply rewrite to Cursor and Codex.
