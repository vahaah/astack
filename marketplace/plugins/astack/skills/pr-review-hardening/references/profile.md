# Profile reference

A repo configures the hardening loop in `.claude/pr-review-hardening.profile.md`. The file is Markdown. The loop reads the first fenced code block tagged `yaml` or `json` and ignores the prose around it. Use the prose for the reasons behind the values, known problems and decisions still open.

Every key except `version`, `gates` and `test` is optional. An unknown key is an error, so a typo never passes silently.

The review stub that astack apply writes into a repo has a fallback for a session without the plugin. That fallback has no defaults. So a profile next to the stub sets every key that the fallback names, even at its default value. apply refuses a profile that leaves one out.

## Top level

| Key | Type | Default | Meaning |
|---|---|---|---|
| `version` | integer | required | Schema version. Always `1`. |
| `base` | object | see below | How the run picks the base branch. |
| `iterations` | object | `{min: 1, max: 2}` | Iteration bounds. |
| `after_create_pr` | `harden` or `none` | `none` | `harden` runs this loop once, right after the agent creates a PR on the owner's "create pr". |
| `push` | `when-authorised`, `each-commit` or `never` | `when-authorised` | When fix commits are pushed. |
| `guardrails` | list of strings | `[]` | Repo rules restated at the start of every iteration, after the loop's own rules. |
| `gates` | list of gates | required | Deterministic gates other than the test suite, in run order. May be empty. |
| `test` | gate | required | The full test suite. It runs after `gates`. |
| `metrics` | object or `null` | `null` | A read-only command that prints JSON counts, and the counts that must never increase. |
| `type_coverage` | object or `null` | `null` | A type-coverage command and its floor. |
| `typescript` | object or `null` | `null` | Turns on `references/typescript.md`. |
| `reviewers` | object | see below | Which reviewers run and what they are told. |
| `test_adequacy` | `changed-behaviour` or `control-per-clause` | `changed-behaviour` | When a missing test blocks. |
| `ledger` | object | `{carry_over: false}` | Whether earlier runs' findings carry over. |
| `prepasses` | list | `[]` | One-off passes before the baseline. |
| `comments` | object | `{keep_patterns: []}` | Extra keep patterns for the comment gate. |
| `forbidden` | object | see below | Commands, code, paths and gate flags the run must never use or touch. |
| `conventions` | object | see below | Branch, commit, PR and ticket conventions. |
| `proof` | object | `{pr_comment: null, on_unclean: null}` | Proof posted on the PR, and what an unclean stop does. |
| `threads` | object | `{answer: false}` | Whether review-bot threads are answered and resolved. |
| `merge` | object | `{after_clean_stop: report}` | Whether the run merges after a clean stop. |

## Gate

`gates` entries and `test` share this shape.

The profile's gates mirror the blocking jobs of the repo's CI. A gate that applies but cannot start is an unclean stop. The run never skips it.

Give each blocking CI job a gate that runs the same command. When the job starts services or seeds data first, the gate names them in `setup` and `requires`. When the job runs only for some paths, the gate names them in `when_changed`. When the job runs on every pull request, keep `when_changed` empty.

astack apply compares the gates with the repo's pull request workflows. It refuses a profile that leaves a blocking job with no gate. It also refuses a gate that skips a path on which its job runs. An excluded job needs proof in the workflow that it is advisory or never runs on a pull request.

The project config of astack can map a CI job or one of its steps to gates. astack apply then compares each command of the step with the command, the `setup` commands and the prerequisites of those gates. A step whose command no mapped gate runs needs a `differs` reason in the map entry. The parity report prints each such step as `DIFFERS`, with the reason. The check skips a `set` line of shell options.

List the gates that map to the steps of one job in the order of those steps. astack apply refuses another order. The run always runs the test gate last, so the report only notes a test step that comes before another gate.

`next build` and `next dev` write the `next-env.d.ts` of their app again when the text in it is not the text of the command. So a gate that builds the app or starts its dev server can change a tracked file. Name that file in the `rewrites` of the gate, and the run restores it after the gate. When git tracks the `next-env.d.ts` of an app, astack apply fails on each gate that runs `next build` or `next dev` in that app without that entry.

