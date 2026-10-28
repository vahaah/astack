# astack design

Status. Design v4, 2026-10-27.
This is the binding design for the source and its install builds.
ADR 0001 replaces the former port model with one astack plugin.
ADR 0002 requires a new first commit for the public source repository.
The accepted programme decision D3 publishes the source with its generated builds.

## 1. Identity

astack holds the owner's planning, coding, review, and writing rules.
One plugin named `astack` holds each kept skill and agent.
The source keeps MIT credits for the pstack and Matt Pocock text that an item retains.
`NOTICE` records those credits and the bundled package licences.
The build registry in `scripts/lib/upstreams.ts` maps each skill, agent, rule, and code module to its sources.
Rules and skill instructions carry no credit blocks or origin fields.

Claude Code, Codex, and Grok Build read the Claude plugin format.
Cursor uses flat skill names in its own plugin build.
Grok Bot and other Agent Skills clients use portable skills.
The entry point is `/astack:mode`, `$astack:mode` in Codex, and `/astack-mode` in flat builds.

## 2. Layout

The public repository holds source and generated install builds.
The private companion stays outside that repository.
The public history starts from a scanned tree with no private parent commit.

| Path | Content |
|---|---|
| `marketplace/plugins/astack/` | Plugin source, skills, agents, hooks, and launcher |
| `src/astack/` | CLI and hook implementation |
| `scripts/` | Build, apply, scan, and dist code |
| `rules/` | Shared rules and the generated rule card |
| `upstream/` | Frozen test data and licence evidence |
| `examples/companion/` | Synthetic companion fixtures |
| `dist/` | Generated builds for each client |
| `.claude-plugin/marketplace.json` | Generated source-root bridge to `dist/claude-code/astack` |
| `.cursor-plugin/marketplace.json` | Generated source-root bridge to `dist/cursor/astack` |
| `package.json` | Development commands and the `dist/cli/astack.js` CLI entry |

No script syncs or ports an upstream snapshot.
Copy a useful upstream change by hand as a normal astack change.
Never change a frozen snapshot.
The notice and build tests use those snapshots as evidence.

The build derives public package metadata from the astack plugin manifest.
It also writes the root licence, notice, and marketplace bridges.
The source package stays private to prevent an accidental npm registry publish.
Git dependency installs can still use its CLI entry.

`bun run dist` builds each client folder from the marketplace and rules.
The CLI bundles once for Node and includes its YAML dependency.
The native plugin build gets a content stamp so clients can identify a changed bundle.
Codex hook hashes stay pinned until a deliberate hook change.
The generated files remain in git for review.

Each flat build keeps reference files beside its skill.
The build registry records the origin of each skill that keeps upstream text.
The build emits the required MIT notices from those origins.
The catalog rewrite is complete and the STE exemption cap is 0.
The protected comment-rule quotations and licence text retain their upstream wording.
`src/astack/rules.ts` owns five shared rules and their installation and fragment selection.
The TypeScript/TSX and PostgreSQL packs have scoped text and shared review checklists.
Two optional read-only reviewers inherit their model and use only Read, Grep, and Glob.

The private companion holds project configs, machine settings, private rules, and deny lists.
Read commands use the synthetic example when no private companion path is set.
Write commands refuse that example.
The neutrality scan of a public candidate must use the real companion.
A secret scan also examines the complete candidate tree.

## 3. Hook and CLI architecture

One pure core serves every tool. Decoders and encoders sit at the edge.

```ts
type Tool = "claude-code" | "codex" | "cursor" | "grok-build"
type HookEvent =
  | { kind: "write"; path: string; before: string | undefined; after: string }
  | { kind: "edit"; path: string; before: string; after: string }
  | { kind: "shell"; command: string; cwd: string }
  | { kind: "mcp"; server: string; tool: string; input: unknown }
  | { kind: "prompt"; human: boolean; session: string }
  | { kind: "reply"; text: string; session: string; interactive: boolean; subagent: boolean; fresh: boolean }
  | { kind: "session-start"; cwd: string; attended: boolean }
type Verdict =
  | { kind: "allow" }
  | { kind: "note"; text: string }
  | { kind: "deny"; reason: string }
  | { kind: "continue"; prompt: string }
type Handler = { readonly id: string; readonly on: readonly HookEvent["kind"][]; readonly run: (e: HookEvent, c: Context) => Verdict }
decode: (tool: Tool, event: string, raw: unknown) => readonly HookEvent[] | undefined
combine: (a: Verdict, b: Verdict) => Verdict
encode: (tool: Tool, event: string, v: Verdict) => { stdout: string; stderr: string; exit: 0 | 2 }
```

- One dispatcher entry per event. The events are SessionStart, UserPromptSubmit, PreToolUse and Stop. astack never registers SubagentStop. Every entry runs `astack hook <tool> <event>`.
- The PreToolUse matcher is the fixed set `Edit|Write|MultiEdit|NotebookEdit|Bash|apply_patch|mcp__.*`. Routing lives in the CLI, so `hooks.json` stays the same byte for byte across releases. Codex ties hook trust to that hash.
- The decoder turns a Codex `apply_patch` into one edit or write event per file. A decode failure returns `undefined`, and the dispatcher allows (fail open).
- The handler registry is `src/astack/hook/handlers/*.ts`. `handlers/index.ts` lists the modules in one readonly array, with no dynamic load. The handlers are comments, types, ste-artifact, plan-file, ticket, pr-body, merge-guard, duplicate-pr, destructive, ste-reply, turn and plan-pointer.
- Deferred. The instruction-file and push-note handlers are not built yet. No hook enforces what they would check.

