# Keep the hardening gates at parity with CI

Apply, the parity check and `astack check ci-pins` follow these rules for each gate.

The gates of a hardening profile mirror the blocking jobs of the repo's CI.
`scripts/lib/ci-parity.ts` reads each pull request workflow of the repo and maps each job to a gate by its commands.
The `ciParity` field of `projects/<name>.json` holds the rest.
`setup` lists the CI commands that check nothing.
`map` maps a job, or one of its steps, to gates.
`exclude` lists the advisory and nightly jobs and steps.
An exclusion of a job needs proof in the workflow.
The proof is `continue-on-error`, an `if` that is false on a pull request without a label, no command, or an aggregate of mapped jobs.
`narrow` lets a gate run on fewer paths than its job.
Each entry gives its reason.
Apply prints the map.
It fails on a job with no gate or a gate that skips a path of its job.
It also fails on an exclusion with no proof and on a stale entry.

The check also reads the `env` of the workflow, of each mapped job, of its `container` and of each mapped step.
It compares them with the `ci_env` and `env` of the gate.
In a job that the config maps as a whole, each step that does more than prepare a gate is a mapped step.
It fails on a variable that the gate does not set or leave out with a `why`.
It also fails on a copied value that differs from CI and on a stale copy.
The run exports `CI=true` for every gate, as GitHub Actions does, and never fakes `GITHUB_ACTIONS`.

The check reads the tool versions that `oven-sh/setup-bun`, `supabase/setup-cli` and `actions/setup-node` pin in each mapped job.
A gate records the bun and Supabase CLI pins in its `tools`, and the run gets those versions through bunx.
The check fails on a gate that does not record a pin of its job, or records another version.
It also fails on a gate that records a tool that no job of the gate pins.
A tool that only a prerequisite or a setup entry of the gate runs is the exception.
Its version must be a pin of another job of the profile.
A gate records each pinned tool that it runs, because the run puts only the tools of the gate on the PATH.
A node pin needs a prerequisite that checks the version.
`src/astack/ci-pins.ts` holds the three setup actions and the reader of the version in a version file.
The bundle of the CLI builds from `src/astack/` only, so the reader is there, and the parity check imports it.

`astack check ci-pins` uses the same reader in preflight step 8 of the hardening run.
It stops a run when the PR changes a version that a setup action reads from a file.
When the PR changes only CI files, it compares the tool versions of CI at the merge base and at HEAD.
A tool version is the version that setup-bun, setup-cli or setup-node gets.
It is also the value of a `version` or `toolchain` input of another action.
Such an input name can have a prefix and a `-file` suffix, each with `-` or `_`.
The pin of such a step also holds its `uses` value with the ref, each other input and its `if`.
Each of them can change the tool that CI gets.
Each job also holds its runner, its container and service images and the ref of a remote reusable workflow that it calls.
A remote action whose name looks like a setup action holds its ref, also with no version input.
The check does not read a tool that a `run` step or a script installs, so the reviewers examine such a change.
The tool versions of a local action or a local reusable workflow count in the job that calls it.
They count in step order, with the inputs of that call only.
Each job that both sides hold must set up the same versions in the same order.
A job that loses its last setup step changes.
A new job can set up only a version of the merge base.
When the PR also removes a job that sets up a tool, a new job with a tool is a change.
A rename can move a version from one job to another.
Then the check exits 3, its last line starts with `ci_proof:`, and the run goes on in mode `ci_proof`.
A tool version change, a form that it cannot read on either side and an expression in a version input exit 1.
A PR can also add the parsed manifest of the change under `.astack/proof/` and delete a manifest of its base.
It can change declared proof records under `formal/`.
Those committed records must be regular non-executable UTF-8 Markdown with complete sections and separate roles.
This classification never grants proof success.
In mode `ci_proof`, a red gate is advisory only with a proof that the CI change of the PR makes it red.
A clean stop and the merge need each required check of the PR head to pass on a `pull_request` run.
That run takes the workflows of the PR.
A PR that also changes another file, or has a proof record that fails, gets the mode `ci_mixed`.
The tool versions must stay the same, and a move of the base must not change CI.
Then the check exits 3, and its last line starts with `ci_mixed:`.
In mode `ci_mixed`, each gate blocks, and the same read-back of CI applies.

