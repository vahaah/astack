---
name: "astack-wizard"
description: "Create an interactive Bash wizard for human-only setup or migration steps. Use for infrastructure, credentials, CI secrets, or unfamiliar dashboards."
license: "MIT"
metadata:
  astack-version: "0.1.0"
  source: "astack"
---

# Wizard

Create a Bash wizard for steps that only a human can perform.
Do not use it for work that the agent can do itself.
The wizard opens URLs, gives precise actions, captures values, and writes them to `.env` or GitHub Actions.
It confirms progress and shows the remaining stages.
Use it for service setup, manual migrations, or a transition between known states.

[template.sh](template.sh) supplies stage progress, confirmation, and URL opening across platforms, including WSL.
It also handles hidden secret entry, idempotent `.env` updates, `gh secret`, `gh variable`, and the closing report.
Write the procedure's stages inside `run_wizard`.
Never edit the shared library above that function.

Keep a one-use wizard in scratch space or `scripts/`.
Delete it when the work ends.
Commit it only when the user wants a repeatable setup path in the repo.

## 1. Define the procedure

Read the repo before you ask for missing inputs.
For setup, inspect `.env`, `.env.example`, `.env.*`, `README`, `docker-compose*`, framework config, and `.github/workflows/*`.
Each `secrets.*` or `vars.*` reference in CI identifies a required value.
For a migration, inspect current state, target state, and irreversible actions between them.

Show the user an ordered stage list and the value each stage produces.
Get confirmation before you author the stages.
The user can add, remove, or reorder them.

For every captured value, record these facts:

- Where the human obtains it.
- Whether it goes to `.env`, a GitHub secret, both, or nowhere.
- Whether it is secret and needs hidden input.

A stage can be an action without a stored value.
Finish this step only when every stage and value has a known destination.

## 2. Trace the human steps

For each stage, name the URL, exact actions, value location, and destination variable.
For example, a path can open a dashboard, choose Developers, open API keys, and reveal a test key.

If you do not know the current UI or exact command, state that gap.
Read the docs or ask the user.
Do not invent a step.
Finish only when a person unfamiliar with the service can follow each stage.

## 3. Write the wizard

Copy `template.sh` to the target path.
Replace its example inside `run_wizard` with one `stage` per step, in dependency order.
Keep every stage in that function.
Keep the file's last line.
Bash then parses the whole file before the first prompt, so a later edit cannot break an active run.

Use the library helpers:

- `stage` for progress.
- `say` and `step` for instructions.
- `open_url` for a page.
- `ask` and `ask_secret` for input.
- `write_env` for persisted values.
- `set_secret` and `set_var` for GitHub Actions.
- `pause` and `confirm` for human gates.

Set `TOTAL_STAGES` to the number of authored stages.
Open the relevant URL before you ask for its value.
Use `ask_secret` for every secret.
Use `write_env` for each value that must persist.
Use `set_secret` only for values that CI needs.
Require `confirm` before every irreversible action.

Each stage clears the screen.
Keep it to one focused task so required instructions remain visible.
Do not change the library above `run_wizard`.

## 4. Check and hand off

1. Run `bash -n <script>`.
2. Run `shellcheck` when available.
3. Run `chmod +x <script>`.
4. Trace every captured value to the destination from step 1.
5. Match each `set_secret` name exactly to a `secrets.*` reference in CI.
6. Tell the user how to run the script.

Do not run the full wizard yourself.
It opens browsers and waits for human input.
For a requested repeatable setup path, commit it and link it from the README.