Quality hooks use `hooks.profile`, with `strict` as the default and `minimal` as the opt-out preset.
The `ste`, `types`, and `comments` booleans override that preset.
Invalid input retains strict checks and reports its field during validation.
The dispatcher filters only marked quality handlers before execution.
Every unmarked guard remains required.
The comment module honors disabled nested STE and the active type-suppression owner.
CLI and CI quality checks remain independent.
`docs/runbooks/hook-profiles.md` defines the overlap and private Cursor state.

- `combine` is a monoid. `allow` is the identity. `deny` absorbs `note` and joins the reasons. A property test proves the laws.
- The base encoder denies with exit 2 and the reason on stderr. Claude Code, Codex, Cursor and Grok Build all accept that form.
- Per-tool JSON adapters cover the rest. Claude Code notes use `hookSpecificOutput.additionalContext`. A Stop rewrite prints `{"decision":"block","reason":...}` with exit 0, because Codex runs the same `hooks.json` command as Claude Code, and both read that form. Cursor stop prints `followup_message`. Cursor permission events always print valid JSON, so fail open prints `{"permission":"allow"}`. The launcher prints the same when it finds no runtime, or when the CLI prints nothing.
- The command registry is `src/astack/cli/commands/*.ts`. Each module exports `{ name, summary, usage, run }`, and `commands/index.ts` lists them. The commands are `hook`, `check <comments|types|ste|ticket|pr|plan|migrations|stack-config|ci-pins>`, `plan`, `plan-ticket`, `session`, `board`, `skill-path`, `doctor` and `print`.
- Deferred. The `release`, `gates` and `ste` commands are not built yet. Section 5.5 describes `release`, and section 9.1 describes `ste review`.
- The CLI stays pure toward trackers. It never holds a Linear or GitHub credential. Reads come as tracker JSON on stdin. Writes come out as a typed write plan that the skill runs through the Linear MCP or `gh`.

The POSIX sh launcher `bin/astack` finds a runtime in a fixed order. It tries `$ASTACK_RUNTIME` first, then the path saved in `~/.local/state/astack/runtime`, then `node` and `bun` on PATH. Then it tries fixed paths, which are `/opt/homebrew/bin/{node,bun}`, `/usr/local/bin/{node,bun}`, `~/.bun/bin/bun`, `~/.volta/bin/node` and each `~/.nvm/versions/node/*/bin/node`, newest first. A GUI host often has only `/usr/bin:/bin` on PATH, so the fixed paths matter. It skips a node older than version 22, the engines floor. It follows a link to itself, so a link on PATH finds the bundle. A `bin/package.json` with `"type": "module"` sits beside the bundle, so a cache copy with no parent `package.json` loads it as an ES module. With no runtime, the launcher prints one advisory on stderr and allows. It reports the missing runtime before allowing.

`astack doctor` is read-only, and it exits 1 on a failure. For each installed tool it reports the runtime, or a failure when the tool finds none. `astack doctor --save-runtime` writes the runtime path.
- It prints the lowest enforcement rung of each tool (section 10), the rule card link and size, and the parsed profile of the current repo.
- It fails on duplicate plugin copies and on duplicate skill names in `~/.agents/skills` or in the skills folder of a profile. It fails on untrusted Codex hooks, and on trusted hashes that are not the pins in `codex/hooks.trust.json`. It fails on output-style plugins that are on and on a runtime older than node 22. It also fails on a profile with astack and no rule card link.
- It notes Stop hooks of other plugins with their effect on the rewrite, and a cache copy that differs from the marketplace source in `dist/`.

## 4. /astack:mode and the rule card

Mode routes work through its astack playbooks and references. A stricter repo rule wins, then astack. With no argument, mode reads the plan, tracker, and git state, then selects the next step.

The route table lives in the always-on rule card `rules/astack.md`, so natural words route with no mode call. It uses the names that the owner types. A rule of the user in the rules folder can add routes, and it never removes one.

| Owner words | Route |
|---|---|
| "I am building X", a ticket key | `astack:plan`. S0 interviews for the goal and the one decision the work drives. Grill rounds follow |
| `/plan` | plan mode, concise, unresolved questions last. With "I am building", `astack:plan` runs inside plan mode (section 5.3) |
| `/grilling` | `astack:grilling` over the frontier. One recommendation and lettered options per question |
| "go", "do your recommendation", "use best practices and our previous decisions" | a delegation grant, `delegate: on` (section 5.2). "agree", "next" and "approve" continue |
| "resume" | session pickup from the plan, tracker and git |
| `/goal`, "continue the board" | programme tier, `astack board`, the `astack:mode` Orchestrate playbook, 5 sessions at most. Drain open PRs first |
| hotfix, "I need it fast" | quick tier, one grill round at most |
| bug, a Sentry issue, a tester report | The `astack:mode` Bug fix playbook and `astack:diagnosing-bugs`. Write `Root cause: X because Y` before the fix |
| "comments", "check github comments" | the full triage. The `astack:mode` Babysit playbook with a bugbot-triage posture. Decide who is right, fix or dismiss with a reason, resolve threads, fix CI |
| `/pr-review-hardening` | `astack:pr-review-hardening`. Cap and minimum from the profile, default cap 2. A blocking finding names a concrete failure |
| "create pr" | gates, deslop, no-comments, an STE body, the profile PR rules, push. Then one hardening pass where the profile says so (Q6) |
| "update from main" | mode playbook `refresh.md`. Merge origin/main, rerun gates, read new ADRs and migrations, compare the D rows with the ticket intent |
| "merge", "merge when green" | The `astack:mode` Shipping playbook. Authority from the profile or a grant in this turn |
| UI polish, mobile | control-ui, a persona walk, the repo UI kit, argent on mobile |
| "pause", "prompt for next session", "clean worktrees" | The `astack:mode` Pause safely playbook (hard stop), `astack session handoff`, Worktree cleanup |