An output redirect writes its target in the same way, such as `supabase gen types typescript --local > src/types/db.generated.ts`. astack apply fails on each gate that redirects output into a tracked file without an entry for that file. The redirect can be in the gate entry or in a package script that the gate runs. astack apply also fails on a `rewrites` path that git does not track. To remove the entry, remove the file from git with `git rm --cached`. Then add it to `.gitignore`.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `name` | string | required | Short kebab-case name. It prefixes the gate's output lines, as in `TYPECHECK_EXIT`. |
| `command` | string | required | The exact command. The run runs it with bash, in its own subshell from the repository root. It must not write tracked files, other than the files in `rewrites`. |
| `env` | list of `{name, why}` | `[]` | Variables that must be set before the gate runs. The run stops if one is missing. |
| `ci_env` | list of `{name, value, why}` | `[]` | The `env` values of the CI jobs of the gate, which the run exports. See "CI environment" below. |
| `requires` | list of prerequisites | `[]` | Services and tools that must be ready before the gate runs, such as a database or a dev server. See below. |
| `setup` | list of strings | `[]` | Commands that run in order before each run of the gate, as the CI job's steps do before its check. Each one runs with bash, in its own subshell from the repository root, so a `cd` in one command never moves the next command. A failed setup command stops the run. |
| `when_changed` | list of globs | `[]` | Run only when a path in `git diff --name-only --no-renames <BASE_SHA>...HEAD` matches a glob of the list and no glob that starts with `!`. Empty means always. A list needs at least one glob without `!`. |
| `optional` | boolean | `false` | When the command's script does not exist on this branch, report `UNAVAILABLE` instead of stopping. |
| `side_effects` | string | none | Effects outside the tree that the gate is allowed to have, such as resetting a local test database. Required when the gate has `setup` commands or a prerequisite with `on_missing: start`. |
| `after` | list of gate names | `[]` | Gates that write an output this gate needs, such as a build that an end-to-end gate serves. Each one runs earlier in the list, and its `when_changed` is empty or the same as this gate's. When one of them does not exit 0, this gate is `BLOCKED`, as `references/gate.md` says. |
| `tools` | mapping of `bun` and `supabase` to exact versions | `{}` | The versions of bun and the Supabase CLI that the CI jobs of the gate pin, such as `{bun: "1.3.14", supabase: "2.117.0"}`. See "Tool versions" below. |
| `rewrites` | list of `{path, why}` | `[]` | Tracked files that a tool of the gate writes, such as the `next-env.d.ts` of a Next.js app. `path` is one file in the repo, with no glob. `why` names the tool and the reason. Right after the gate ends, the run restores each of these files that had no change before the gate. It restores from the root with `git -C <WORKTREE> checkout -- <path>`. A write to another tracked file makes the gate red. |

## CI environment

Each gate runs in the CI environment of its jobs. Before its prerequisites, its `setup` commands and its command, the run exports `CI=true`, then each `ci_env` entry that has a `value`. An entry with a `why` and no `value` leaves its variable as the session has it, and that holds for `CI` too. The run never sets `GITHUB_ACTIONS` or another `GITHUB_` or `RUNNER_` variable, because no gate runs on GitHub Actions.

GitHub Actions sets `CI=true` for every step. A tool that reads `CI`, such as a Playwright config with `forbidOnly`, `retries` or `reuseExistingServer`, then behaves in the gate as it does in CI. With `CI=true` a gate can need other prerequisites than a local run, such as free ports where CI starts its own servers.

Each `ci_env` entry has one of three forms.

| Form | Meaning |
|---|---|
| `{name, value}` | The run exports the value. It is the value that CI sets. |
| `{name, value, why}` | The run exports the value. It differs from CI for the reason in `why`. |
| `{name, why}` | The run does not set the variable, for the reason in `why`. The session's value stays. |

A value is a string. An entry for `GITHUB_ACTIONS` or another `GITHUB_` or `RUNNER_` variable has no `value`. A name in `env` is not in `ci_env` too.

