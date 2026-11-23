# 0009. astack adopts tstack as a frozen upstream and owns the text of its nine skills

Status: Accepted
Date: 2026-11-14
Ticket: none
Supersedes: none

## Context

tstack is an MIT set of nine agent skills by Theo Browne, at `https://github.com/t3dotgg/tstack`.
Its skills take a change to a merged PR, watch a PR, file a PR, review with other model families, and format agent comments.
astack already has most of the machinery under other names.
Examples are the Babysit and Shipping playbooks, `references/create-pr.md`, `astack watch-pr` and the merge guard.

tstack also uses tools of one harness, names vendor models, and ships a Python watcher `pr-wait`.
ADR 0001 D1 to D3 and ADR 0003 D2 set how astack takes in an upstream.
The tstack words "full send" give no merge grant to `src/astack/pr/grant.ts` without a change, because they hold no merge word.

## Decisions

### D1. tstack enters as a frozen upstream, as pstack and flow did

`upstream/tstack/` holds the snapshot of commit `11e37a74d0a6868c121cd0910ab2b3bd9873b92a`, and `upstream/lock.json` pins it.
No script syncs it, and only the tests read it (ADR 0001 D2 and D3).
astack rewrites each skill in its own style.
`SKILL_ORIGINS` in `scripts/lib/upstreams.ts` credits tstack, and `NOTICE` keeps its MIT notice (ADR 0003 D2).

### D2. The nine skills keep their tstack names

`babysit-pr`, `file-pr`, `leaving-pr-comments`, `modernize` and `takeover` are skills that the model can start.
`council`, `full-send`, `full-stop` and `sol-loop` set `disable-model-invocation: true`, so only the user starts them.
Another skill reads a user-only skill by path with `astack skill-path`, and never through the Skill tool.

### D3. Each skill runs the astack machinery by path, and astack ships no second watcher

Each skill points to the playbook or reference that already does the step.
Examples are `playbooks/babysit.md`, `references/create-pr.md`, `playbooks/shipping.md` and `astack:pr-review-hardening`.
A skill adds only the tstack rules that astack lacks.
When a tstack rule goes against an astack rule, the astack rule wins.

astack does not ship `pr-wait`. `astack watch-pr` stays the one PR watcher.
The port of the useful `pr-wait` features to `astack watch-pr` is a follow-up.

> Note 2026-11-23: No ticket tracks the port of the `pr-wait` features. `astack watch-pr` stays the one PR watcher.

### D4. An un-negated "full send" clause is a merge grant for the current prompt

The merge guard reads a "full send" clause with no negation as a merge grant of kind `any`.
The grant holds for the current prompt only, as each other merge grant does.
The words "full stop" never give a merge grant.
A prompt with "full stop" gives no full-send grant. A prompt with a clause that names the merge but grants no merge, such as "do not merge" or "I will handle the merge", gives none too.
The typed words grant only as a bare instruction, such as "full send" or "ok, full send this PR". A clause with other words, such as "fix full send", or a question gives no grant. A clause with a negation, such as "not yet", withholds the grant of the whole prompt. The command form, such as `/astack:full-send`, grants only at the start of the prompt. Elsewhere it follows the rules of the typed words.

> Amended 2026-11-22: The four proof sections of D4 moved to [the session guard proof record](../../formal/SessionGuards.md). They said that only a merge word or an un-negated "full send" clause of a person's prompt gives a merge grant. An ordinary reference to D4 needs no proof section.

> Note 2026-11-22: The merge guard now enforces the rule that the full-stop procedure never merges. A prompt from each source starts the full-stop run with `/astack:full-stop` at its start, or with "full stop" as its only instruction. Then the guard keeps a full-stop record and denies each `gh pr merge`, also with a standing grant. `--disable-auto` passes, and only the next prompt of a person removes the record. With no path for the record, a standing grant merges nothing. A "Full stop." after other instructions can be only emphasis, so it starts no run. In the model, `ModeOf` and `StartsFullStop` give `fullStop` only for that prompt, and `PromptGrant` drops the full-send grant of a prompt that withholds it.

### D5. Skill text names no vendor model

`council` takes its seats from the `council members` role of `astack:setup-models`.
`sol-loop` takes its reviewer from the `sol-loop reviewer` role.
Both roles accept external seats, and `arena/references/external-seats.md` runs them.
A missing seat is a reported blocker. The skill never puts another model in its place.

### D6. Each PR comment that an agent posts for the owner carries an attribution note

`astack:leaving-pr-comments` puts a GitHub note callout at the top of each such comment.
The note names the model and the GitHub login of the owner.
The skill reads the login from `gh api user` at run time and never stores it.
A PR body, a commit message and text that the owner asks to post word for word get no note.

## Consequences

- Easier: the owner gets the tstack trigger words with the astack gates, hooks and stops.
- Easier: one watcher and one merge path stay, so the rate limit and the merge guard see one actor.
- Harder: astack does not get tstack fixes for free. Someone copies a useful change by hand.
- Harder: a comment of an agent now has a fixed header. A repo that treats a PR comment as a client message keeps that owner gate.
- Follow-up: port the required-check, advisory-bot, behind-count and comment-event features of `pr-wait` to `astack watch-pr`.

## Alternatives considered

- Install tstack beside astack with no rewrite. Rejected because two rule sets then give different merge, push and watcher rules for the same PR.
- Ship `pr-wait` as it is. Rejected because it adds a Python runtime and a second watcher, and no astack test covers it.
- Require "full send, merge when green" for a merge. Rejected because the owner says "full send" to mean the whole path to a merged PR.
- Name the vendor models in the skills. Rejected because a model rename then makes the skill text wrong, and the role lines already hold the choice.