The card also holds the standing rules. They apply without the mode.
- Autonomy. Push after green gates. Open and update PRs. Merge only with a grant from the profile or from this turn.
- Owner gates. Stop for accounts, secrets, paid infrastructure, production data writes with no grant and destructive resets. Stop for a force-push to a shared branch, `--admin` merges and messages to clients.
- Questions. Ask only human calls, each with a recommendation and lettered options. "agree" accepts all. Never ask for a fact. Ask for owner-only inputs one at a time.
- Delivery. One plan is one PR. A PR can serve more than one ticket. Split a PR only on an owner call. Follow-ups update the open PR.
- Proof. Report gate counts. Walk the journey as a real persona. Measure before a claim, and open each cited file first. A zero result needs a positive control.
- State. The plan, the tracker and git hold state, never a transcript. Record `git status --porcelain` and `git stash list` before a fan-out.
- Replies. Write in STE. Give the result first. Do not repeat agreed items. Fix a broken skill or rule in astack, never in a project copy.

## 5. The long-term development model and astack:plan

### 5.1 Units

The owner runs one loop at four scales. Only the container grows [plan-style].

| Unit | Definition | Handle | Limit |
|---|---|---|---|
| Programme | a destination that needs more than one milestone | slug | 8 live milestones |
| Milestone | a demonstrable state, with one demo sentence and one proof command | `M<n>` | 1 to 6 weeks |
| Block | one capability slice with a brief. A single ticket is a block with no programme | `B<nn>` | 1 to 5 sessions |
| Session | one PR and one integrator run | `B<nn>/S<n>` | warn past 12 steps or 3 days, never split |
| Step | one commit with an Exit and a checkpoint | number in its session | about half a day |
| Decision | a settled answer, or an open decision issue in the programme tier | `D<n>` | about 300 characters per row |
| Wave, Lane, Kind | labels, not units | `Wave. W<n>`, `Lane. <x>`, `kind:<type>` | |

"Step" is the canonical word. The owner's words "bucket" and `W<n>` are legal input, and astack never corrects them. One `D<n>` family with a kind column replaces the typed G, D, R, Q and T IDs (Q2).

### 5.2 Delivery shape, checkpoints and delegation

The main shape is one big-bang PR per session. Parallel step workers build it in worktrees, in waves, and an integrator lane lands it.
- Each step carries `Wave.`, `Lane.`, `Files.`, `Exit.` and `Proof.` lines. `Proof.` replaces `Verify.`, because "verify" is not an STE word.
- In each wave, step workers run in parallel worktrees and commit on step branches. Where the profile of a repo says so, they run Fable 5.1. Judgment and the integrator run Opus 5.5 (Q13).
- The integrator lane is the main thread. It lands step commits on the session branch in plan order, runs the scoped gates and resolves conflicts.
- One editor works on each hot-file region per wave. The checker fails a plan when two steps in one wave list the same hot-file region.
- `checkpoints: report` is the default. The session posts the package as a PR comment, gives 6 lines or fewer in chat with the link, and continues.
- `approve` applies only to a step marked `Checkpoint. approve`, for UI-taste steps and one-way doors. A session with more than about 8 steps has one checkpoint per wave. A smaller session has one per step.
- The package holds a summary of 10 lines or fewer, the D rows it covers, the diffstat, gate counts, the red-green-red log and UI screenshots.
- A delegation grant is "go", "do your recommendation" or the "best practices" phrase. Under a grant, the agent decides agent calls and human calls that have a clear best option. It records each as `delegated` and continues.
- The grant writes `delegate: on` to the plan frontmatter at once. It lasts for the session and survives a resume. "ask me" or plan close ends it.
- Owner gates always stop. Production merges with no profile grant, money, legal, accounts, secrets, client messages and destructive resets stay fixed. A programme can lift hosted migrations with a daily cap (Q5).
- Pushes at each checkpoint start CI. The apply step proposes CI cancel-in-progress, and review bots skip draft PRs.

### 5.3 Tiers, tracker footprint and plan mode

| Tier | Fits when | Output | New tracker objects |
|---|---|---|---|
| quick | one session, no one-way door | a chat plan of 15 lines or fewer | none. Decisions go in a comment on the ticket |
| standard | one block, one or more tickets, one PR | `docs/plans/<slug>.md` | none. Status and one hand-off comment on the existing ticket |
| programme | more than one milestone | `docs/plans/<slug>/index.md` and block briefs written at most two sessions ahead | session sub-issues, decision issues, defect and hidden-work issues |

- In the standard tier, the PR fixes in-scope defects and hidden work, and its body lists them. Checkpoint comments go to the PR, never to the issue.
- Out-of-scope findings go to `<git common dir>/astack/plans/<slug>/drafts.md`. The owner files them with "agree" through `astack:write-ticket`.
- `/plan` with "I am building" is `astack:plan` inside plan mode. S0 to S3, S5 and S6 run read-only, and the plan-mode plan ends with unresolved questions.
- After ExitPlanMode approval, the first action writes `docs/plans/<slug>.md` in one commit. A plan never lives only in `~/.claude/plans` or memory, because Codex, Cursor and Grok Bot cannot read them.
- A standard plan keeps the owner's ticket shape. Goal and core decision come first, then the D rows, then the steps table. "How each step runs", the whole-work proof and open questions come last.
- The frontmatter keys are `plan`, `tier`, `status`, `home` (default `repo`), `tracker`, `delegate` (default `off`), `checkpoints` (default `report`), `owner-gates`, `execute` and `reviewed`.

### 5.4 Caps and anti-ledger rules

The caps fit the owner's real plans. Fixtures with the size and shape of three real plans of 10.8 KB, 19.7 KB and 27 KB must pass with no deny.

