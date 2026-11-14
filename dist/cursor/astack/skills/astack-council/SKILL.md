---
name: "astack-council"
description: "Use for /astack-council or \"council\". One reviewer from each entry of the council members role reviews the work. The agent acts on the findings and loops until each reviewer agrees or the round cap ends."
disable-model-invocation: true
---

# Council

The council gets reviews or feedback on the request of the owner from several model families.
It loops until each seat agrees, and it keeps the scope small.

## 1. Prepare the code

- Before the review, answer the open PR comments. Use `references/comments-triage.md` of `astack-mode`.
- Fix the known issues.
- Run the relevant gates.
- Give the council the updated code. Do not keep a known fix until the reviews return.
- When the owner wants to replace the code with new ideas, skip the fixes to the code that goes away.

## 2. Seat the council

- Read the `council members` role in `astack-models.md`, which `astack-setup-models` writes.
- Each entry is one seat. Use the members that the owner names, when the owner names them.
- When the role is missing, use `opus` and `codex`. Report that the council has only two model families.
- The best council has one seat from each of three model families.
- Run an alias entry, such as `opus`, as a subagent with that model.
- Run an external entry, such as `codex:<model>`, through Bash.
- Use the read-only form of `../astack-arena/references/external-seats.md` for an external entry.
- A harness that runs models of other providers can run a seat with its own tools.
- Run each seat at high effort.
- When a seat cannot run, report it. Never put another model in its place.
- The fallback of the external-seats reference does not apply to the council.

## 3. Brief each seat

Give each seat the request of the owner and the context that it needs.
Give the checkout path, `BASE_SHA`, the head SHA and the diff command.
Run `git fetch origin`.
Record the base with `git merge-base HEAD origin/<base>` as `BASE_SHA`.
The diff command is `git diff <BASE_SHA>`.
For review or feedback, keep the seats read-only.

```text
Review only. Do not edit, commit, push, comment on PRs or start subagents.
Repo: <absolute path>  Base: <BASE_SHA>  Head: <head SHA>  Request: <request of the owner>
Read: git diff <BASE_SHA>. Read the code around the change.
Find bugs, broken callers and gaps against the request. Flag code that the request does not need.
Reply with a score out of 10, then one line for each finding:
S1 [blocker|should|nit] <file>:<line> <claim>. Fix: <suggestion>
```

## 4. Act on each result

- Start all seats in one message.
- Do not wait idle. When a result arrives, examine its findings against the code at once.
- Decide what to fix while the other seats run.
- Make no edit while a seat still reads the same checkout.
- Each finding is a candidate. Reproduce it before you fix it, as the Authority rule of `astack-pr-review-hardening` says.
- Give each fix its own commit with the check that fails without it, as `astack-coding-rules` says.
- The owner can mark a seat as non-blocking. Do not wait for that seat.
- Treat a late result of a non-blocking seat as feedback. Record no score for it.
- Collect the useful findings, the disagreements and the next steps.

## 5. Loop and keep the scope small

- For a code review, ask each seat for a score out of 10.
- One full review pass of all seats is one round. A new review after fixes starts a new round.
- When you agree with a recommendation, make the change. Then ask for a new review.
- Loop until each seat agrees with the outcome.
- The default cap is 3 rounds. The owner can set a different cap.
- At the cap, report each disputed item to the owner. Show both sides in 2 or 3 lines each.
- Fight scope growth. Decline growth with a reason, and list it as a follow-up.

## 6. Report the rounds

Write the results as this table:

```markdown
## Council review

Rounds: 2

| Seat | Round 1 | Round 2 |
| --- | --- | --- |
| opus | 7/10 | 9/10 |
| codex:<model> | 8/10 | 10/10 |
```

When a seat gives no score, write `no score`. Never invent a score.

- When the work has a PR, post the table as one PR comment through `astack-leaving-pr-comments`.
- In the PR body, add one bullet to `## Verification` with the final scores and the link of that comment.
- Keep the rounds out of the PR body, as `astack-write-docs` says.
- When the work has no PR, put the table in the final reply only.