astack apply compares `ci_env` with the pull request workflows. For each job that maps to the gate, it reads the `env` of the workflow, of the job and of the job's `container`. It reads the `env` of each service of the job too. It reads each name that a step writes to `$GITHUB_ENV` with `echo "NAME=value"`, a `{ }` group of such lines or a heredoc. It also reads the `env` of each step that maps to the gate by its command or by a step mapping. In a job that the project config maps as a whole, it reads the `env` of each step that does more than prepare a gate. Each variable needs an entry in `ci_env` or in `env`. A variable that CI sets from an expression, such as a secret, goes in `env` or gets a `why`. A `{name, value}` entry must hold the CI value, and a CI job of the gate must set it. `CI=true` needs no entry.

A step that writes to `$GITHUB_ENV` with another command fails the check, because the check cannot read the names. The project config can map or exclude that step with a reason that says how each gate gets the names. For each host port of a service of a job, a gate of the job names the port. The name can be in its command, in a prerequisite, in a `setup` command or in the `why` of a `ci_env` entry.

The check cannot see the differences below. Write each one that applies in the prose of the profile.

- The `env` of a step that only prepares a gate.
- Code that reads `GITHUB_ACTIONS` or another variable of the runner.
- A gate that runs its check in a container. The container gets only the variables that the command gives to it.
- The shell of a step. GitHub runs a `run` step with `bash -e`, or with `-eo pipefail` when the step sets `shell: bash`.
- A linter that only warns, such as Biome without `--error-on-warnings`. CI passes the same warnings.

## Globs

A glob matches the whole repo-relative path. `*` matches inside one folder, and `**` matches across folders. So `*.md` matches only the Markdown files at the root, and `**/*.md` matches them in every folder. Git's glob pathspec matches the same way. `git diff --name-only --no-renames <BASE_SHA>...HEAD -- ':(glob)<glob>' ':(glob,exclude)<glob without its !>'` prints the paths that make the gate apply. CI splits a rename into a delete and an add, so `--no-renames` lists both paths.

## Prerequisite

Each entry of a gate's `requires` has this shape.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `name` | string | required | What must be ready, such as `local Supabase` or `portal on port 3300`. The report uses this name. |
| `check` | string | required | A read-only command. Exit 0 means the prerequisite is ready. It runs with bash, in its own subshell from the repository root. |
| `on_missing` | `stop` or `start` | required | What the run does when `check` fails. `stop` stops the run in principled incompletion and names the prerequisite. `start` runs `start`, then runs `check` again, and stops the same way if it still fails. There is no value that skips the gate. |
| `start` | string | none | The command that makes the prerequisite ready. It returns when it is ready. It runs with bash, in its own subshell from the repository root. Required when `on_missing` is `start`. |

The run checks the prerequisites of a gate only when the gate applies to the diff. A prerequisite that the run cannot check, or a command that it cannot start, is a gate that cannot start.

A check fails when a tool that it runs is missing. In bash, a command that does not exist is false in the condition of an `if` and after `!`. So `if lsof -t -iTCP:3000 -sTCP:LISTEN; then exit 1; fi` passes without `lsof`, and the port seems free when it is in use. Start such a check with `command -v <tool> >/dev/null &&`. Give each tool that the gate command runs, such as `curl`, `psql`, `jq` or `docker`, a check that fails without it.

A check prints no secret, as "Secrets" in `references/gate.md` says. `supabase status` and `supabase start` print the keys of the stack. So a check, a `start` command and a restart command send their standard output to `/dev/null`. Standard error still shows the progress and the errors. No entry prints the environment, a `.env` file or a value of the session, such as with `env`, `cat .env` or `echo "$KEY"`.

A check cannot prove that a running server serves the code of `HEAD`. A server of another checkout, or a server that started before a fix commit, serves other code, and the gate then tests the wrong code. So the gate starts each server that runs code of the tree, as the next paragraph says. A prerequisite never asks a server whether it runs, over HTTP or with a TCP probe such as `nc -z`. A shared service that runs no code of the tree, such as Redis, is the only exception. A suite can start its own servers and use a server that already listens. Then check that each port is free.