| Artifact | Warn | Deny |
|---|---|---|
| standard plan, block brief | over 24 KB or 400 lines | over 32 KB |
| programme index | over 250 lines or 15 live D rows | over 16 KB |
| hand-off comment | over 5 lines | none |

- The standard tier has no row cap. The byte cap controls bloat.
- In a file with `plan:` frontmatter, the hook denies only four edits. These are a result over the deny cap, an added checkbox line, an added `Status:` line and a register table. Every other finding is a note.
- A hook note flags dates, PR numbers and a "Current wave" block in AGENTS.md and CLAUDE.md.

### 5.5 Lifecycle and the session CLI

A programme closes when its last milestone exits, and close deletes `docs/plans/<slug>/` but keeps ADRs and the glossary. `astack release` will run a milestone exit with the gates on a fresh stack, the persona journeys and the demo. It is deferred (section 3). One re-grill round of 7 questions or fewer follows. The last session of a block moves durable facts to ADRs or tests and deletes the brief. An open decision is an issue with an interim default and the fields Question, Interim default, Other answer and cost, Binds and Decide by. `Settled` is `user R<n>`, `delegated`, `evidence` or `default`.

`astack session start|checkpoint|handoff|resume|stale` prints the branch `<prefix>/<key>/<slug>`, the claim, the checkpoint package, the hand-off and the resume prompt. Each write comes out as a write plan, and tracker reads come as JSON on stdin. The resume prompt names the plan, branch, PR and next step, and it asks for ultracode when the session used workflows. The session CLI is a new build [reuse]. `astack board` is a read-only view of the startable frontier, and it never enters git. The P50 and P85 forecast and Grok Bot routines wait for a first real use.

The plan and session contracts are these.
1. Handles `M<n>`, `B<nn>`, `B<nn>/S<n>` and `D<n>` are legal in plans, trackers, PR titles and commit subjects. The comment hook still denies them in code.
2. Sessions with parallel steps in waves replace phases. One `now` session per lane is legal.
3. The checkpoint package, `checkpoints:`, `delegate:` and `owner-gates:` are first-class fields. The standard tier files no tickets.
4. New commands are `astack plan export`, `import`, `drift`, `move` and `keys`, plus STE in `check plan`, `check ticket` and the hand-off render.

## 6. Tracker export on request

`home: repo` is the default. The owner asks, and then `astack plan export <slug> --to linear|github` prints a typed write plan. The skill runs each write through the Linear MCP or `gh`. `astack plan keys <slug>` reads the new keys on stdin and writes the `Ticket.` lines in one commit. The long-running structure stays the same in every home.

| astack | Linear | GitHub |
|---|---|---|
| Programme | a delivery project linked to the team roadmap initiative (Q3) | a map issue, type Feature, label `kind:programme` |
| Index text | a project Document, "generated from <path>@<sha>" | the map issue body |
| Milestone | a project milestone `M2 <demo title>` | a repository milestone |
| Block | an issue `B07 <outcome>`, parent the main spec ticket, label `Lane/<x>` | an issue, type Feature, sub-issue of the map |
| Session | a sub-issue `B07/S2 <what becomes true>`, blockedBy from Depends on | an issue, type Task, sub-issue of the block, native blocked-by |
| Open decision | an issue `Kind/decision` that blocks the sessions it binds | an issue, label `kind:decision` |

Round-trip rules.
1. One home at a time. `astack plan move` writes the tracker copy, sets `home` and deletes the repo plan in one commit. `astack plan import` does the reverse.
2. The plan holds structure, Exit, Proof, edges and settled decisions. The tracker holds status, claims, comments, hand-offs, defects and open decision threads.
3. Export is idempotent. It shows a dry run first, files blockers first, writes only the fields astack owns and never deletes.
4. `astack plan drift <slug>` reads tracker JSON on stdin. It reports a stale export, owned fields edited in the tracker, orphans, unmapped children and status contradictions. It never resolves human text on its own.
5. Titles use no long dash. The handle and a space carry the split. GitHub allows 100 sub-issues per parent, so blocks are the parents of sessions.

PR and ticket rules come from the repo profile.
- `tracker.requirePartOf: true` makes line 1 of a PR body `Part of <key>`. Three of the four client configs set it. One line can name more tickets, as in `Part of ABC-327, ABC-331`.
- The hook denies a closing word only when a key or `#n` follows it. "Closes the open defect ledger" passes.
- Never edit a product spec description. Addenda go in comments.

## 7. Comments and other guards

`astack:comment-judge` stays the ruler. The comment handler uses its classes, keep list, "added means new", and fail-open behavior. A kept comment has at most 2 lines. A legal or license header keeps its full text and has no length limit.
- A plan handle in code or a code comment is a provenance tag, so the hook denies it. A TODO cites an issue key.
- `@ts-expect-error` is legal only in `*.test-d.ts` type-test files, because type tests need it.
- The hook also denies a `biome-ignore` of `noNonNullAssertion`, `noEnum`, `noBannedTypes` or `useExhaustiveSwitchCases` [fp-types].
- STE runs on a kept comment after Sicko keeps it (section 9.3).

Other guards are handlers on the same dispatcher.
- Merge guard. Deny `gh pr merge` when threads are open or CI is not green on the exact head. Also deny it with a closing word, in a chain with other commands, with no grant, or with `--admin`. Deny a merge through `gh api` and through the GitHub MCP tool `merge_pull_request`. Only a prompt that a person types gives or ends a grant. A subagent hand-back, a teammate message and other harness text never do.
- PR body. The `Part of` line, the closing words and the headings apply to `gh pr create`, `gh pr edit` and the GitHub MCP tools `create_pull_request` and `update_pull_request`.
- Duplicate PR. Deny `gh pr create` and the GitHub MCP create tool when an open PR of the same author has the same branch. Also deny it when that PR names the same `Part of` ticket. When `gh` cannot read the list, allow.
- Destructive commands. Deny `supabase db reset` and its script forms, a force-push to a shared branch, and `--no-verify` on `git commit` or `git push`.
- Deferred. The `push-note` handler would add a note on Stop when the branch is ahead of its upstream after green gates. It is not built yet.

