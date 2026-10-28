---
name: retro
description: "Review a coding session and propose evidence-based improvements to the agent environment."
disable-model-invocation: true
metadata:
  origin: mattpocock-skills
---

# Retrospective

Find changes to the agent's environment that would improve future coding sessions.
Present evidence for each proposed improvement.

## Read the session

Load `astack:writing-for-agents` with the Skill tool for its writing rules.
Read primary sources for the session that the user names.
If no session is named, use the current one.

Read only this workspace's transcripts under `projects/<workspace slug>/` in the active Claude config directory.
Do not search all projects.
Other folders contain unrelated private sessions.

## Find improvements

Consider each category against actual session evidence.

### Navigation

Check how the agent found required files and hidden dependencies.
If that took too long, propose a pointer to the source it missed.

### Automated checks

Read the `lint` and `check` scripts in `package.json` and the repo's CI workflow first.
Check whether a rule, type check, test, or filesystem check could catch the mistake.
If the check already exists but is disconnected or broken, report that defect.
Do not propose a duplicate.

A repo without a pre-commit hook or CI job for its checks has a missing control.
Report that gap even if this session made no matching mistake.

### Coding standards

If a reviewer missed a defect, classify it before you propose a rule.
A fixed syntax pattern, forbidden API, import shape, or file-location rule needs a deterministic check.
Choose the cheapest suitable repo lint rule, pre-commit hook, or CI job.
Prefer that check over prose instructions.

Use a file under `.claude/rules/` for judgment that a mechanical check cannot replace.
Examples include consistency across files and a requirement to match surrounding style.
Keep one line per rule and show an example of the failure.

### Global instructions

If repo or global `AGENTS.md` has grown large, find rules that belong in standards or automated checks.

### Tool cost

Find expensive tool calls and avoidable output.
Check whether a CLI or MCP can return the needed evidence with less context.

### Ineffective instructions

Find steering instructions that do not change the agent's default behavior.
Consider this when instruction files are large or hard to use.

### Information access

Identify missing evidence that blocked the agent.
Examples include saved dev-server logs and read-only access to external services.

## Present candidates

Order proposed improvements by severity.
For a mistake repeated across sessions, suggest `/astack:correct` when astack is installed.
Otherwise suggest a rule in the repo's `CLAUDE.md`.
For a skill change, suggest `/astack:reflect` when astack is installed.
Otherwise describe the edit.

## Separate implementation and review

Implementation requires exploration, code changes, and failure diagnosis.
It puts more pressure on the agent's context.
A reviewer starts with the diff and usually needs fewer changes or debugging steps.
Give the reviewer responsibility for enforcing coding standards.

## Choose the right file

- `CLAUDE.md` and `AGENTS.md` enter every agent's context.
  Use them sparingly, mainly for pointers.
- `.claude/rules/*.md` holds judgment rules, one line each.
  `astack:code-review` reads them on its Standards axis.
  If the rules exceed 1,000 lines, add pointers to docs instead.
- Docs hold reference material.
  Find existing docs before you create another one.
- Skills hold discoverable docs or user-invoked commands.
  Their descriptions enter the agent's context.
  Follow `astack:writing-for-agents`.
