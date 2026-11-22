# PR recipe requirements

These criteria hold the PR recipes of the GitHub tracker seed and of the mode playbooks.
[The head check requirements](pr-head-check.md) still apply to each text that reads a PR with gh.

## Acceptance criteria

- [criterion:GH-READ] The GitHub tracker seed reads a PR with `gh pr view <number> --json number,title,body,comments,reviews,headRefOid`, never with `--comments`. The seed and the flow-config render run `gh repo set-default --view` first. If it does not print the repo of `origin`, they pass `--repo` with the owner and name of `origin` to each gh command except `gh api`. `gh api` has no `--repo` flag.
- [criterion:FORK-LINK] create-pr holds each fork rule. These are the stop on a fork with no edits from maintainers, the push to the head repository and its URL. Each other mode playbook that pushes to a PR holds those rules or links to steps 1 and 7 of create-pr. A text with neither fails.

## Claim boundary

The controls examine the words of the texts.
No model reads them, and no control runs gh against a fork.
Review makes sure that the link sends the reader to the rules that apply to the run.