## 8. FP and types

The stance is plain TypeScript with FP conventions. Use ADTs with exhaustive matching, total functions, and Result and `T | undefined` as values. Keep a pure core with effects at the edges, composition and readonly data. No FP library is required. Effect is the norm in a repo that uses it. Category theory is a vocabulary and a set of laws in property tests, never higher-kinded encodings.

| Rule group [fp-types] | Enforced by |
|---|---|
| no `any`, no unsafe cast, no `!`, no compiler silencing, strict base tsconfig flags | the type hook (8.1), the comment hook, tsc, `astack doctor types` |
| brands only in the parser, types from the owning schema, parse once at the edge | review, the cast deny |
| records for products, unions for sums, full matches, literal unions over `enum` | tsc, Biome `useExhaustiveSwitchCases` (never its fix), the hook |
| readonly data, expected failure as a value, one `Result` type per repo, pure domain | Biome, review, repo architecture tests, a note on `throw` in `pureCore` globs |
| combine and empty, round trips, idempotent normalizers, total-order comparators | fast-check laws, `effect` FastCheck in a repo that uses Effect |

### 8.1 The type hook

- Files are `.ts`, `.tsx`, `.mts` and `.cts`. The hook skips `*.d.ts`, `*.gen.ts`, files marked `@generated` or "DO NOT EDIT" in their first 5 lines, the comment hook skip paths and the profile `types.skip` globs.
- The lexer masks strings, comments, templates and JSX text first. A lexer failure allows.
- The hook denies new `any`, new unsafe `as` and new `!`. Unsafe `as` includes `as unknown as T` and angle-bracket casts in `.ts` and `.mts` files. `as const`, `satisfies` and a bare `as unknown` are legal. `!` includes `let x!: T`.
- The type hook denies a new `@ts-ignore`, `@ts-nocheck` and `@ts-expect-error` by count. The type hook checks Edits, Writes, shell writes and commits of its files. The comment hook leaves these directives to it there. So each one gets one report. The comment hook still denies them in a JavaScript file.
- The type hook advises on an `enum` declaration and a `class X extends Y` outside the allowlist. The default allowlist holds `Error` subclasses, `Component`, `PureComponent`, `Data.TaggedError`, `Data.TaggedClass`, `Data.Class`, `Schema.TaggedError`, `Schema.Class`, `Context.Tag`, `Effect.Tag` and `Effect.Service`.
- The verdict comes from the change in the count of each pattern class. The hook compares the before and after text of an Edit, a Write or a shell write. For a `git commit`, it compares the old and new blobs of each file. It denies only when a count rises, and it points at the new occurrences. So the hook never blames a touched old line. A shell write is a `cat` or `tee` heredoc or a static `echo` or `printf` into a file. A static `echo` or `printf` piped into `tee` is one too.
- The deny applies in source and in tests. The profile `types.allow` list names one kernel file per repo, with paths, kinds and a reason. That file holds the brand constructors, one `fake<T>()` test helper and DOM type guards. The pr-metrics ratchet still counts it.
- The patterns for `any`, `as`, `!`, `enum` and `extends` measured precision and recall of 1.000 on 8,289 files [fp-types]. Angle-bracket casts have no measure, because every repo has 0 today.

### 8.2 Bounds against over-engineering

1. No FP library in a repo that has none. Effect only where the repo uses it. No higher-kinded encodings, Functor or Monad interfaces, or type-class dictionaries.
2. No interface or class with one implementation. A test fake counts as the second one.
3. No new generic before 3 real call sites. No Result helper set before 3 call sites chain results.
4. No monad transformer stacks, and no custom `pipe`, `compose` or `curry` outside Effect. Plain code returns `Promise<Result<T, E>>` with early return.
5. A type-level program over about 10 lines needs a type test. Names follow the domain, not the algebra.

One client repo sets `noImplicitAny: false` and says "interfaces over types". Its base moves to the strict flags, and every repo uses `type` for unions (Q12).

## 9. ASD-STE100

STE is mandatory. Deny applies only to rules with proven precision. Judgment rules advise until they prove the bar.

### 9.1 Rule tiers

| Tier | Rules | Why |
|---|---|---|
| deny, exact | contraction, semicolon in prose (not at a list-item end), long dash and en dash outside number ranges, e.g., i.e., etc., cf., and/or | the detector is the definition. Fixtures prove each one |
| deny, measured | sentence length, 20 words procedural and 25 descriptive | 43 fires, 41 true [ste] |
| deny, word list | a small list (ensure, utilize, utilise, leverage, facilitate, commence, whilst, amongst, additionally, "in order to", "due to the fact that") | words with no technical sense here (inferred). A false positive demotes the entry |
| advise | the broad word list, perfect, progressive, modals, paragraph length, passive, -ing forms, noun clusters, one instruction per sentence | judgment heuristics |
| off | missing article | about 90% false positives |

- A rule moves to deny at 95% precision or more on 30 or more labelled fires from held-out texts. Held-out texts come after the glossary and are not part of the corpus that tuned the rules. CI fails when a deny rule falls under 95% on the labelled corpus. Then the rule gets a fix or moves to advise.
- STE does not approve "check", "verify" and "confirm" as verbs (Q7). They sit in the broad list, and the detector reaches them only in finite or imperative position.
- An observation log records each fire with a fingerprint. `astack ste review` will label fires when the first promotion starts. It is deferred (section 3).

### 9.2 Scope

