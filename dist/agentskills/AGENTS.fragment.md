<!-- astack 0.1.0 -->
# astack

These rules apply in every session. A stricter repo rule wins, then astack. `/astack-mode` routes the work and does the next step.

## Routes

| Owner words | Route |
|---|---|
| "I am building X", a ticket key | `/astack-plan`. S0 asks for the goal and the one decision the work drives. Grill rounds follow |
| `/plan` | Plan mode, concise, unresolved questions last. With "I am building", run `astack-plan` in plan mode. After approval, first write `docs/plans/<slug>.md` |
| `/grilling` | `astack-grilling` on the frontier. One recommendation and lettered options for each question |
| "go", "do your recommendation", "use best practices and our previous decisions" | A delegation grant. Write `delegate: on` in the plan. "agree", "next" and "approve" continue |
| "resume" | Mode playbook `resume.md`. Read the plan, the tracker and git, then continue from the next step |
| `/goal`, "continue the board" | Programme tier and the `astack-mode` Orchestrate playbook. 5 sessions at most. Merge the open PRs first |
| a hotfix, "I need it fast" | Quick tier. One grill round at most |
| a bug, an error report, a tester report | The `astack-mode` Bug fix playbook and `astack-diagnosing-bugs`. Write `Root cause: X because Y` before the fix |
| "comments", "check github comments" | Mode playbook `comments-triage.md` |
| `/pr-review-hardening` | `astack-pr-review-hardening`. The profile sets the cap and the minimum. The default cap is 2 |
| "create pr" | Mode playbook `create-pr.md`. Then one hardening run when the profile sets it |
| "update from main" | Mode playbook `refresh.md` |
| "merge", "merge when green" | The `astack-mode` Shipping playbook. A merge needs a grant from the profile or from this turn |
| UI polish, mobile | `astack-control-ui`, a walk as a real persona, the repo UI kit |
| "pause", "prompt for next session", "clean worktrees" | The `astack-mode` Pause safely playbook (a hard stop), the hand-off prompt, the `astack-mode` Worktree cleanup playbook |

A user rule in the rules folder can add routes, and it never removes one. Find a mode playbook with `astack skill-path astack:mode references/<name>.md`, and read it.

## Standing rules

- Autonomy. Push after green gates. Open and update PRs. Merge only with a grant from the repo profile or from this turn.
- Owner gates. Stop for accounts, secrets, paid infrastructure, production data writes with no grant and destructive resets. Stop for a force-push to a shared branch, an `--admin` merge and a message to a client.
- Questions. Ask only the calls that belong to the owner. Give each one a recommendation and lettered options. "agree" accepts all of them. Never ask for a fact. Ask for owner-only inputs one at a time.
- Delivery. One plan is one PR. A PR can serve more than one ticket. Split a PR only when the owner says so. Put follow-ups in the open PR.
- PR text. Write `Part of <key>` on the first line when the repo profile asks for it. Never put a key or `#n` after a closing word.
- Proof. Report gate counts. Walk the journey as a real persona. Measure before you make a claim, and open each file that you cite. A zero result needs a positive control.
- State. The plan, the tracker and git hold the state, never a transcript. Record `git status --porcelain` and `git stash list` before a fan-out.
- Replies. Write every reply in ASD-STE100 Simplified Technical English, also short and simple replies. Give the result first. Do not repeat agreed items. A checkpoint reply has 6 lines or fewer.
- STE. Use 20 words or fewer in an instruction and 25 or fewer in a description. Use the active voice and one instruction in each sentence. Do not use contractions, semicolons, long dashes, "e.g.", "i.e.", "etc." or "and/or". Write "make sure", not "ensure", and "use", not "utilize". Keep code, paths and names as they are. Quote text that is not yours. Put a cited title, a log line, a header value and the user's words in backticks or double quotes.
- Repair. Fix a broken skill or rule in astack, never in a project copy.

# Coding

When the astack plugin is installed, load `astack-coding-rules` before you write, change or review code. The session that owns the ticket also loads `astack-coding-guide` and runs its daily workflow in order, from `/astack-plan` to the merged PR.

These rules hold in every repo, with or without the astack plugin. A stricter repo rule wins. Tickets follow `/astack-write-ticket`, and docs and PR bodies follow `/astack-write-docs`.

