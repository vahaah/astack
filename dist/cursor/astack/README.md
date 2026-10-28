# astack for Cursor

This plugin holds 52 skills, the astack rules and the astack hooks. One astack plugin supplies each item.

## Install

For a public install, import `https://github.com/vahaah/astack` with `From GitHub Repository` in Cursor Customize. Then install `astack`.

For a local install, copy the plugin into `~/.cursor/plugins/local/`. Cursor ignores symbolic links in that folder.
Use the source root or the built output root for these commands. Move an existing local astack plugin to a backup first.

```sh
ASTACK_BUILD=.
if test -d dist/cursor/astack; then ASTACK_BUILD=dist; fi
mkdir -p ~/.cursor/plugins/local
cp -R "$ASTACK_BUILD/cursor/astack" ~/.cursor/plugins/local/astack
```

Then reload Cursor. The skills run the `astack` CLI, so put the `bin` folder of the plugin on your `PATH`:

```sh
export PATH="$HOME/.cursor/plugins/local/astack/bin:$PATH"
```

The CLI needs Node 22 or later, or Bun.

## Cloud agents

Use project skills under `.cursor/skills/` for cloud agents and automations. Keep the CLI and reference files with the project.
Read `docs/runbooks/install-cursor-cloud.md` in the source repository for the bundle route and its verification steps.
Personal skill sync covers `~/.cursor/skills/`. It does not sync local plugin folders or `~/.agents/skills/`.
Automation runs do not load personal synced skills. Start a new cloud agent after an update.

Source: https://cursor.com/docs/skills

## Names

Cursor gives each skill a flat name. Each skill starts with `astack-`, as in `/astack-plan` and `/astack-grilling`.

## Hooks

Each hook runs `bin/astack hook cursor <event>`. The CLI sends the event to the same handlers that the other tools use.

| Event | What astack does |
|---|---|
| `preToolUse` on `Write` | Checks the file before the write, and denies a proven problem. |
| `afterFileEdit` | Checks the edit after the write, and keeps each problem for the `stop` hook. |
| `beforeShellExecution` | Checks commits, PR bodies and issue bodies. |
| `beforeMCPExecution` | Checks the issue writes of a Linear MCP server. |
| `beforeSubmitPrompt` | Counts the prompts of the user for the reply check. |
| `afterAgentResponse` | Keeps the last reply for the `stop` hook. |
| `stop` | Sends one follow-up message with the problems that the edit and reply checks found. |
| `sessionStart` | Adds the plan pointer. |

The hooks fail open. When the CLI finds no Node or Bun, or cannot read a payload, the action continues.

Two parts are not tested on Cursor yet. Cursor does not document the input of `preToolUse` for `Write`. When the CLI cannot read it, the `afterFileEdit` hook and the follow-up message are the only checks of an edit. The `additional_context` output of `sessionStart` is also not tested.

## Licence

astack is MIT. Some skills include text from pstack and mattpocock/skills. `NOTICE` and the skill licence files hold their credits.