A gate that starts a server needs a prerequisite that each port of the server is free. A server that already listens there can answer the readiness probe of the gate, and the gate then tests old code. The gate stops each process that it started, and no other process. Start each server with `set -m`, so that it gets its own process group. Keep its `$!`. In an `EXIT` trap, stop each group with `kill -TERM -- -<pid>`, and then `wait`. Never stop a process that you find by its port. A process that the run did not start can hold that port.

A file that git ignores, such as a `.env` file, is not in a new worktree. When the gate needs one, add a prerequisite that checks it, and put the file in the name. Without it, the gate fails for a reason that is not in the PR. astack apply finds each gate that runs a script or a runtime in an app folder with a tracked env example, such as `.env.example`. It fails when git ignores the env file of that example and no prerequisite of the gate names an ignored env file of that folder.

A prerequisite never checks a file that an earlier gate of the run writes, such as a build output. The preflight checks every prerequisite before any gate runs, so the check fails in a new worktree and proves nothing in an old one. Name the earlier gate in `after`.

## Tool versions

CI pins the version of bun with `oven-sh/setup-bun` and of the Supabase CLI with `supabase/setup-cli`. Another version can pass where CI fails. So record each pin of the jobs of a gate in its `tools`. A prerequisite or a setup entry can run a tool that the CI job of the gate does not pin. An example is a local Supabase stack in place of a CI database service. Record that tool in the `tools` of the gate too. Use the version that another CI job of the profile pins. The run puts only the tools of the gate on the PATH. Each gate runs bun and the Supabase CLI at the versions in its `tools`, and so does each script that it starts. The run gets each version through bunx, as `references/gate.md` says. When bunx cannot get a pinned version, the gate runs the local version. The final report names each difference as a note, and the run goes on. It is not an unclean stop. CI runs the pinned versions, and CI gates the merge. So a local run with a version note is advisory for that tool.

astack apply reads the pins of each job. It fails on a gate that does not record a pin of its job, or records another version. It also fails on a gate that records a tool that no job of the gate pins. So a new pin in CI stops the next apply until the profile records it.

`actions/setup-node` pins node, and bunx does not give node. Give each gate of such a job a prerequisite that checks the version, such as `test "$(node --version)" = v22.11.0`, with `on_missing: stop`.

## Migrations of a local stack

CI starts a new database, so it applies every migration file of the branch. A local stack can live longer than one run, and worktrees can share it. `supabase migration up` applies only the versions that the stack does not have. It skips an applied version whose file changed, and a compare of the versions does not see that.

A gate that applies migrations to a local stack that lives longer than one run compares the stack with the migration files first. Before `supabase migration up`, its `setup` runs `astack check migrations <folder> --db <url> --reset <command> --allow-pending`. After it, the same command runs without `--allow-pending`.

The check reads the statements that the stack recorded in `supabase_migrations.schema_migrations`, and compares them with each file. It ignores comments and whitespace. It fails on a changed body, on a version with no recorded statements and on a version that the branch has no file for. Without `--allow-pending`, it also fails on a file that the stack did not apply. The failure prints the `--reset` command for the owner. The run never resets the stack, because a reset deletes its data. Give the gate a prerequisite that checks `command -v astack`, with `on_missing: stop`.

Some gates make their database again from the files on each run, such as with `supabase db reset` on a stack that only the run uses. They need no check.

## Config of a local stack

`supabase start` reads `config.toml` and the email templates, and a stack keeps them until it starts again. `supabase db reset` makes only the database container again. CI starts a new stack from the config of the branch. So a gate on a stack that lives longer than one run can test another config. Worktrees can share a stack, and then it holds the config of the checkout that started it last.

Start such a stack with `astack stack start <folder> --watch <path> --run <command>` in the `start` of its prerequisite. `<command>` is the start command of the stack, such as `cd supabase && supabase start >/dev/null`. astack runs it with bash from the current folder. Then it records a digest of the files of each `--watch` path in this checkout, and the IDs of the containers of the stack. The record is in the git folder that all worktrees of the clone share. astack records nothing when `<command>` fails, or when a container of the stack ran before `<command>`. `supabase start` does nothing when the stack runs, so that stack keeps an earlier config.

