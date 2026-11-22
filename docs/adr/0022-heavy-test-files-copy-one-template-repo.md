# 0022. Heavy test files copy one template repo, and the suite runs at the 5 s default

Status: Accepted
Date: 2026-11-22
Ticket: none
Supersedes: none

## Context

B19 ran the suite with `bun test tests --parallel --timeout=20000`.
At the bun default of 5 s, 2 of 2 parallel runs failed 5 and 12 tests.
Each test that timed out ran a TLC triple, scanned or built the whole tree, or started a nested `bun test`.
A raise of the timeout for each test hides each slow test.

The fixture work of 6 heavy test files added load to each parallel run.
The two ci-pins files spawned git 6 or 7 times for each fixture repo, for 174 repos in each run.
The pr-head harness spawned git 7 times for each of 36 worlds.
The worktree and CI parity apply files built their seed repos again for each test.
The check-companion file started the nested profile scan 8 times.

## Decisions

### D1. A heavy test file copies one template repo for each test

`tests/git-template.ts` holds the template helper.
A file builds one template on its first use, in its own `mkdtemp` folder.
The build writes into a `build` folder and then renames it to `template`, so a build that throws leaves no template.
Each test copies the template, points the copied git config at the copy and refreshes the index of each copied repo.
When the commits of a fixture differ for each test, the fixture writes them with one `git fast-import` stream and one `git checkout -f`.
Each commit has a fixed past date, so two copies get the same commit ids.

The ci-pins files, the pr-head harness and the apply files of worktree and CI parity use the helper.
A file whose seed inputs differ builds one template for each distinct input.
`proofRepo` of the change-proof fixture keeps its own git calls, because the TLC triple sets the time of those tests.

#### Formal claim

A write or a push in a copy never changes the template, its origin or another copy.
Each ready copy has a clean index, and a template at its final path is a complete build.

```text
TemplateUnchanged == no copy writes the template, and a built template keeps its one commit
CopiesDisjoint    == only a copy writes its own repos
CopyIndexClean    == each ready copy has a clean index
NoPartialTemplate == a template at its final path is a complete build
```

The [model](../../formal/FixtureIsolation.tla) and its [configuration](../../formal/FixtureIsolation.cfg) check these invariants over one template, two copies and at most 2 commits in each copy.
They cover a build that stops, each order of the copy steps, and commits and pushes from each copy.

#### Category composition

```text
buildTemplate : FixtureSpec -> Template  effects: fs-read, fs-write, spawn, env
copyTemplate  : Template -> RepoCopy     effects: fs-read, fs-write
rewriteConfig : RepoCopy -> RepoCopy     effects: fs-read, fs-write
refreshIndex  : RepoCopy -> RepoCopy     effects: fs-read, spawn, env
commitTree    : RepoCopy -> RepoCopy     effects: fs-write, spawn, env
```

`buildTemplate` runs the build callback of the spec in a temporary folder and renames that folder at the end.
`copyTemplate` copies the template folder with its links and file modes.
`rewriteConfig` replaces each template path in the git config of each copied repo with the copy path.
`refreshIndex` runs `git update-index --refresh` in each copied repo that has an index.
`commitTree` takes a fixed `BranchSpec` and writes its commits with one `git fast-import` stream and one `git checkout -f`.

`copyRepo` calls `copyTemplate`, then `rewriteConfig`, then `refreshIndex`.
It uses plain calls and adds no composition operator, map, functor or monad, so no category law applies.
The record uses the `artifact` carrier and declares no composite arrow.

#### Implementation correspondence

`buildTemplate` maps to the `StartBuild`, `BuildStep`, `StopBuild` and `FinishBuild` actions of the model.
`copyTemplate`, `rewriteConfig` and `refreshIndex` map to the `CopyTemplate`, `RewriteConfig` and `RefreshIndex` actions.
`commitTree` and a commit of a test map to `Commit`. A push of a test maps to `Push`.
In the model, the git objects, the files and the index become one commit count for each repo and one clean flag for each copy.

D2 and D3 change the tests and the gates only.
They change no verdict of a session guard, so they map to the preservation relation of the session guards.

#### Verification

[The proof matrix](../../.astack/proof-coverage.json) links the criteria of [the fixture requirements](../reference/test-fixtures.md) to their tests.
The negative control keeps the template origin in `RewriteConfig`, and it must violate `TemplateUnchanged`.
That mutation is the defect of a copy that pushes to the origin of the template.
The normal test gate runs the template tests, the check-companion tests and each heavy test file.

### D2. check:companion takes its scan runner as a parameter

`checkCompanion` in `scripts/check-companion.ts` takes the profile scan runner as a parameter and returns its report.
It also catches the `ProjectConfigError` of a config.
One test runs the script with the real scan on a companion with 5 scan mutations.
The other tests call `checkCompanion` in process with a stub scan.
An environment switch that skips the scan is not used, because a user can set it.

### D3. The suite runs at the bun default of 5 s, with one named budget

`package.json` and `check:fast` run the tests with no `--timeout` flag.
`tests/heavy-test.ts` exports `heavyTestTimeout`, 20 s.
Only a test that runs a TLC triple, scans or builds the whole tree, or starts a nested `bun test` takes it.
The secrets tests keep their 120 s gitleaks budget.

A hook has the 5 s default too.
So a test that copies the whole tree removes its copy in the test, and not in an `afterAll` hook.
A test that runs many CLI cases splits into one test for each case, as the drift outputs test does.

## Consequences

- Easier: a slow test fails at 5 s, so a raise never hides it.
- Easier: the 6 heavy files take 62% to 65% of their trunk time in series.
- Harder: a new fixture that pushes or clones must copy a template through the helper, or pay its own git cost.
- Harder: a new test that runs a TLC triple, scans the whole tree or starts a nested `bun test` must import `heavyTestTimeout`.
- Follow-up: the submodule fixture of the change-proof tests can copy a template too.

## Alternatives considered

- `git clone --shared` or `--reference`. Rejected because the copies then share objects with the template.
- One repo for each file. Rejected because the tests then share commits.
- An add and a commit for each branch. Rejected because a repo then costs 53 to 71 ms, from 17 to 24 ms with one fast-import stream.
- Object writes in process. Rejected because they need a git library.
- A file-wide `setDefaultTimeout`. Rejected because it raises the timeout of each test in the file.
- A budget for each slow test. Rejected because each budget then hides a different slow test.
