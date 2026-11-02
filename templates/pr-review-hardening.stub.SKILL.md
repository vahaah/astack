---
name: pr-review-hardening
description: Harden this branch or pull request before merge with the review and fix loop, using this repo's settings in .claude/pr-review-hardening.profile.md. Use when asked to harden a PR or to run the review loop.
argument-hint: "[base-branch] [--pr <number>]"
---

# PR review hardening

This repo's settings for the loop live in `.claude/pr-review-hardening.profile.md`. Change the loop's behaviour there, not here.

astack apply writes this file and `FALLBACK.md`. Fix them in the astack repo. Then apply them again. A skill wins over a command file with the same name, so `/pr-review-hardening` runs this skill, and the repo keeps no command file for it.

## Run the loop

If the Skill tool lists `astack:pr-review-hardening`, invoke it with the arguments `$ARGUMENTS` and follow it. Stop here. Never read `FALLBACK.md`.

Otherwise read [FALLBACK.md](FALLBACK.md) in the folder of this file, and run the loop that it holds. The arguments of the run are `$ARGUMENTS`.
