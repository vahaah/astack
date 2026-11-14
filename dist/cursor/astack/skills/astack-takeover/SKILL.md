---
name: "astack-takeover"
description: "Finish the PR, branch or agent thread of another person or agent, and keep their credit. Use when the owner asks you to take over a PR, a branch or a thread."
---

# Takeover

Take on the original goal and finish it.
Keep the credit of the first contributors.
Do not defend code only because another agent wrote it.

## 1. Rebuild the state

Follow steps 1 to 3 of the Session pickup playbook of `astack-mode`.
Read it at the path that `astack skill-path astack:mode playbooks/session-pickup.md` prints.

- Read the source PR, branch or thread. Include the review findings and the later corrections of the owner.
- For a thread of another agent, read its transcript or its remote session.
- Map the hand-off to the real code and the current head.
- Account for each uncommitted change.
- Treat the hand-off as context, not as proof.

## 2. Choose the continuation

- By default, open a replacement PR.
- Put the original commits on a new branch with `git cherry-pick`, or start the new branch at the original head.
- Add your fixes as separate commits.
- When the owner asks for a continuation in place or on a stack, do that instead.
- Never overwrite unrelated work.
- The original PR is the work of another person. Change, close or merge it only with the permission of the owner.

## 3. Keep the credit

- Keep the git author of each original commit and its co-author trailers.
- Add a `Co-authored-by:` trailer only for an identity that `git log` shows. Never guess an email.
- In the `## Why` section of the PR body, name the original authors in one sentence. Link the original PR there.
- When the merge squashes the PR, copy the human author and co-author trailers into the squash body.
- An attribution of a model does not replace the credit of a contributor.

## 4. Finish the goal

- Update the continuation branch with `astack-modernize` against its intended base and the current design.
- A forced update of the original PR branch needs the permission of the owner.
- Change only what the goal needs. Add no unrelated feature.
- Simplify the code, but keep each intended behavior and surface.
- Read the source PR again before you file. It can change while you work.
- Run the gates and `astack check proof` as steps 3 to 5 of `astack-coding-guide` say.
- Reproduce the original failure yourself, and walk the real workflows as a real persona.
- Green mocked tests do not prove the user experience.
- List each claim that stays unproven in the `## Verification` section.

## 5. File and watch

- When the finish includes a PR, file or update it with `astack-file-pr`.
- Then watch it with `astack-babysit-pr`. Do not stop when the PR opens.
- Post each reply through `astack-leaving-pr-comments`.

## Report

Say what you inherited and what you changed.
Say how you proved the change and how you kept the credit.
Name each decision that remains for the owner.