Give each gate on such a stack a prerequisite that runs `astack check stack-config <folder> --watch <path> --restart <command>`, with `on_missing: stop`. Use the `--watch` paths of the `astack stack start` command. `<folder>` holds the `config.toml` of the stack. Each `--watch` path is a file or a folder that the stack reads at its start, such as `config.toml`, its template and the `templates` folder. The check reads the `project_id` of `config.toml`, the record of that project and the containers of that project that run. It fails when no container runs, when no record exists, or when no container of the record still runs. It also fails when the digest of the files of this checkout differs from the record. The failure prints an `astack stack start` command with the `--restart` command for the owner. The run never restarts a stack, because other worktrees can use it.

A database that `supabase db start` starts is such a stack too. Find a gate on such a stack by its `supabase start`, `supabase db start` or `supabase status`, or by a `pg_isready` check of a port.

## Data of a local stack

A gate that resets a stack or a database, such as with `supabase db reset` or `dropdb`, needs a check that ties the target to this worktree. An example is a check that the folder of the stack is under `$(pwd -P)`. When every worktree shares the target, name it in the open decisions of the profile.

CI starts each job on a new stack. So when an earlier gate seeds a stack, the next gate on it starts its `setup` with the reset of the stack. Gates that CI runs in one job on one database are the exception.

## base

| Key | Type | Default | Meaning |
|---|---|---|---|
| `default` | string | `main` | The base branch when no argument and no PR base applies. |
| `from_pr` | boolean | `false` | Use the PR's `baseRefName` when a PR exists. Set it for stacked PRs. |
| `sync` | `none` or `merge` | `none` | What the run does when the branch lacks commits of the base. CI tests the merge of the branch into the base, so the gates need those commits. `merge` merges `origin/<base>` in. `none` stops the run in principled incompletion. A rebase is never allowed. |

## iterations

| Key | Type | Default | Meaning |
|---|---|---|---|
| `min` | integer, at least 1 | `1` | A clean stop needs at least this many iterations. |
| `max` | integer, at least `min` | `2` | The run stops after this many iterations. |

## metrics

| Key | Type | Default | Meaning |
|---|---|---|---|
| `command` | string | required | Prints one JSON object of counts. Exit 0 means the counts are valid. |
| `never_increase` | list of strings | required | Keys whose value may not rise from one iteration to the next. |
| `fallback` | string | none | A command to run when `command`'s script is missing on this branch. |

With no `metrics`, the run reports `METRICS=UNAVAILABLE` and has no budget check. The loop never re-creates a metrics script from memory.

## type_coverage

| Key | Type | Default | Meaning |
|---|---|---|---|
| `command` | string | required | Prints the type-coverage percentage. |
| `min_percent` | number | `99` | The floor. Coverage must also not drop below the baseline. |

## typescript

| Key | Type | Default | Meaning |
|---|---|---|---|
| `rules` | boolean | `true` | Apply `references/typescript.md` to fixes. |
| `boundary_cast_marker` | string or `null` | `null` | A comment prefix that must sit on every remaining non-const cast. Set it only together with a keep pattern that matches it. |

## reviewers

| Key | Type | Default | Meaning |
|---|---|---|---|
| `select` | `applicable` or `all` | `applicable` | `applicable` picks agents by what the diff changes. `all` runs every agent in `agents`. |
| `agents` | list of strings | the five below | `pr-review-toolkit` agent names. |
| `extra` | list of `{name, invoke, when}` | `[]` | More reviewers. `invoke` says how to run one, such as a Skill name or an Agent `subagent_type`. `when` says when it applies. |
| `checklists` | list of `{path, use}` | `[]` | Repo files the reviewers and the checklist pass apply. `use` says which part applies. |
| `notes` | list of strings | `[]` | Lines added to every reviewer prompt, such as a threat model for a gate PR. |

The default agents are `code-reviewer`, `silent-failure-hunter`, `pr-test-analyzer`, `comment-analyzer` and `type-design-analyzer`. `code-simplifier` is never allowed, because it edits code.

Two astack extras, as `references/review.md` describes:

```yaml
reviewers:
  extra:
    - name: standards-and-spec
      invoke: the Skill tool with astack:code-review, using the base branch as the fixed point
      when: always
    - name: interrogate
      invoke: read the SKILL.md that astack skill-path astack:interrogate prints, and run it on git diff <BASE_SHA>...HEAD
      when: the diff changes a public API, adds or edits a database migration, or adds a dependency between workspace packages
```

## ledger

| Key | Type | Default | Meaning |
|---|---|---|---|
| `carry_over` | boolean | `false` | Start from earlier runs' ledger for the same branch. |

## prepasses

Each entry is `{name, when, sources}`. `name` is `contract-coverage` or `claims-audit`. `when` says which PRs it applies to. `sources` lists the specs to check against, for `contract-coverage`.

## comments

| Key | Type | Default | Meaning |
|---|---|---|---|
| `keep_patterns` | list of regular expressions | `[]` | A comment line that matches one survives the comment gate. Each pattern is a repo owner's decision. Add one only when the owner decides that form stays, and give the reason in the prose. |

## forbidden

| Key | Type | Default | Meaning |
|---|---|---|---|
| `commands` | list of regular expressions | `[]` | Commands the run must never execute. Each is matched against the whole command line as typed. Anchor with `^` to match only a command run from the repository root. |
| `code` | list of regular expressions | `[]` | Patterns a fix must never add, on top of the suppressions in `references/fix.md`. |
| `paths` | list of globs | `[]` | Paths a fix must never edit, on top of the fix fence. Name the repo's lockfiles, migrations and CI config here. |
| `gate_flags` | list of strings | `[]` | Flags that make a gate command, a `setup` command or a prerequisite invalid, on top of the write flags in `references/gate.md`. |

## conventions

| Key | Type | Default | Meaning |
|---|---|---|---|
| `branch.create` | string | `review-hardening/<short-name-or-date>` | Template for a branch the run creates when it starts on the base branch. |
| `branch.pattern` | regular expression or `null` | none | A branch the run creates must match it. `null` sets no pattern. |
| `commit.subject` | string | `fix(review): <finding-id> <short factual summary>` | Template for fix commit subjects. |
| `commit.trailers` | list of strings | `[]` | Trailer keys to keep on every commit, such as a session link. |
| `pr.title` | string | none | The PR title form, kept when the run edits the PR. |
| `pr.body_first_line` | string | none | The required first line of the PR body. |
| `pr.forbidden_body_words` | list of strings | `[]` | Words the PR body must not contain. |
| `ticket.key_pattern` | regular expression | none | The form of a ticket key. |

## proof

| Key | Type | Default | Meaning |
|---|---|---|---|
| `pr_comment.heading` | string | required if `pr_comment` is set | Heading of the comment posted after each iteration. `<n>` becomes the iteration number. |
| `pr_comment.extra` | list of strings | `[]` | Items the comment must also carry. |
| `on_unclean.draft` | boolean | `false` | Return the PR to draft after an unclean stop. |
| `on_unclean.label` | string | none | Label to add after an unclean stop. The run creates it if it is missing. |
| `on_unclean.post_to` | list of `pr` and `issue` | `[]` | Where to post the unresolved findings with their reasons. |

## threads

| Key | Type | Default | Meaning |
|---|---|---|---|
| `answer` | boolean | `false` | Answer and resolve every review-bot thread before a merge. |

## merge

| Key | Type | Default | Meaning |
|---|---|---|---|
| `after_clean_stop` | `report` or `merge` | `report` | `merge` lets the run merge after a clean stop. Keep `report` under the `astack:mode` Shipping playbook and its Autopilot playbooks, because they verify each PR before it merges. |
| `command` | string | required for `merge` | The merge command. |
| `fallback` | string | none | The merge command to use while `command`'s script does not exist yet. |
| `conditions` | list of strings | `[]` | Conditions the run checks and prints evidence for before it merges. |

In mode `ci_proof`, the run also does the CI read-back of `references/gate.md` before a clean stop and before a merge, whatever `after_clean_stop` and `conditions` say.

## Draft a profile

When a repo has no profile, propose one and let the user approve it. Do not run the loop on a draft.