- The checker skips front matter, fenced and indented code, HTML, blockquotes, tables and images. Tables stay out of scope, because the `tooling/forecast.ts` of a client repo parses table cells.
- Inline code, URLs, paths, CLI flags, versions, ticket keys, plan handles and identifiers each count as one word. So do quoted strings of 200 characters or fewer, `plugin:skill` names, `${VARS}` and a comma list of code spans.
- Headings get the word list, contraction and long dash rules as advise only. A commit subject and a PR, issue or Linear title get the exact deny tier and the word list at deny. They get no length rule. Field labels of the plan and ticket schema (`^Word[.:]`) are exempt.
- On the reply surface, each line that is not indented is its own unit, because the chat shows each line on its own. A number with a comma or a colon, such as `2,406` or `14:02`, counts as one word. Text in single quotes is masked like text in double quotes. The text of a link to a PR, an issue, a commit or a Linear issue counts as one word.
- Each list item is a paragraph. The text kind comes from each sentence.
- A language guard skips a file or a message where more than 30% of the letters are not Latin. A chat reply gets a `language` finding in its place (9.4). A chat reply in another language with Latin letters gets it too. Spelling stays as the repo has it, and word-list entries hold both -ise and -ize forms.
- When the checker skips more than 40% of a text and no client-draft route is active, quotes count as prose.

Only new sentences count. The checker normalizes each sentence and drops every finding whose sentence is also in the old text. The old text is `old_string` for an Edit and the file on disk for a Write. A new ticket, a commit message and a PR create have no old text. Paragraph rules run only on a paragraph that is new as a whole. A fixture proves that an Edit with 3 old non-STE context sentences passes.

Per-repo settings live in `.astack/profile.json` under `ste`. `ste.mode` is `"deny"` or `"advise"`. `ste.technicalNouns`, `ste.technicalVerbs` and the bold terms of the glossary add technical names. The apply dry run fills nouns from string-literal unions and `z.enum` values. `ste.exclude` adds globs to the defaults `LICENSE*`, `NOTICE*`, `**/content/**`, `apps/**/*.mdx`, `**/public/**` and `**/locales/**`. The checker always skips upstream snapshots, fixtures, vendored files and CHANGELOGs.

### 9.3 Enforcement points

| Surface | Event | Action |
|---|---|---|
| PR body and title, `gh pr create`, `gh pr edit`, `gh pr comment`, `gh pr review -b` | PreToolUse Bash | deny, everywhere |
| Linear `save_issue`, `create_issue`, `save_comment`, `gh issue create`, `gh issue comment` | PreToolUse MCP or Bash | deny on create and comment. Advise on update, because the hook gets no old text |
| commit message, `git commit -m`, `-F` or heredoc, the commit-msg git hook | PreToolUse Bash, git hook | deny, everywhere. Strip the Conventional prefix and trailers. Skip Merge, Revert, `fixup!`, `squash!` and `amend!` |
| docs, plans, ADRs (`*.md`, `*.mdx`) | PreToolUse Edit, Write, `apply_patch`, a cat or tee heredoc, a static echo or printf into the file or into `tee` | deny where `ste.mode` is `"deny"`, advise elsewhere |
| kept code comments | PreToolUse on source, after Sicko | deny. License text and keep patterns are exempt. JSDoc tags are removed first |
| astack skill, rule, README and doc text, and skill descriptions | `bun run validate`, in `bun run check` | must pass with zero deny findings. `scripts/lib/ste-own.ts` lists the files and the exemptions |
| astack CLI message text | none yet | open. No gate examines the strings in `src/astack/` |
| The four protected quotations in `rules/comments.md` | `bun run validate` | The gate blanks these verbatim upstream sections. The catalog has no moved-prose exemptions |
| every chat reply to the owner, also a short one | Stop, UserPromptSubmit | one forced rewrite for each reply (9.4) |
| subagent and workflow-worker output | none | exempt |

- A deny lists every finding as `L<n> <rule> <fix>`, up to about 2,000 characters, with the total count. Skill text tells the agent to run `astack check ste -` on a draft first.
- A session ledger counts deny fingerprints of the measured rule and the word list. When one fingerprint gets a deny twice, it becomes advise for the session, and the log marks it as a false-positive candidate. The exact STE rules and the exact type classes never downgrade, because the detector is the definition. The exact STE rules are contraction, semicolon, dash, Latin short forms and `and/or`.
- A commit message that is not static text fails open. The commit-msg git hook also runs on the owner's own commits where a repo installs it.

### 9.4 Chat replies, the strict Stop hook

The `ste-reply` handler runs on Stop. It examines every reply to the owner, also a short and simple reply. No length limit applies.
1. Read `last_assistant_message`. When it is missing, allow.
2. Allow an exempt reply. A reply is exempt when it parses as JSON. It is exempt when it parses as YAML with a YAML-only token, such as a nested map, a list or a typed scalar. It is exempt when it is one fenced block whose info string is not `md`, `markdown` or `text`. The prose in such a fence gets the check like other prose.
3. Allow in a session that is not interactive, and allow output from a subagent or a workflow worker. A `-p` run shows `CLAUDE_CODE_ENTRYPOINT=sdk-cli` and `CLAUDE_CODE_SESSION_ATTENDED=0` to hooks. A probe proved this (`docs/planning.md` section 12). An interim reply also gets the check while `background_tasks` lists work that runs.
4. Run the deny tier on the reply. With no deny finding, allow. The language guard does not skip a reply, because a reply must be in ASD-STE100 English. The reply gets one `language` finding when more than 30% of its letters are not Latin. It also gets it when it has 2 or more common words of another language and fewer common English words. Text in quotes and code does not count.
5. Claim the reply with `open("<state>/ste/<session>/<hash>.claim", "wx")`. The hash comes from the chain id and the reply text. The chain id is `prompt_id` on Claude Code, `turn_id` on Codex and `generation_id` on Cursor. Without a chain id, the hash comes from the text only. When the file exists, allow.
6. Write the hash to `rewrite.json` as `asked`. Return `continue` with up to 8 findings and this instruction. "Send the full reply again in ASD-STE100. Keep every fact, number, path, link and command. Keep quote blocks and code as they are. Do not call tools."

