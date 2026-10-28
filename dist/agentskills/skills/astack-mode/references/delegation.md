# The delegation grant

The owner gives a grant with "go", "do your recommendation", "use your recommendation" or "use best practices and our previous decisions". The word "ultracode" after the grant also asks for workflows where they help.

## Record the grant

1. When a plan is active, write `delegate: on` to its frontmatter at once. Commit it with the next commit of the plan.
2. With no plan, keep the grant for the session, and say so in one line.
3. The grant lasts for the session. A resume reads `delegate: on` from the plan and keeps the grant.
4. "ask me", "stop deciding" or the end of the plan ends the grant. Write `delegate: off`.

## Decide under the grant

- Decide each agent call yourself. An agent call is a fact, a design fork that a prototype can settle, or a choice that the code or the tests can show.
- Decide an owner call only when one option is clearly best. Record the row as `delegated`, with the reason and the evidence in one sentence.
- When an owner call has no clear best option, apply the recommended default. Record it as `default`, and queue the question for the next attended turn.
- Do not ask "should I continue?". Continue to the next step.

## The owner gates

The grant never covers these. Stop and ask the owner:

- Accounts, secrets and paid infrastructure.
- Writes to production data with no grant in the profile.
- Destructive resets, a force-push to a shared branch and an `--admin` merge.
- A merge with no grant from the profile or from the owner in this turn.
- Money, legal sign-off and a message to a client.

## Checkpoints under the grant

- `checkpoints: report` is the default. Post the checkpoint package as a PR comment. In chat, give 6 lines or fewer with the link, and continue.
- `approve` applies only to a step whose Checkpoint column says `approve ui` or `approve one-way`. Use it for UI taste and for a one-way door. Stop there until the owner answers.
- When the owner sends "go" twice in a row with no other words, offer `checkpoints: report` in one line.
