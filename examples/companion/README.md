# Example companion

This folder is a synthetic companion. It has the same shape as the private companion of an owner. astack uses it when you give no other companion, and the tests always use it.

## Point astack at a companion

astack finds the companion in this order:

1. The `--companion <dir>` flag.
2. The `ASTACK_COMPANION_DIR` variable.
3. This folder, `examples/companion/`.

A command that writes refuses this folder. Examples are `apply --worktree` and `deny add`. To write, make a companion with the same shape, and point astack at it.

## What it holds

| Path | What it holds |
|---|---|
| `projects/acme.json` | The apply config of the synthetic project `acme`. |
| `projects/acme/pr-review-hardening.profile.md` | The hardening profile of `acme`. |
| `projects/acme/branches/v2/pr-review-hardening.profile.md` | The hardening profile of the `v2` overlay of `acme`. The `branches` object of `projects/acme.json` holds the overlay. |
| `deny/names.sha256` | One sha256 on each line, for each denied name. |
| `rules/owner.md` | One sample owner route. `bun run apply --global` links each Markdown file of `rules/` into the rules folder as `companion-<name>`. |
| `profile-scan.json` | The exception rows of the profile scans. The example has none. |

The tests make the target repo of `acme` in a temporary folder. `acme` uses the branch prefix `dev/` and the ticket key `ABC`.

## The deny list

Each line of `deny/names.sha256` is the sha256 of one lowercase token. For a name with more than one word, the line is the sha256 of its lowercase tokens joined with no space.

This list holds 2 hashes. One is of a synthetic token, and one is of a synthetic two-word name. Neither name occurs in this repo, so the list never fails the scan of the public tree. Do not put a real name in this list, because a short name is easy to find from its hash.

## The profile scans

The profile tests of this repo scan each hardening profile of this folder. `bun run check:companion` runs the same tests with `ASTACK_PROFILE_SCAN_DIR` set to the companion, so they also scan each profile and overlay of the companion. The tests read the exception rows of each scan from `profile-scan.json`. Each row names its project in `profile`, and gives its reason.

| Table | What a row allows |
|---|---|
| `sharedServices` | A check that probes a port of a service that runs no code of the tree. |
| `stacks` | A long-lived local stack, with its reset, its watched files, its ports and the gates that CI runs in one job. |
| `tiedResets` | A reset that a check ties to the worktree. `proof` names the `describe` of a test that runs that check. |
| `sharedTargets` | A reset of a shared target that an open decision of the profile names. |
| `describesOnly` | A line of a profile that names a read of a PR, but does not read one. |

A test of the companion goes in `tests/*.test.ts`, and `bun run check:companion` runs it with the profile scans.