Loop guard. Each reply gets one rewrite at most.
- A Stop with `stop_hook_active: false` starts a new chain. Each other Stop continues the chain, also when the field is missing.
- In a chain, the first reply with a hash other than `asked` is the rewrite. It writes its hash as `answer` and passes, also when it still fails. A parallel copy writes the same value.
- A reply with the `asked` hash is never the rewrite. So a slow parallel copy finds the claim and allows, and the rewrite never loops.
- After the `answer`, a reply with a new hash gets its own rewrite. So a second reply in one turn gets one. A Stop block of another plugin uses no rewrite, because only astack writes `rewrite.json`.
- A reply that repeats in a new chain and fails gets its own rewrite, because the chain id is part of the hash. Without a chain id, the claim of that text stays until the next prompt.
- A new chain that allows deletes `rewrite.json`. In an interactive session, the `turn` handler deletes the claims and `rewrite.json` on each prompt. A `/loop` wakeup, a cron prompt and a subagent hand-back count too.
- astack never relies on `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`, which the owner sets to 99. It never relies on `stop_hook_active` alone, because other plugins set it.
- A parse error, a timeout, an unreadable state dir or a missing runtime allows.
- When the rewrite still fails, the stop goes through. The next prompt gets a one-line count, not the list.

The merge grant still reads only a human prompt. A prompt that starts with a harness tag, such as `<agent-message ...>` or `<task-notification>`, is not human. A prompt that equals a cron prompt from `session_crons` of the last Stop is not human either.

Each tool uses its own shape. Claude Code and Codex get `{"decision":"block","reason":...}` with exit 0 from the same command. Cursor saves the `afterAgentResponse` text under `conversation_id` and `generation_id`, and `stop` returns `followup_message` with `loop_limit: 1`. A `loop_count` of 0 starts a new chain. A stop that did not complete, such as an abort, sends no follow-up. A Cursor background agent gets `ASTACK_ATTENDED=0` from the `sessionStart` env, so its replies get no rewrite. Grok Bot has no hook, so replies get only the rule card in skill text. The signals of `codex exec` and `cursor-agent -p` are not probed, so those runs can still get a rewrite (`docs/ste-targets.md`).

The coordinator turns off the explanatory and learning output-style plugins at install, because they conflict with STE and terse replies (Q11). `astack doctor` fails while either is on.

### 9.5 Word list and licence

- ASD owns the dictionary copyright, and the trade mark is EUTM 017966390. astack ships no dictionary text, definitions, examples or derived word list.
- astack ships its own typed entries `{forms, use, position, basis, tier, pass, fail}`. The basis is `ste-public` with a citation, `ste-checkers` when 2 checkers agree, or `house`. astack writes the pass and fail sentences.
- Negative tests guard the traps. STE approves `approximately`, `about` means only "concerned with", and `check` as a noun passes.
- The NOTICE says "STE rules based on ASD-STE100. astack is not affiliated with or endorsed by ASD." It names the trade mark and says that astack ships its own word list. astack never says "compliant" or "certified".
- An owner with a licensed copy can keep a private lexicon outside every repo (Q8). A test refuses a tracked file that holds its sentences.

### 9.6 Precedence and prevention

- The rule card holds a short STE card, so first drafts follow STE before any hook runs. The order is fixed. Sicko keeps or deletes a comment. STE tests its words. pstack technical-writing gives structure above the STE floor. unslop does the last style pass.
- The STE deny tier wins over technical-writing. Its "leave it alone" escape applies only to advise rules. A zz-integration line tells technical-writing this on Claude Code. A quote block keeps its own style, because the checker skips it (Q10). The rest of the reply is in STE.

### 9.7 Cursor deferred checks

Cursor records each blocked file with its canonical target, workspace, session, handler, original before text, current hash, and reason.
Edits and completed stops read current content against the original baseline.
A refresh writes no STE attempt or reply claim.
Unresolved records survive unrelated edits and completed stops.
Disabled quality records remain dormant.
A partial comment check retains its baseline while nested STE is disabled.
A suppression handoff carries that baseline to the active type checker and respects its current permissions.
Deleted targets resolve active records.
Unreadable files and unavailable checks report a verification limit.
Old string-only records appear once as unverified reports.
The state folder can contain source baselines and must stay private.

## 10. Per-target capability and degradation

`scripts/dist/capability.ts` declares what each client can load.
A missing capability has an explicit fallback or omission.
The build validates the files that each client receives.

- Claude Code gets the native plugin, shared rules, and hooks.
- Codex reads that plugin with user-only skill policies and four trusted hook hashes.
- Cursor gets a flat plugin with rules, references, agents, and its hook adapters.
- Cursor cloud gets project skills and the CLI through the cloud install guide.
- Grok Build reads the native plugin and its hooks.
- Grok Bot gets private skills and reference files, with no astack hooks.
- Other Agent Skills clients get portable skills and the rules fragment.

A local Cursor plugin copy does not prove a cloud install.
Personal skill sync covers only `~/.cursor/skills/` and agents that the user starts.
Automation runs need project skills.
The cloud guide keeps the CLI and reference files with those skills.

The Grok Bot updater captures the old skill metadata before it writes a new skill.
It supports source repositories and standalone built outputs.
It saves the rules skill last and reports a partial import when a resource is missing.
A real Bot import remains a separate acceptance check.

Avoid a global portable skill copy when a client already loads the native plugin.
Duplicate discovery makes rules and skill names harder to identify.

