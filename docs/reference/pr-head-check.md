# PR head check requirements

[ADR 0025](../adr/0025-each-text-that-reads-a-pr-with-gh-runs-the-head-check-command.md) governs the head line, the failure line and the repair sentence of each text that reads a PR with gh.
The [model](../../formal/PrHeadCheck.tla) examines 3 gh answers, a named PR or none, 4 head relations and 3 stop results.

## Acceptance criteria

- [criterion:PH-LINE] Each astack text and profile that reads a PR with gh holds the head line. No text keeps the manual head check, except the engine, the stub fallback and the setup seed.
- [criterion:PH-LATER] Each text with a later `gh pr view` or `gh pr status` read holds the failure line after the head line. No text keeps the old no-PR rule.
- [criterion:PH-PAIR] A text that runs the command goes on only after one of two pairs. They are exit 0 with an `ok:` last line, and exit 3 with a `no_pr:` last line. After `stop: HEAD does not hold PR_HEAD`, the one next step is the repair sentence.
- [criterion:PH-LIST] create-pr keeps the list rule. The scan finds a lookup through `gh pr list` that reads an empty list as no PR.
- [criterion:PH-NOPR] The command gives `no_pr:` only for gh exit 1 with the no-PR message and no `--pr`. With `--pr`, the same answer stops the run. Each other failure of gh on the current branch stops the run with the original error.

## Claim boundary

The model takes the result of the command as a true observation of gh and git.
It covers one check, one decision and one pull after a head stop.
The scan controls examine the words of the texts. The model does not read them.
The setup seed keeps the manual check for a product repo with no astack, and the seed test examines it.
The pr-head tests examine the command with a fake gh and a real git repository.
