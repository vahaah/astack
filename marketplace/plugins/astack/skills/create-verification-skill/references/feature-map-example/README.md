# Notes verification map

This map defines verification of Notes behavior that users can reach.
Read the index before you drive the app.
Then follow the relevant feature file.

## Baseline preconditions

- Launch Notes at `http://127.0.0.1:4173` with a disposable data directory.
- Set `NOTES_DATA_DIR=/tmp/notes-verify-$RUN_ID` so concurrent runs keep separate state.
- Seed notes titled `Quarterly plan` and `Grocery list`.
- Put `control-notes` and the `notes` CLI on `PATH`.
- Run `control-notes doctor`.
  Require the expected URL, data directory, and build revision.
- Drive only an instance that this verification run started.

## Driving conventions

Start each recipe from the baseline unless its preconditions say otherwise.
Prefer ARIA roles and accessible names over CSS selectors or DOM position.
Treat commands as literal.
Keep quoted names and flags unchanged.

Run browser actions through `control-notes browser`.
Run terminal actions through `control-notes cli -- <command>`.
Restore seed data after a mutation.
Keep proof artifacts through cleanup.

## Proof and skip reporting

- Capture the user action and resulting state.
  A final screen alone is incomplete proof.
- For UI proof, save an ARIA snapshot and screenshot with the app identity visible.
- For CLI proof, save the command, stdout, stderr, and exit code.
- For a mutation, confirm the stored value through a second read-only view.
- Record the feature ID and entry point with each artifact.
- For an unreachable path, record the attempted command and unmet precondition.
- Do not count a skipped entry point as verified through another path.

## Feature entry contract

Start each feature file with an H1 title and one paragraph about its user-visible behavior.
Then use exactly these four H2 sections, in order:

1. `Sub-features`: short IDs with one line per behavior.
2. `How to get to it (user POV)`: every user entry point.
3. `Driving it with <harness>`: `Preconditions:` followed by labeled bullets.
   Each bullet pairs an action with its exact command and observable result.
4. `Gotchas`: traps that can waste or invalidate a verification run.

Keep implementation details outside the map.
Include user paths, stable handles, required state, commands, and observable proof.

## Features

- [Create a note](./create-note.md): browser and CLI creation, cancellation, persistence, and cleanup.
- [Search notes](./search.md): toolbar, keyboard, and CLI search with matching, empty, and clear states.
