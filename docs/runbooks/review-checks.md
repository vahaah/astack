# Check review growth and spec links

Run the CLI checks before the existing repo gates.
They do not replace tests, static checks, or verification of the user's journey.

## Review growth

Record the merge base and head immediately before the first review.
Keep their full commit SHAs across resumes and later runs.
The hardening protocol stores them in its fixed first-review record beside the findings ledger.

```sh
astack check review-growth --base <base-sha> --first-reviewed <first-reviewed-sha> --head HEAD
```

The command compares both tree diffs against that same base.
It reports added lines, removed lines, changed files, and binary files.
Text growth is the change in added plus removed lines between those snapshots.
The default warning requires growth above both 200 lines and 50 percent of the first diff's text changes.
Use `--max-growth-lines` and `--max-growth-percent` to set other advisory thresholds.
The warning uses a strict comparison, so equality does not warn.
Binary counts show changes that line counts cannot measure.

A warning exits 0.
It does not add a review round or block a PR.
Invalid inputs and unreadable Git data return a failure instead of zero growth.
Report an unavailable comparison with its reason.
A base update can add unrelated changes to the fixed-base diff.
Keep that limit with the result.

## Spec links

Use the [installed matrix contract](../../marketplace/plugins/astack/skills/pr-review-hardening/references/spec-links.md).
The declared source files define the criterion and control inventories.
The matrix links those inventories and records justified exemptions.

```sh
astack check spec-drift <matrix.json>
```

Run the mapped controls through the existing test gates after the link check.
Missing source files and broken links exit 1.
Invalid arguments and unreadable or invalid matrices exit 2.
Confirm a critical control by removing the implementation it checks and seeing it fail.
A link check cannot prove that a test runs or checks the requirement correctly.

## Optional adversarial review

The user or repo profile can request `astack:interrogate` for a stated risk.
Each reviewer must run a reproduction.
The lead reruns it before keeping the finding.
The [upstream change](https://github.com/cursor/plugins/commit/ab1f702ce8e8b6557edb56b09f52cde8bfb83f17) also removes abstract findings from this review.
astack adopts this behavior by hand under ADR 0001.
The frozen snapshots and their pins remain unchanged.

For state and concurrency properties, use the [optional formal-model runbook](formal-models.md).
