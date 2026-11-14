---
name: "astack-leaving-pr-comments"
description: "Format each GitHub comment that an agent posts for the owner. Use before you post a PR comment, an inline review comment, a reply to a reviewer or a bot, or a dismissal reason."
---

# Leaving PR comments

Use this skill for each comment that you post on GitHub for the owner.
That includes a top-level PR comment, an inline review comment and a reply to a reviewer or a bot.
It also includes the written reason before you resolve or dismiss a thread.

Do not use it for a PR body or a commit message.
Do not use it for text that the owner tells you to post word for word with no attribution.
Do not use it for a comment in a machine format that another skill or a tool defines.
An example is the `proof.pr_comment` comment of `astack-pr-review-hardening`, which starts with its heading.

This skill gives no permission to post.
The owner gates of the rule card still apply, such as a message to a client.

## Start with the attribution note

Put this GitHub note callout at the top of each comment:

```md
> [!NOTE]
> 🤖 **<model> responding on behalf of <login>**

<reply>
```

- `<model>` is the public name of the model that wrote the comment, as the harness reports it.
- When the harness gives no model name, use the name of the harness. Never guess a model name.
- `<login>` is the GitHub login of the owner. Read it at run time with `gh api user --jq .login`.
- Never write a login from memory, and never store it in a file of the repo.
- Keep the attribution inside the note and the reply outside it.
- Start the context line with the robot emoji.
- Add no rule, heading, signature or second attribution.

The note is part of the posted comment, not astack text.
So the astack rule against emoji and bold labels does not apply to it.

## Write the reply

- Give the conclusion first.
- Cite the code, the behavior, the check or the reproduction that supports it.
- Keep it short. Leave out thanks, filler and status reports.
- Keep verified facts apart from judgment.
- Write it in STE. Follow `references/writing-the-reply.md` of `astack-mode`.

## Post it

1. Examine the full comment for secrets and private details. Include quoted text and attachments.
2. Read the final Markdown before you post it. Make sure that the quote lines and the blank lines render as you expect.
3. Write the comment to a JSON file with one `body` string. Never put comment text in a shell command.
4. Post a top-level PR comment with `gh api --method POST repos/<owner>/<repo>/issues/<pr>/comments --input <file>`.
5. Post a reply on a review thread with the reply call in `references/comments-triage.md` of `astack-mode`.
6. Make sure that GitHub returned the `html_url` of the comment.
7. Resolve a review thread only after its reply posted.
