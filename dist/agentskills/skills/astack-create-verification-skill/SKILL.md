---
name: "astack-create-verification-skill"
description: "Create a project-local verification skill for real app behavior. Use for /astack-create-verification-skill or a missing UI, CLI, or service driver."
license: "MIT"
metadata:
  astack-version: "0.1.0"
  source: "astack, adapted from pstack"
  disable-model-invocation: "true"
---

# Create a verification skill

Create a project-local skill that starts the real app, drives a user path, and captures proof.
Write it for an agent that opens the repo without prior context.
The target directory is `.claude/skills/verify-<app>/`.

## 1. Inspect the repo

Answer these questions from source.
Ask the user only for facts that you cannot observe.

- What does the user touch: a web UI, terminal, desktop app, API, mobile app, or library?
  If several apply, choose the primary interface and record the others.
- What command starts the app locally?
  Prefer package scripts, a Makefile, or the README.
  Record ports, environment variables, seed data, and auth.
- What can drive the app?
  Find Playwright or Cypress specs, expect scripts, PTY helpers, HTTP endpoints, or a debug port first.
- What proof can the driver capture?
  Check screenshots, terminal transcripts, response bodies, logs, exit codes, and database state.
- Can two instances run with separate ports, data directories, and profiles?
  If not, document that limit.
  Do not drive the same shared instance from two runs.

After existing drivers, check available session tools.
Use `astack-control-ui` for web and Electron.
Use `astack-control-cli` for CLIs and TUIs.
Use argent MCP tools for iOS, Android, and Chromium apps.
Name a tool in the generated skill only when this session has it.
Give a generic recipe beside that tool.

When no existing driver fits, choose a generic recipe.
Use browser or CDP control for web and Electron.
Use tmux or a PTY for terminals and plain HTTP for services.

If the checkout cannot build or start, fix that first or report the exact blocker.
Do not generate instructions against a broken base.
The skill may create an irrelevant missing asset that blocks startup, such as a sample config or unused static directory.
Mark it as temporary verification setup and remove it during cleanup.

## 2. Generate the skill

Write `.claude/skills/verify-<app>/SKILL.md`.
Set YAML frontmatter with `name: verify-<app>`.
Its `description` names the app, its user interface, and when to use the skill.
Without frontmatter, the skill does not register.

Fill every section from the repo inspection.
Leave no placeholders.

### Launch

Give the exact command and a readiness signal, such as a log line or prompt.
Start from an empty data directory.
Include migrations, seed data, and teardown.
Ready means a user can use the app.
A database health check can pass before initialization scripts finish.

For a short-lived CLI or TUI, build the binary or install dependencies once.
Start each drive in its own isolated PTY or tmux session.
Do not invent a server that must stay alive.

### Doctor

Give one read-only check that determines whether the instance is fit to drive.
Check the process, version or build, owned port, and valid auth.
Run this check first when behavior looks wrong.

### Drive

Give exact commands and selectors from this repo.
Prefer ARIA labels, data attributes, prompt strings, and route paths over coordinates or tab order.

### Evidence

Name the proof to capture and its storage location.
Drive the real user path.
Do not replace it with internal setters or test-only endpoints.
Capture the action and resulting state.
A final screen alone does not prove the action.
Check side effects such as files, rows, or messages as well as visible state.
Use mocks only where a production boundary already isolates the external system.

For a dry-run or test mode, observe the files, network, and git refs that it skips.
Do not trust the mode's name.
Some dry-runs still contact a service or open a browser.

### Cleanup

Stop only instances that the run created.
Never kill by process name.
Remove instances and scratch state, while keeping evidence at the named location.
Proof artifacts must survive cleanup.

### Helpers

Make each shipped helper executable.
Show its invocation in the skill body.
The next agent must not need to reverse-engineer a helper.

## 3. Seed the feature map

Write `.claude/skills/verify-<app>/features/README.md` and one file for each user-facing feature you identify.
Start with the top 3 to 5 features from routes, commands, menus, or docs.
Follow [`references/feature-map-example/`](references/feature-map-example/).

The README indexes the feature files.
Each file describes the feature, every user entry point, its driver recipe, and observable proof.
Keep these four H2 headings:

1. `Sub-features`
2. `How to get to it (user POV)`
3. `Driving it with <harness>`
4. `Gotchas`

If seed data lacks a journey's precondition, report the journey as failed.
Record the reason in that feature's `Gotchas`.
Never weaken the journey to obtain a pass.

The map is the maintained verification source.
One convenient entry point does not cover other entry points in the map.

## 4. Prove the generated skill

Run the instructions once from start to finish.
1. Launch the app.
2. Run doctor.
3. Drive one mapped feature.
4. Capture proof.
5. Clean up.
One feature is enough for generation.
Later runs use the map to cover the others.

After cleanup, check that the proof still exists at the named location.
If cleanup removes evidence, this step fails.
Fix a failed iteration and run its cleanup before the next attempt.
Leave no stranded process or port.
A skill that nobody executed remains a draft.

If you used a stand-in, list every setup step that the real target will not perform.
A container can stand in for a fresh VM, or a local stack for a remote one.
Those setup steps remain unverified until a run on the real target proves them.

## 5. Offer maintenance

Point to `/astack-maintain-verification-skill` for later map updates.
Suggest a cadence only when the user asks.
