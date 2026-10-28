# Issue tracker: Local Markdown

This repo keeps issues and specs as Markdown files in `.scratch/`.

## Conventions

- Give each feature a directory at `.scratch/<feature-slug>/`.
- Store its spec at `.scratch/<feature-slug>/spec.md`.
- Store each implementation ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`. Start numbering at `01`. Never combine tickets into one file.
- Record triage state with a `Status:` line near the top of each issue. Use the role strings from `triage-labels.md`.
- Append comments and conversation history under `## Comments` at the bottom of the file.

## When a skill says "publish to the issue tracker"

Create a file under `.scratch/<feature-slug>/`.
Create the directory if needed.

## When a skill says "fetch the relevant ticket"

Read the referenced file.
The user normally supplies its path or issue number.

## Wayfinding operations

`/astack:wayfinder` uses one map file and one child file per ticket.

- Store the map at `.scratch/<effort>/map.md`. Its body contains Notes, Decisions so far and Not yet specified.
- Store children at `.scratch/<effort>/issues/NN-<slug>.md`, starting at `01`. Put the question in the body. Record `research`, `prototype`, `grilling` or `task` on a `Type:` line. Record `claimed` or `resolved` on a `Status:` line.
- Record dependencies near the top as `Blocked by: NN, NN`. A ticket becomes unblocked when every listed file is `resolved`.
- Find the frontier in `.scratch/<effort>/issues/`. Keep open, unblocked and unclaimed files. Choose the lowest number first.
- Claim a ticket by setting `Status: claimed`. Save before doing any work.
- Resolve a ticket by appending its answer under `## Answer`. Set `Status: resolved`. Then append a short summary and link to Decisions so far in `map.md`.
