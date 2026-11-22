# Apply managed files to a product repo

Apply follows these rules for the managed files of a repo and for its commits.

`src/astack/managed.ts` lists the files that apply deletes and merges.
Apply writes the `managed` list of each repo into its `.astack/profile.json`, and `astack managed <path>` reads it.
A review finding on a managed file gets its fix here, and then an apply with `--update` to each repo with a profile.

Apply fails on a tracked copy of the review stub or of the hardening command at a path that it does not write or delete.
`scripts/lib/line-citations.ts` fails apply on a tracked Markdown file outside the managed list that cites a managed file with a line number, such as `.claude/pr-review-hardening.profile.md:12`.
Each apply update can move that line.
The subject of each apply commit names the files that the commit deletes.

An apply with `--worktree` refuses an astack tree with no commit, or with an uncommitted change in `marketplace/`, `rules/`, `scripts/`, `src/`, `templates/` or `upstream/`.
It also refuses a companion with no commit or with an uncommitted change.
Its commit names the astack commit in an `Astack-Commit` trailer, and the companion commit in a `Companion-Commit` trailer.
With `neutralCommit` in the project config, the subject and the body name no tool, and the trailer key is its `provenanceKey`.
Apply refuses such a commit message when it holds a substring of `lint.denySubstrings`.
Apply also writes that list into `neutral.deny` of the repo's `.astack/profile.json`.
A check in the repo then reads the same list.
