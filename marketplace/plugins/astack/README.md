# astack

astack holds house standards for plans, code comments, tickets, PR bodies and documentation. Its skills describe the standards, and its hooks refuse the cases a script can prove wrong. This page covers the hooks and the `astack` CLI behind them.

`/astack:mode` selects the next step from the plan, tracker, and git state.
`/astack:plan` plans the work.
One `astack` plugin holds these skills and the kept pstack and flow material.
The rule card `rules/astack.md` carries the routes for ordinary user requests.

## Install

Add the astack marketplace, then install the plugin:

```sh
claude plugin install astack@astack
```

Then link the five shared rules into `~/.claude/rules`. They are in the `rules/` folder at the root of the repository. Without the rule card, most chat replies fail the STE check, and each one then costs a rewrite:

```sh
ln -s <repository root>/rules/astack.md ~/.claude/rules/astack.md
ln -s <repository root>/rules/coding.md ~/.claude/rules/astack-coding.md
ln -s <repository root>/rules/comments.md ~/.claude/rules/astack-comments.md
ln -s <repository root>/rules/typescript.md ~/.claude/rules/astack-typescript.md
ln -s <repository root>/rules/postgres.md ~/.claude/rules/astack-postgres.md
```

The hooks need Node 22 or later, or [Bun](https://bun.sh). `bin/astack` looks for a runtime in a fixed order. It tries `$ASTACK_RUNTIME`, the path in `~/.local/state/astack/runtime`, and `node` and `bun` on `PATH`. Then it tries the install paths of Homebrew, `/usr/local/bin`, Bun, Volta and nvm. When it finds no runtime, it writes one line to stderr and allows the tool call.

The astack skills read their reference files and run the `astack` CLI. Add these rules to `permissions.allow` in your user settings or in the repo's `.claude/settings.json`. Then those reads and calls do not prompt or fail in a subagent:

```json
["Read(~/.claude/plugins/**)", "Bash(astack:*)", "Edit(~/.local/state/pstack/**)", "Write(~/.local/state/pstack/**)"]
```

Add `Read(~/.claude-<profile>/plugins/**)` for each extra Claude Code profile directory, and `Read(<marketplace dir>/**)` when the marketplace is a local directory. The last two rules cover the pstack store, where pstack's long-running playbooks keep their state.

## Language review packs

The TypeScript pack covers `.ts`, `.tsx`, `.mts`, and `.cts` files.
The SQL pack applies only in a PostgreSQL repo.
The scoped builds keep file globs.
The portable rules and fragments state each section's scope.

`astack:code-review` holds the TypeScript and PostgreSQL checklists.
The optional `typescript-reviewer` and `postgres-reviewer` agents share those checklists.
Both inherit the selected model and allow only Read, Grep, and Glob tools.
They do not change files or run commands.
The parent runs executable proof.
A client without native agents can apply the checklist in its main review.

A hardening profile can select one through `reviewers.extra`.
Keep its existing selection and extra reviewers unless the owner changes them.
For example, add this item to its existing extra list:

```yaml
name: typescript-reviewer
invoke: the Agent tool with subagent_type astack:typescript-reviewer, using the pinned base and head
when: The diff changes TypeScript or TSX behavior
```

The default extra list stays empty.
Adding a rule pack does not start a reviewer.

## What the hooks check

`hooks/hooks.json` has one entry for each event: `SessionStart`, `UserPromptSubmit`, `PreToolUse` and `Stop`. Each entry runs `bin/astack hook claude-code <event>`. The `PreToolUse` matcher is `Edit|Write|MultiEdit|NotebookEdit|Bash|apply_patch|mcp__.*`, and the CLI sends each payload to the handlers that ask for it. An event with no handler exits at once. A handler stays silent, adds a note for Claude, or denies the tool call with a reason Claude can act on. A Bash command that chains several commits, writes and `gh` calls gets every one of them checked.

| Tool call | Check | Result |
|---|---|---|
| `Edit`, `Write` | Comments the edit adds to a source file | Deny proven junk. Add a note for comments that need a reason. |
| `Edit`, `Write`, `MultiEdit` on a `.ts`, `.tsx`, `.mts` or `.cts` file, a shell write into one, or a `git commit` | The count of each unsafe type pattern before and after the change | Deny when the count of `any`, unsafe casts, `!` or compiler suppressions rises. Add a note when the count of `enum`, banned types or class bases rises. |
| `Bash` running `git commit` | Comments each commit in the command adds, from the staged diff plus any `git add` or `commit -a` before it | Deny proven junk. Add a note for the rest. |
| `Bash` running `cat` or `tee` with a heredoc or here-string, `echo` or `printf` into a file, or a static `echo` or `printf` piped into `tee`, on a source file | Comments the write adds | Deny proven junk. Add a note for the rest. |
| `Bash` running `gh pr create` | Headings in the PR body, the `Part of` line and closing words | Deny when a heading is missing, when the profile asks for a `Part of` line that is not there, or when a ticket key follows a closing word. |
| `Bash` running `gh pr edit` | The `Part of` line and closing words in a new body or title | Deny as for `gh pr create`. |
| `Bash` running `gh pr merge` | The merge grant, the review threads, CI on the PR head, closing words and `--admin` | Deny with each reason. See Merges below. |
| `Bash` running `gh pr create`, or the GitHub MCP tool `create_pull_request` | Open PRs of the same author for the same branch or the same `Part of` ticket | Deny a second PR. One plan is one PR. When `gh` cannot read the list, allow. |
| The GitHub MCP tools `merge_pull_request`, `create_pull_request` and `update_pull_request` | The merge path, the `Part of` line, closing words and headings | Deny a merge through MCP, so each merge goes through `gh pr merge`. Check the PR text as for `gh pr create`. |
| `Bash` running `supabase db reset` or a package script that runs it, `git push --force` to `main`, `master`, `develop`, `staging`, `production` or a `release` branch, or `--no-verify` on `git commit` or `git push` | The owner gates | Deny, and ask the owner. |
| `Bash` running `gh issue create` | Headings in the issue body | Deny when a heading is missing. Add a note for email addresses. |
| A Linear MCP tool named `save_issue`, `create_issue` or `update_issue` | Headings in the issue description | Deny a new issue with a missing heading. Add a note on an update. Add a note for email addresses. |
| `Edit`, `Write` on a Markdown file whose frontmatter has `plan:` | The plan rules of `astack check-plan` | Deny an added checkbox, an added `Status:` line, an added register table, or a plan over its cap (32 KB, or 16 KB for a programme index). Add a note for every other finding. |
| `Edit`, `Write`, `MultiEdit`, `apply_patch`, a `cat` or `tee` heredoc, or an `echo` or `printf` write on a Markdown file | New sentences, with the ASD-STE100 rules | Deny where the profile sets `ste.mode` to `deny`. Add a note in other repos. |
| `Bash` running `gh pr create`, `edit`, `comment` or `review`, `gh issue create` or `comment`, or `git commit` | The body, the comment, the title or the commit message, with the ASD-STE100 rules | Deny in every repo. A title and a commit subject get the exact rules and the word list, with no length rule. `gh issue edit` gets a note. |
| A Linear or GitHub MCP tool that writes an issue, a PR or a comment | The text, with the ASD-STE100 rules | Deny on a create or a comment. Add a note on an update. |
| `Edit`, `Write` on a source file | A comment that the comment check keeps, with the ASD-STE100 rules | Deny a contraction, a long dash, a Latin short form, `and/or` or a word from the deny list. |

On `Stop`, astack examines each reply with the ASD-STE100 deny rules, also a short reply. A reply that fails gets one rewrite. See Simplified Technical English below.

On `UserPromptSubmit`, the merge guard records whether the owner's prompt gives a merge grant for this turn.

On `SessionStart`, the plan pointer runs `astack check-plan --brief` and lists the repo's active, draft and paused plans. In a headless or SDK session it also says that `/astack:plan` runs unattended there. It prints nothing otherwise.

### Comments

A comment counts as added when its text is not already somewhere in the file. Moving a comment inside a file therefore passes. When an edit touches a comment block that already held junk or was already too long, astack adds a note and does not deny. The edit did not write the junk.

astack denies a comment only when it falls in a class that no keep rule can cover:

- narration of a change or an earlier version, such as "now uses", "no longer calls", "used to be", "before this change", "red-first", "Added a ...", "Changed to ...", "Moved from ..." or a leading `Fix:`;
- provenance tags: ticket keys like `ABC-123`, plan and session codes like `B12/S3` or a leading `B14:`, and `PR #12`. Review rounds, dated measurements and a leading date such as `2026-10-16:` also count. So does a leading `Copied from` or `Adapted from` with no link;
- `file:line` references;
- a header that repeats the file's own path;
- section banners such as `// ─── Reads ───`;
- commented-out code;
- a comment whose words all appear in the code it sits on, such as `/** Table of contents configuration. */` above `ExportTableOfContentsConfig`;
- suppressions of correctness or safety checks: `@ts-ignore`, `@ts-nocheck`, `@ts-expect-error` outside test files, and `biome-ignore lint/correctness`, `lint/suspicious` or `lint/security`.

astack also denies an added comment block with more than 2 lines of text. A license header and a match for a repo keep pattern pass. Paragraphs split only by blank lines count as one block. Delete such a comment unless a keep rule covers it, and never shorten it just to pass. A kept comment fits in 2 lines, and the rest moves into a name, a type, a test or an ADR. A legal or license header keeps its full text and has no length limit. A doc comment on an exported declaration or a public member may run to 12 lines, and past that astack adds a note instead. astack cannot tell which exports are a public API, so `/astack:no-comments` still deletes a doc comment that defines no public API contract.

astack passes these comments silently:

- a comment with a license line. A license line is an SPDX tag, a copyright line, the title of a known license such as `MIT License`, or a license grant. It can also be a link to the licenses of apache.org, gnu.org, opensource.org or mozilla.org/MPL. It can also be a warranty disclaimer such as `WITHOUT WARRANTY OF ANY KIND` or `DISCLAIMS ALL WARRANTIES`. A license word in prose, such as `Driver License` or `without warranty`, is not a license line. Such a comment passes at any length. The standard headers of MIT, Apache-2.0, BSD-3-Clause, GPL, LGPL, ISC and MPL-2.0 pass, in one block or split by blank lines. Another license header that blank lines split passes only when each part holds a license line. A keep pattern never adds a length limit to it. The hook still denies a line beside a license line that it denies alone, such as narration or provenance;
- `prettier-ignore` and other formatter switches;
- a style-only lint suppression with its reason, such as `biome-ignore lint/style/...: reason`;
- a doc comment on an exported declaration that adds to its name;
- a link together with a constraint word such as "because", "must" or "requires";
- directives such as `/// <reference ... />`, `// @ts-check`, `@jsxImportSource` and `//go:build`;
- anything that matches a repo keep pattern.

Every other added comment gets a note: it survives only if it states a constraint the code cannot show. `/astack:no-comments` judges those comments before a PR.

The comment check reads TypeScript, JavaScript, JSX, SQL, Swift, Kotlin, Go, Rust, CSS, SCSS, Python and shell. It skips Markdown and any path under `fixtures/`, `__fixtures__/`, `vendor/`, `generated/` or `node_modules/`, and any `*.generated.*` file. In SQL, `comment on ... is '...'` is data, not a comment.

### Types

The type check reads TypeScript files with a tokenizer, so text in strings, templates, regular expressions, comments and JSX does not count. It counts each pattern in the whole file before and after the change, and it denies only when a count rises. A line that you move, rename or reformat keeps the count, so old code never blocks an edit. The deny names the new lines and says how to fix them.

| Pattern | Result |
|---|---|
| `any` in a type position | Deny |
| `as T`, `as unknown as T`, and `<T>value` in a `.ts` file. Not `as const` or a bare `as unknown` | Deny |
| `value!` and `let value!: T` | Deny |
| `@ts-ignore`, `@ts-nocheck`, and `@ts-expect-error` outside a `*.test-d.ts` file | Deny |
| `Function`, `Object` or `{}` as a type, `enum`, and a class base outside the allowlist | Note |

The class base allowlist holds `Error` subclasses, React components and the Effect class helpers. The check skips `*.d.ts`, `*.gen.ts`, `*.generated.*` and `generated/` paths, a file with `@generated` or "DO NOT EDIT" in its first 5 lines, and Supabase type output. A repo adds skip globs, allow entries with paths, kinds and a reason, and more class bases in the `types` block of `.astack/profile.json`. `skills/types/SKILL.md` gives the format and the type conventions behind the check.

### Tickets and PR bodies

A new feature ticket needs these headings: Problem, Outcome, Acceptance criteria, Scope, Verification. A new bug ticket needs: Summary, Environment, Steps to reproduce, Expected, Actual, Acceptance criteria. astack treats an issue as a bug when a label contains "bug" or the title says bug, regression, crash or broken. A description with a Steps to reproduce heading, or with both Expected and Actual, also makes it a bug.

For `gh issue create`, astack uses the repo's `.github/ISSUE_TEMPLATE` headings when it can match a template to the issue, and the ticket headings otherwise. `astack check-ticket` checks the ticket headings plus the matching template's.

For `gh pr create`, astack uses the headings of the repo's PR template when it has one. The template is `PULL_REQUEST_TEMPLATE.md` or `pull_request_template.md` in `.github/`, the repo root or `docs/`, or a file under `.github/PULL_REQUEST_TEMPLATE/`. With several templates, it checks only the headings they all share, because `gh pr create` refuses `--template` beside a body. A heading that ends in "(optional)" or "(if any)" is not required. Without a template, the body needs: Why, What changes, Verification, Risk and rollback.

astack reads the body from `--body`, `--body-file` (including `-` with a heredoc) and the common `--body "$(cat <<'EOF' ... EOF)"` form. When the body comes from a variable, `--fill` or `--web`, astack cannot see it and stays silent. With `--repo`, astack only adds a note, because the target repo's templates may differ.

The `astack:write-ticket` and `astack:write-docs` skills hold the templates and the reasons behind them.

### PR links

When `.astack/profile.json` sets `tracker.requirePartOf`, the first line of a PR body must be `Part of <key>`. One line can name more tickets, as in `Part of ABC-1, ABC-2`, or `Part of #12` for a GitHub issue. In every repo, astack refuses a closing word such as `Closes`, `Fixes` or `Resolves` before a ticket key, `#n` or an issue link. This applies to the body and to the title. "Closes the gap in the export" passes. A closing word in a code span or a code block passes.

```json
{
  "tracker": { "kind": "linear", "team": "ABC", "requirePartOf": true }
}
```

### Merges

astack also finds `gh pr merge` after `env` or `command`, through a path to `gh` such as `/usr/local/bin/gh`, and with `gh` flags before `merge`. A `-R` or `--repo` flag before `merge` names the repo of the merge.

astack refuses `gh pr merge` in these cases:

- The command has other commands before or after it in the same Bash call.
- A `NAME=value` word, such as `GH_REPO=owner/repo`, comes before `gh pr merge`, also after `env`. astack reads the PR without these words, so it can read a different PR. Use `--repo` to name a different repo.
- astack cannot read the merge command with certainty. Examples are an option of `env` or `command` and a shell variable before `merge`. Another example is a `gh` flag before `merge` that can take the next word as its value, such as `--subject x`. Only `-R` and `--repo` are clear there. Run `gh pr merge <number>` as its own Bash call.
- Nobody gave a merge grant. A grant comes from `.astack/profile.json`, or from the owner's words in the current turn, such as "merge when green" or "merge 12". A grant in the turn that names PR numbers covers only those PRs, and the next human prompt with no merge words ends it. In the profile, `merge.authority: "standing"` covers each PR, and `merge.standingBases` covers only a PR of the `origin` repo into a base branch that it names. `merge.standingBases` needs `merge.authority: "turn"`, so a PR into another base still needs the owner's words.
- A review thread on the PR is not resolved.
- CI on the PR head is not green. With no CI check at all, the merge also stops, unless the profile sets `merge.requireChecks` to `false`.
- A closing word with a ticket key is in the PR title, the PR body or the merge commit text.
- astack cannot read the PR. It reads the PR with `gh pr view` and one `gh api graphql` call.
- The command has `--admin`, which skips the branch protection rules. This is an owner gate, also with a standing grant.

A subagent hand-back, a teammate message and other harness text never give or end a grant, because only a prompt that a person types counts. astack also refuses a merge through `gh api` on `pulls/<n>/merge` and through the GitHub MCP tool `merge_pull_request`. `gh pr merge --disable-auto` passes. The merge guard keeps the grant of each session under `~/.local/state/astack/merge-grants/`, or under `$ASTACK_STATE_DIR` when it is set.

```json
{
  "merge": { "authority": "turn", "standingBases": ["develop"], "requireChecks": true }
}
```

### Plans

`/astack:plan` keeps one plan file per effort under `docs/plans/`. A programme keeps an index and one brief for each block under `docs/plans/<slug>/`. `astack check-plan` proves the structure. It examines the frontmatter, the section order, the decision rows, and the sessions with their steps tables. It holds the rule of one editor for each hot-file region in a wave. It also examines the milestones, the gates, the caps and the ledger rules. The hook checks only files whose frontmatter has `plan:`, so older plans and ledgers in a repo stay editable.

`astack session` starts, checkpoints, hands off and resumes one session. `astack board` prints the startable frontier of a plan. `astack plan export`, `move`, `import`, `drift` and `keys` print typed write plans for Linear or GitHub, and the skill runs them. The CLI never calls a tracker.

Set the plan directory, the glossary file and the ADR directory in `.astack/profile.json` when a repo keeps them elsewhere:

```json
{
  "plan": { "dir": "docs/plans", "glossary": "CONTEXT.md", "adr": "docs/adr" }
}
```

Each value is a path inside the repo. Without the block, astack uses `docs/plans`, the repo's `CONTEXT.md` or `GLOSSARY.md`, and `docs/adr`.

### Simplified Technical English

astack examines prose with STE rules based on ASD-STE100. The NOTICE file says what that means. Only the rules with proven precision deny:

- a contraction, a semicolon that joins two clauses, a long dash or an en dash outside a number range, `e.g.`, `i.e.`, `etc.`, `cf.` and `and/or`.
- a sentence of more than 20 words in an instruction, or of more than 25 words in a description.
- a short list of words with a plain replacement, such as "ensure" for "make sure", and the phrases "in order to" and "due to the fact that".

The other rules give only a note. They are the broad word list, the perfect and progressive tenses, modal verbs and the passive. Paragraph length and one instruction in each sentence also give a note. `astack check-ste` also shows -ing forms and noun clusters.

- astack skips front matter, code, URLs, paths, quotes, tables, HTML and block quotes. Each code span, path, flag, key or identifier counts as one word.
- Only new sentences count. A sentence that is also in the old text never fails.
- A heading gets only notes. A commit subject and a PR, issue or Linear title get the exact deny rules and the word list. They get no length rule. A field label such as `Exit.` or `Proof.` at the start of a line is exempt.
- astack skips a file or a message when most of its letters are not Latin letters. A chat reply gets no skip. See the chat replies below.
- astack always skips `LICENSE*`, `NOTICE*`, `**/content/**`, `apps/**/*.mdx`, `app/**/*.mdx`, `**/public/**`, `**/locales/**`, upstream snapshots, vendored files, fixtures and CHANGELOGs.
- When the same sentence-length or word-list finding gets a deny two times in one session, astack gives a note for it after that. The exact rules never change to a note. They are contraction, semicolon, dash, Latin short forms and `and/or`.

Set the STE rules of a repo in `.astack/profile.json`:

```json
{
  "ste": {
    "mode": "deny",
    "technicalNouns": ["Verified email"],
    "technicalVerbs": ["check"],
    "exclude": ["docs/legacy/**"],
    "headerFields": ["docs/adr/*.md"]
  }
}
```

`mode` is `deny` or `advise`, and `advise` is the default. It controls only docs, plans and ADRs. A technical noun, a bold term of the glossary file and a technical verb never fail the word list. `headerFields` lists the files whose header has field lines, such as an ADR header. A field line is a list item that starts with a bold label and a colon, such as `- **Amends:**`, before the first `##` heading. A long dash in a field line passes. A semicolon in a field line separates its entries, and each entry counts as one sentence. So an entry that an edit appends is new, and the old entries stay old. Every other rule still applies to each entry.

Chat replies get a strict check on `Stop`:

- astack runs the deny rules on each reply, also a short and simple reply and an interim reply while background work runs. When the reply fails, astack asks for one rewrite with up to 8 findings. The request ends with "Send the full reply again in ASD-STE100. Keep every fact, number, path, link and command. Keep quote blocks and code as they are. Do not call tools."
- A reply must be in ASD-STE100 English. A reply gets one `language` finding when more than 30% of its letters are not Latin letters. It also gets it when it has 2 or more common words of another language, such as German or French, and fewer common English words. Text in another language can stay in double quotes or backticks.
- astack claims each reply with a file that it opens with the `wx` flag. The file name comes from the chain id of the Stop input and the reply text. The chain id is `prompt_id` on Claude Code and `turn_id` on Codex. So a reply gets one rewrite at most, also with two copies of the plugin. A reply that repeats in a new chain and fails gets its own rewrite.
- The rewrite itself never gets a second rewrite. A second reply in the same turn gets its own rewrite. A Stop block of another plugin does not use the rewrite.
- When the rewrite still fails, the stop goes through. The next prompt gets one line with the count.
- Another plugin with a Stop hook runs on the first reply too. Warp notifies on the first reply, before the rewrite exists. `astack doctor` lists these plugins.
- These replies pass with no check:
  - a reply that is JSON or YAML, or one fenced block of code. A fence marked `md`, `markdown` or `text` is prose, so it gets the check.
  - a reply in a headless or SDK session, such as `claude -p`.
  - a reply of a subagent or a workflow worker. astack does not register `SubagentStop`.
- `ASTACK_STE_TEST_INTERACTIVE=1` makes a headless session strict. Use it only in tests.
- The state is in `$ASTACK_STATE_DIR`, else `$XDG_STATE_HOME/astack`, else `~/.local/state/astack`. Without a state dir, the reply passes.

## Allow a repo's own comment forms

Some repos require comment forms that the default policy denies, such as a vendor quirk marker or a migration header. List them as regular expressions in `.astack/profile.json` at the project root:

```json
{
  "commentKeep": ["^// VENDOR-QUIRK:", "^-- migration:"]
}
```

astack tests each pattern against every line of a comment, both as written in the source (with `//`, `--` or `#`) and without the comment marker. A match keeps the whole comment. astack ignores a pattern that is not a valid regular expression. The hooks read the file from `CLAUDE_PROJECT_DIR`, and the commit check also reads it from the repo root. `/astack:no-comments` and the comment gate in `astack:pr-review-hardening` honour the same patterns, as `skills/pr-review-hardening/references/comments.md` describes.

## Change the comment length limit

Set `maxCommentLines` in the same file to change the longest comment block astack allows:

```json
{
  "maxCommentLines": 5
}
```

The value is a whole number of 1 or more, and astack ignores anything else. The doc comment limit stays at 12 unless `maxCommentLines` is higher.

## Failure handling

The hooks fail open. When something goes wrong, the tool call goes ahead as if astack were not installed:

- `bin/astack` exits 0 when it finds no Node or Bun runtime. It writes one line to stderr that says so.
- To deny, astack exits 2 and writes the reason to stderr. To add a note, it exits 0 and prints JSON. Otherwise it exits 0 and prints nothing.
- A handler that fails gives no verdict. The verdicts of the other handlers still apply.
- Unreadable input, a file it cannot tokenize, an `Edit` whose `old_string` does not match, and any internal error all pass silently.
- The merge guard is the one exception. When `gh` cannot read the PR, it refuses the merge, because it cannot see the threads or the CI state.
- Each hook has a 10-second timeout, and Claude Code lets a timed-out `PreToolUse` hook through.

A typical edit takes about 30 ms under Node and about 10 ms under Bun. Most of that time is runtime startup.

The hooks cover Claude's `Edit`, `Write` and `Bash` tools. They do not see files that other tools or people write, so run `astack check-comments` and `astack check-types` in CI when you need a guarantee.

## Run the checks yourself

`bin/astack` is on the Bash tool's `PATH` while the plugin is enabled. Outside Claude Code, run it by path. `astack check <name>` and `astack check-<name>` run the same check.

```sh
astack check-comments                 # working tree, staged and untracked files against HEAD
astack check-comments --staged        # the staged diff only
astack check-comments --base main     # HEAD against its merge base with main, for CI
astack check-comments --json          # machine-readable findings
astack check-types                    # the count rule of the type hook, on the same changes as check-comments
astack check-types --base main        # HEAD against its merge base with main, for CI
astack check-ticket ticket.md         # or - for stdin; --bug or --feature forces the type, --template <name> picks the repo template, --no-template skips it
astack check-pr body.md               # uses the repo's PR template when there is one; --template <name> picks one of several
astack check-plan docs/plans/x.md     # add --base main in CI, --strict before a plan goes active
astack check-plan --all               # every plan, plus the ones that are stale or ready to delete
astack check-plan --template          # a plan to start from; --template=programme or --template=brief
astack check-plan --as docs/plans/x.md -               # plan-mode text on stdin, checked under the path it gets after approval
astack plan-ticket docs/plans/x.md S1                  # the tracker body of a unit: umbrella, S1, B07/S2, Q3, or --frontier --out [<dir>]
astack plan trail x start "<decision>" "<why>" "<evidence>" "<result>"
astack plan draft x "<title>" "<why>" # an out-of-scope finding for the owner to file
astack plan delegate docs/plans/x.md on                # the delegation grant: delegate on, checkpoints report
astack plan export docs/plans/x.md --to linear --team Core --tracker -   # a write plan; also move, import, drift, keys
astack plan attended                  # attended, or unattended in a headless or SDK session
astack session start docs/plans/x.md  # then checkpoint, handoff, resume
astack board docs/plans/x/index.md    # drain first, the startable frontier, the WIP cap
astack skill-path astack:architect    # the SKILL.md path of an installed plugin skill
astack check-ste docs/x.md            # or - for stdin; --mode advise, --json, --profile <file>, --surface commit, --old <file>
astack check-migrations supabase/migrations --db <url> --reset "supabase db reset" --allow-pending   # the stack against the files of the branch
astack doctor                         # the runtime, the copies of each tool, Codex trust, duplicate skills and the profile
astack print codex-agents ~/.codex/AGENTS.md           # that file with the astack block in it; also print cursor-install
```

`check-comments` prints one line per finding and exits 1 when any finding is a deny. `check-types` prints each rise with its new lines and exits 1 when a deny count rises.

`check-ticket` and `check-pr` exit 1 when a heading is missing. `check-plan` prints `file:line: message` per problem and exits 1 on errors, and on warnings under `--strict`. A note, such as the size of a plan or the step count of a session, never fails. `plan-ticket` prints ticket bodies that `check-ticket --no-template` accepts, and `--out` with no directory writes them under the git common directory. `plan trail` appends a row to the plan's decision trail under the git common directory, which every worktree shares. `skill-path` exits 1 when the skill is not installed. `check-ste` exits 1 when a deny rule fires. `check-migrations` reads `supabase_migrations.schema_migrations` through `psql`. It exits 1 when an applied body differs from its file. It also exits 1 on a version with no recorded statements, and on an applied version with no file. Without `--allow-pending`, a file that the stack did not apply also fails. It prints the `--reset` command for the owner and never resets the stack.

## Build

The CLI source is in `src/astack/` in the astack source repo. `bun run bundle` writes `bin/astack.js` for Node, and Bun also runs it. `bin/astack` is a small POSIX launcher that finds a runtime and runs the bundle.