1. Find each command in this order: `package.json` scripts, `AGENTS.md` or `CLAUDE.md`, the README or contributor docs, then CI config.
2. Typecheck: an existing script such as `typecheck`, `type-check`, `check:types` or `ts:check`. Without one, use the project's installed compiler in no-emit mode. Never install a dependency.
3. Lint and format: a read-only CI form such as `biome ci .`, `biome check .` or `eslint .`. Never a form with a write flag. Prefer the repo's pinned binary (`./node_modules/.bin/<tool>`, or `bunx --bun <tool>`) over one on `PATH`, which may be a different version.
4. Tests: the full suite script. Never narrow it to changed files. Read the docs for variables and services that the suite needs, and list them under `env` and `requires`. Do not miss one that makes tests skip silently when unset.
5. CI: read each workflow that runs on a pull request, and the scripts that its steps call. Give each blocking job a gate with the same command. Put the job's preparation steps in the gate's `setup` and `requires`, and its path filter in `when_changed`. Record each bun and Supabase CLI version that the job pins in the gate's `tools`. List the gates of one job in the order of its steps. When the gate applies migrations to a local stack that lives longer than one run, add the checks of "Migrations of a local stack". When the gate builds a Next.js app with a tracked `next-env.d.ts`, name that file in `rewrites`. Do the same for each other tracked file that the gate writes, such as generated database types. Give a node version that the job pins a prerequisite that checks it. Keep `when_changed` empty when the job has no path filter. Copy the `env` of the workflow, of the job and of the gate's step into `ci_env`. Then read each config that checks `CI`, such as the Playwright config. Give the gate the prerequisites that it needs with `CI=true`. A browser or end-to-end job is a gate too, with the stack it needs as prerequisites. List the advisory and nightly jobs in the prose with the reason that no gate runs them.
6. Task runners that cache results can replay a green run over a red tree. If the repo's runner caches, add its no-cache flag to the gate command, such as `--force` for turbo. A script can run more than the runner, and then the flag reaches the wrong command. Then set the runner's variable in `ci_env` with a why, such as `TURBO_FORCE=true`. astack apply follows the `bun run` scripts of each gate through the `package.json` files of the repo. It fails on a gate that runs a turbo task with no `--force` when the `ci_env` of the gate does not set `TURBO_FORCE` to `true`. A task with `cache: false` in `turbo.json` needs neither.
7. Metrics and type coverage: only if the repo already has a command. Otherwise leave them `null`.
8. Conventions: copy the branch, commit and PR rules from the repo's instruction files and PR template.
9. Comment forms the repo requires, such as cast justifications or decision citations, conflict with the keep list. List them in the prose as open decisions. Do not add keep patterns for them without the owner's decision.

## Template

````markdown
# PR review hardening profile

Settings for the PR review hardening loop in this repo. The loop reads the YAML block below.

```yaml
version: 1
base:
  default: main
iterations:
  min: 1
  max: 2
after_create_pr: none
push: when-authorised
gates:
  - name: typecheck
    command: <typecheck command>
    env: []
    requires: []
    setup: []
    when_changed: []
    ci_env: []
    tools: {}
    rewrites: []
  - name: lint
    command: <the repo's own read-only lint script>
    env: []
    requires: []
    setup: []
    when_changed: []
    ci_env: []
    tools: {}
    rewrites: []
  - name: e2e
    command: <browser test command of the CI job>
    env: []
    requires:
      - name: <service the suite needs>
        check: <read-only command that exits 0 when it is ready>
        on_missing: stop
    setup: []
    when_changed:
      - <each glob of the path filter of the CI job>
    ci_env:
      - name: NODE_OPTIONS
        value: <the value that the CI job or its step sets>
    tools: {}
    rewrites: []
test:
  name: test
  command: <full test command>
  env: []
  requires: []
  setup: []
  when_changed: []
  ci_env: []
  tools: {}
  rewrites: []
metrics: null
reviewers:
  select: applicable
comments:
  keep_patterns: []
forbidden:
  paths:
    - <lockfile>
    - <migrations glob>
    - <CI config glob>
```

## Notes

<Why each value is what it is, known baseline reds, and decisions still open.>
````
