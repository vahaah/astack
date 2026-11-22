# Test fixture requirements

[ADR 0022](../adr/0022-heavy-test-files-copy-one-template-repo.md) governs the template helper, the scan runner of `check:companion` and the timeout budget of the tests.
The [model](../../formal/FixtureIsolation.tla) examines one template, two copies, a build that can stop and a push from a copy.

## Acceptance criteria

- [criterion:FX-ISOLATE] A commit and a push in one copy leave the template, its origin and each other copy unchanged.
- [criterion:FX-INDEX] A new copy of a template with a tracked file passes `git diff-index --quiet HEAD`.
- [criterion:FX-TREE] `commitTree` writes the exact files, links and bytes of each branch. Two copies of one template get the same commit ids.
- [criterion:FX-ATOMIC] A build that throws leaves no template and no build folder.
- [criterion:FX-OWN-DIR] Two builds of one spec give two folders, and the cleanup removes each of them.
- [criterion:FX-REAL-SCAN] The test file of `check:companion` starts the real profile scan once. That scan names each problem of a companion with 5 scan mutations.

## Claim boundary

The model covers one template, two copies and at most 2 commits in each copy.
It takes git, the file copy and the index refresh as true observations.
The git spawn counts, the timeout budget and the suite times come from timed runs, and the PR Verification holds them.
