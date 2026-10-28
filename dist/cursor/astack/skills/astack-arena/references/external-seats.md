# External seats

Claude Code's Agent tool runs Claude models only.
Use a CLI through Bash for a panel seat on another model family.
The `astack-models.md` rule uses these external values:

- `codex` runs `codex exec` on codex's configured default model.
- `codex:<model>` runs `codex exec -m <model>`.
- `cursor-agent:<model>` runs `cursor-agent -p --model <model>`.

## Check the CLI

Before fan-out, run `command -v codex` or `command -v cursor-agent`.
For cursor-agent, check sign-in with `cursor-agent status` too.
If the CLI is missing or signed out, use a Claude subagent on `sonnet` for that seat.
Report the fallback and the resulting gap in model diversity.

## Write the brief

Write the full seat prompt to a file, such as `<out>/brief.md`.
The CLI cannot load Claude Code skills by name.
Give absolute paths for every skill, reference and principle.
Inline any file that the CLI cannot read from disk.

## Run it

Start each seat with a Bash call that sets `run_in_background: true`.
Put those calls in the same message as the Agent spawns.
Bash reports the result when each process exits.

Use these forms for a read-only reviewer or judge:

```bash
codex exec -s read-only -C <repo> -o <out>/result.md - < <out>/brief.md
cursor-agent -p --mode ask --model <model> --workspace <repo> --output-format text "$(cat <out>/brief.md)" > <out>/result.md
```

Give a runner or worker its own worktree before it writes:

```bash
git worktree add <dir> <base>
codex exec -s workspace-write -C <dir> -o <out>/result.md - < <out>/brief.md
cursor-agent -p --force --model <model> --workspace <dir> --output-format text "$(cat <out>/brief.md)" > <out>/result.md
```

For `codex:<model>`, add `-m <model>` to codex.
Set codex effort with `-c model_reasoning_effort=<level>` to match the job.
A cursor-agent model name includes its effort token.

## Collect

Read `<out>/result.md` after the process exits.
A non-zero exit or empty result is a dropout.
Apply the calling skill's dropout rule.
Use the configured value, such as `codex:<model>`, wherever the output names the seat's model.
After a candidate is merged or rejected, remove each worktree that you created with `git worktree remove <dir>`.