## 11. Apply to a product repo

A product repo gets `.astack/profile.json`, git hooks and a CI step only through `bun run apply --project <name> --dry-run` and an owner call. On that call, `bun run apply --project <name> --worktree` commits the files on a new branch in a worktree outside the repo. `--update` adds one follow-up commit to that branch and deletes the files that astack no longer writes. The profile lists each file that apply writes under `managed`, and `astack managed <path>` reads that list. A review finding on such a file gets its fix in astack, then an update of each repo. `docs/install-repo.md` gives the steps, and `astack init` writes a profile in any other repo.

## 12. Verification

`bun run check:drift` compares fresh expected generated files without writing them.
One helper compiles the Node bundle for both write mode and in-memory comparisons.
The check overlays fresh CLI bytes in both source inputs before rendering every client build.
It compares each path, byte, and executable bit, including missing and extra files.
It refuses linked generated outputs and stale source prerequisites.
The tests compare generated bytes, modes, and mtimes before and after the read-only command.

`bun run check` builds every target and runs the validators, neutrality scan, and pinned secret scan. Then it runs `bun test`, `biome ci` and `tsc`. `bun run validate` holds the STE gate on astack's own text, and `bun run ste` holds the precision gate.
- Fixtures. One pass and one fail fixture per rule, for comments, types, STE, tickets, PR bodies, plans and the merge guard. Captured payloads per tool live in `tests/fixtures/hook-input/`. The handlers of one hook call run in under 100 ms in process on the fixture set. A real hook call also pays the start of the runtime. Real sessions measured 108 ms at p50 and 146 ms at p95 for the whole process. A bare `node -e ''` takes about 110 ms on the same machine.
- Plan fixtures. Synthetic plans sized like three real plans of 10.8 KB, 19.7 KB and 27 KB pass. Two steps of one wave on one hot-file region fail. A register table fails. A handle in a code comment fails.
- STE fixtures. The 3-old-sentence Edit passes. A JSON reply, a one-block reply and a `-p` session get no rewrite. The Stop of the rewrite allows. A second reply in one turn gets its own rewrite. Two parallel claims give one block.
- Type fixtures. A Biome reflow of an old cast line passes. A new cast in a file with old casts fails.
- Laws with fast-check. Decode then encode is the identity on each captured fixture. `combine` obeys the monoid laws. Two builds give the same bytes. A new keep pattern never turns an allow into a deny. A second export plans no tracker write.
- Per target. Claude Code gets `claude plugin validate --strict` and the load gate in a temp `CLAUDE_CONFIG_DIR`. Codex gets a temp `CODEX_HOME` and `HOME`, `codex debug prompt-input` and `codex exec --json --dangerously-bypass-hook-trust`. Then one smoke run in Codex Desktop follows. Cursor gets ajv on the manifests and `cursor-agent -p --plugin-dir` after an update. agentskills gets `skills-ref validate`.

### 12.1 Signed public releases

ADR 0002 keeps the first public commit and push with the owner.
Prepare a standalone scanned tree with no private parent or programme notes.
The owner reviews commit and tag metadata separately from file scans.

The release workflow runs on version-tag pushes.
`bun scripts/release.ts` reads the source version and actual checkout HEAD.
It requires the exact remote ref, annotated tag identity, commit target, and GitHub signature verification.
The read-only job runs drift, full gates, and an unchanged-tree check.
Only its dependent draft job receives content-write permission.
That job repeats tag verification before creating an owner-review draft.
Signing keys stay outside CI.
The owner reviews and publishes the draft after the gates pass.
This source-release verifier is separate from the deferred milestone `astack release` command.

Record local gates, authenticated loads, hosted CI, and live client installs as separate proof.
`docs/runbooks/publish.md` gives the exact procedure.

## 13. Risks

| Risk | Effect | Response |
|---|---|---|
| reply rewrite cost | the owner reads two replies, and output tokens rise | the rule card first, one rewrite for each reply, exemptions, output styles off |
| other Stop hooks | Warp notifies on the first reply. A codex review gate runs twice | `astack doctor` lists them |
| STE false positives | trust falls, and agents route around the hook | the precision bar, the new-sentence diff, the glossary, the fingerprint ledger |
| silent no-op | no runtime means no checks | fixed-path discovery, the advisory, `astack doctor` |
| Codex hook trust | a changed `hooks.json` turns checks off | a byte-stable `hooks.json`, `astack doctor` |
| duplicate skills | `~/.agents/skills` is shared by three tools | no global agentskills install, `astack doctor` |
| edits not live | the install path is a cache copy | `astack doctor` compares cache and `dist/` |
| claude.ai and Cowork | they refuse plugins with a top-level `bin/` | a variant with no `bin/` when needed |
| STE licence | ASD copyright and database right | own word list, NOTICE, no ASD text |

## 14. Experiments and open questions

A probe settles each experiment, not the owner.
- E1. The Cursor preToolUse Write payload, and whether Cursor runs plugin hooks in its own format.
- E2. Whether a workflow worker fires Stop or SubagentStop, and which field marks it.
- E3. Whether Codex SessionStart context reaches the model, the Codex name of the Linear MCP tool, and the real skill-list budget with `model_context_window = 1000000`.
- E4. Whether Grok Build expands `${CLAUDE_PLUGIN_ROOT:-$GROK_PLUGIN_ROOT}` and sends Write and MCP events.
- E5. Which UserPromptSubmit field tells a human prompt from a `/loop` or scheduled prompt.
- E6. Whether the Claude Code Stop hook continues the turn on exit 2 with stderr, proven end to end.

The first public commit follows ADR 0002.
The public source carries only its own STE word list and no licensed dictionary text.
Keep any private licensed lexicon outside every public tree.
