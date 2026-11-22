---
name: pr-review-hardening
description: Harden this branch or pull request before merge with the review and fix loop, using this repo's settings in .claude/pr-review-hardening.profile.md. Use when asked to harden a PR or to run the review loop.
argument-hint: "[base-branch] [--pr <number>]"
---

# PR review hardening

This repo's settings for the loop live in `.claude/pr-review-hardening.profile.md`. Change the loop's behaviour there, not here.

astack apply writes this file. Fix it in the astack repo. Then apply it again. A skill wins over a command file with the same name, so `/pr-review-hardening` runs this skill, and the repo keeps no command file for it.

## Run the loop

If the Skill tool lists `astack:pr-review-hardening`, invoke it with the arguments `$ARGUMENTS` and follow it. Stop here.

Otherwise the astack plugin is absent, and this file holds no copy of the loop. Run no step of the loop. Tell the owner to install the plugin with this line in Claude Code, and then to start a new session:

```sh
{{install-line}}
```

The README of that marketplace repo gives the steps for Codex, Cursor and Grok Bot.
