---
name: interrogate
description: "Use for \"interrogate\", \"adversarial review\", \"multi-model review\", \"challenge this\", \"stress test this code\", \"find blind spots\", or \"tear this apart\". Independent model reviewers challenge changes, and the lead returns a verdict."
disable-model-invocation: true
---

# Interrogate

Start one reviewer for each configured model to challenge the code independently.
Use model diversity rather than assigned personas for different perspectives.
Return a synthesized verdict.
Never apply changes automatically.

## Step 1, Scope

Choose the review scope from context:

- Use files or a diff that the user names.
- On a feature branch, use `git diff origin/main...HEAD` or the appropriate fetched base.
- For a reference to recent work, gather the relevant files.

Include the diff or file contents and surrounding files needed to understand them.

## Step 2, Intent

Before you start reviewers, state the intent in one clear paragraph.
Use the user's message, commit messages, any PR description and the code.
If intent is unclear, ask the user before proceeding.

## Step 3, Spawn Reviewers

Launch all reviewers in one message.
Use one reviewer for each `interrogate reviewers` entry in `astack-models.md`.
Label them Reviewer A, B and onward in entry order.
If the rule or line is missing, use these defaults:

| Subagent | Default model |
|----------|---------------|
| Reviewer A | `opus` |
| Reviewer B | `codex` |

Every reviewer is read-only.
It can read code and run read-only commands, but never edit files.
State that limit in the prompt.

For `opus`, `sonnet`, `haiku` or `fable`, use Agent with `subagent_type: general-purpose`.
Set `model` to its configured entry, or its table default when the line is absent.
For `auto` or `inherit-parent`, omit `model` to inherit the parent.
Run an external entry such as `codex` in read-only form through Bash.
Follow `${CLAUDE_SKILL_DIR}/../arena/references/external-seats.md`.
Start it in the same message as the Agent calls.

If an external CLI is missing, signed out or fails, use `sonnet` for that reviewer.
Report the fallback.
For another unsupported entry, such as another tool's model slug, use Reviewer A's default.
Report that fallback too.
Never apply either fallback to an alias entry.
Do not block review for a model issue.

Read `references/reviewer-prompt.md`.
Fill the same template for each reviewer with intent, diff or files, `references/rubric.md` and `references/code-quality-review.md`.
Match effort to the job with the Subagents section of **mode** at `${CLAUDE_SKILL_DIR}/../mode/SKILL.md`.

## Step 4, Synthesize

Read and parse every returned finding.
Merge findings that describe the same defect.
Record which models raised each finding.
Independent agreement by two or more models gives the strongest signal.
Still examine a lone finding, with its lower agreement weight.
Record disagreements, including explicit contradictory verdicts.
Use them as context for your judgment.

## Step 5, Lead Judgment

Act as the lead reviewer with knowledge of the actual work.
Read `references/lead-judgment.md`.
Put each finding in one of four groups.
Name the models that raised it and give a one-line rationale.

- Act on means a real correctness, security or maintainability issue for the actual goal. It would block a real PR.
- Consider means a valid concern whose benefit may not outweigh its current fix cost. Show the tradeoff to the user.
- Noted means a valid but unactionable concern, including premature optimization or low current impact.
- Dismissed means a wrong finding, a nit or a claim missing context. Give the rejection reason.

## Output Format

### Intent
> [The stated intent paragraph from Step 2]

### Reviewers
- Reviewer [label]: [model name], [N findings] (one bullet per reviewer)

### Act On
[Each: description, which models raised it, why it matters.]

### Consider
[Each: description, which models raised it, the tradeoff.]

### Noted
[Brief list.]

### Dismissed
[Each with a brief rationale.]

### Agreement Map
[Where models agreed and diverged, and what that pattern tells us.]