The reader reads a file as the setup action reads it, in the same order and with the same truthiness.
A setup-bun step whose `bun-version` can be empty falls back to `package.json`.
When the `version` of `supabase/setup-cli` can be empty, the action reads the root `bun.lock`, then `pnpm-lock.yaml`, then `package-lock.json`.
The check reads them in the same order.
The bundle also runs on node, which has no YAML parser, so the CLI bundles the `yaml` package.
GitHub's own workflow parser for TypeScript uses that package too.
The check reads each file with it as YAML 1.2.
It stops the run on each YAML form that YAML parsers can read in different ways.
Such forms are a parse error or warning, a tag, an alias, a merge key and a key that the map repeats in any case.
An anchor name with a character that is not a letter, a digit, `_` or `-` stops it too.
So do a tab in an indent, a directive and a second document.
A lone CR, a line break that only YAML 1.1 reads and a byte order mark after the start also stop it.
A key that holds `${{` stops it too, because GitHub evaluates such a key.
The check reads the root keys `inputs` and `runs` of an action only in lower case, as the runner does.
Another case of them stops the run.
A `${{ inputs.<name> }}` value of a local action resolves to the value of each caller, or to the default of the input.
In a workflow it can also be empty, because a pull_request run gives no inputs.
A null or blank input is empty, as `getInput` gives it to the action.
The check names a remote action as the runner splits its `uses` value.
It maps a renamed repo to the repo that GitHub redirects to.
A `uses` value that starts with `./`, `.\\` or `$/` is a local action.
setup-bun picks its reader by the basename of the input as written, and the check does the same.
When `<ref>` moves after the merge base, the check also compares the merge base with `<ref>`, because a pull_request run tests the merge.
A version file that is missing or is not a regular file also stops the run.

So does a local action that the repo does not hold.
A gate names in `rewrites` each tracked file that a tool of the gate writes, and the run restores those files after the gate.
`scripts/lib/next-env.ts` finds each gate that runs `next build` or `next dev` in an app with a tracked `next-env.d.ts`.
It also finds a write through an output redirect, `tee` or an `-o` or `--output` flag.

Apply fails when that gate has no `rewrites` entry for the file, and when git does not track a `rewrites` path.
`scripts/lib/env-files.ts` finds each gate that runs a script or a runtime in an app folder with a tracked env example, such as `.env.example`.
It follows the scripts of the repo to each app that a web server of a Playwright suite starts.

Apply fails when git ignores the env file of that example and no prerequisite of the gate names an ignored env file of that folder.
`scripts/lib/task-cache.ts` follows the `bun run` scripts of each gate through the `package.json` files of the repo, also in the short form `bun <script>`.
Apply fails on a gate whose scripts run a fixer flag, such as `--write`.
Apply fails on a gate that runs a turbo task with no `--force` when the gate does not set `TURBO_FORCE` to `true` in `ci_env`.

A task with `cache: false` in `turbo.json` needs neither.
`scripts/lib/platform-tools.ts` follows the same scripts, and each file that a script runs, to a tool that only one platform ships, such as `lockf`.
Apply fails on a gate that reaches such a tool, unless a prerequisite check fails when the tool is missing, such as `command -v lockf`.
A check that ends in `|| true`, `|| echo` or `; true` passes on each host, so it does not count.
An if in the gate command can guard the tool too.
Its condition must fail when the tool is missing, and its else branch must run a portable form without the tool.

The rest of the command, outside each such if, must not reach the tool.
A gate that applies migrations to a local stack that lives longer than one run runs `astack check migrations` before and after `supabase migration up`.
`src/astack/migrations.ts` compares the statements that the stack recorded with the migration files.
A gate on such a stack starts it with `astack stack start`, and has a prerequisite that runs `astack check stack-config`.
The parity check compares the `--run` command of that start with the start step of CI.
It ignores a redirect of standard output to `/dev/null`.
`src/astack/stack-config.ts` compares a digest of the watched files of the checkout with the record that `astack stack start` wrote when it started the stack.