## Change

- Plan work that needs a decision before code with `/astack-plan`, and build its `now` session with `astack session start <plan>`. When that PR merges, run `/astack-plan <slug>` before you build the next session.
- Make the smallest change that meets the acceptance criteria. Put what you find outside the scope fence, the files the change must edit, in a ticket.
- Match the repo's code patterns, but never copy its comments. Finish someone else's migration only on lines you already change. When you replace an internal API, move every caller and delete the old one in the same PR. When that is too wide for one PR, plan it with `/astack-plan` as expand, migrate, contract.

## Root cause

- Reproduce the failure first, then fix its cause and every instance of the same pattern inside the scope fence.
- These are not fixes: a guard where it crashed, a catch that swallows the error, `as any`, `!` and a suppression. A retry, a sleep, a longer timeout, a skipped test, a weaker assertion and a regenerated snapshot are not fixes either.

## Types and edges

- Parse data where it enters the system: requests, env, files, database rows unless generated types are checked in CI, third-party responses. Trust the types inside.
- Use `unknown`, not `any`. Do not cast or write `!`. Parse, narrow, or check with `satisfies`. Derive types from the schema that owns the shape.
- Model alternatives as a discriminated union, and end each switch on it with a `never` check. `astack-types` holds the full type and FP rules.
- Keep business rules in pure functions. Do I/O at the edges.

## Reader load

- Inline a wrapper with one caller, an adapter with one implementation and no test fake, and a pass-through layer. Keep a layer that a repo test or lint enforces.
- Keep one source of truth per value, in tests too. If a name needs a comment, rename it.

## Tests and gates

- Call the code as its users do and assert the exact result. A test that still passes when the subject returns `undefined` is wrong. Put intent in the test name.
- Write a test only for a behaviour that a plausible defect breaks and that no other test guards. Test one case for each equivalence class, plus its boundaries, not one row for each member of a class. A small module needs a few tests, not dozens.
- Do not test what the compiler, a schema or the framework guarantees. Do not test a restated constant, a getter, a pass-through or a type guard over each member of a union. Delete a test that cannot fail for a real defect.
- A mutant that survives needs a new test only when a developer can make that defect by mistake. A reviewer who asks for a test names that defect.
- A bug fix starts with a check that fails for the reported reason. Use a test when a cheap, correct seam exists, else a script or a saved transcript of the failing run. A review or hardening finding follows the same rule. Run the failing check before the fix. Record its output. Then commit the test or script together with the fix, so every commit is green. The PR's Verification shows the failing run first, then the passing run. Each finding owns its commits. No commit holds two findings. Never commit a transcript. A feature slice starts with a failing test at a seam the plan, the ticket or the user agreed. With none agreed, ask the user, or when nobody can answer, take one from the ticket and name it in the PR or your report.
- Run the repo's gates: lint, typecheck, tests, and doc checks where present. Report what ran, with counts, and what did not.

## Comments

- The comments rule decides which comments stay. Never shorten a comment to pass the hook.
- A kept comment takes at most 2 lines, or 12 for a doc comment on a public API. A legal or license header keeps its full text and has no length limit. The comment hook passes the license headers that the astack README names. A public API is an export that other packages import from its package's entry point, or an HTTP or RPC route that clients call. Put a longer reason in a name, a type, a test or an ADR.

This section applies to files that match `**/*.ts`, `**/*.tsx`, `**/*.mts`, `**/*.cts`.

# TypeScript and TSX

Parse incoming data with the repo's schema.
Derive types from that schema.
Narrow alternatives through a discriminant and finish with `never`.
Handle missing indexed values explicitly.
Keep effects outside pure rules.
Use the TypeScript checklist in `astack-code-review` for reviews.

This section applies to files that match `**/*.sql`.

# PostgreSQL

Apply this SQL section only when the repo uses PostgreSQL.
Enforce data invariants with database constraints.
Use parameters for values and explicit transaction boundaries.
Plan migrations around table locks and rollout order.
Test tenant access with the affected roles.
Use the PostgreSQL checklist in `astack-code-review` for reviews.

<!-- /astack 0.1.0 -->
