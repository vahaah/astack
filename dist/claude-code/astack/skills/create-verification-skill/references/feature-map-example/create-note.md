# Create a note

Users can save a titled note from the browser or CLI.
They can cancel a browser draft and confirm saved values through another user-facing view.

## Sub-features

- `create-open` opens a blank editor from each browser entry point.
- `create-save` saves a title and body.
- `create-cancel` discards an unfinished browser draft.
- `create-cli` creates the same note shape from the terminal.

## How to get to it (user POV)

- Choose `New note` in the browser toolbar.
- Press `n` in the browser while focus is outside an editable field.
- Run `notes create --title <title> --body <body>` in a terminal.

## Driving it with control-notes

Preconditions:

- Notes is healthy at `http://127.0.0.1:4173`.
- No note has the title `Release checklist`.
- `control-notes doctor` reports the expected URL and disposable data directory.

- Open editor. Choose `New note`.
  Run `control-notes browser click --role button --name "New note"`.
  A form named `Note editor` appears with focus in the `Title` textbox.
- Enter content. Fill the title and body.
  Run `control-notes browser fill --role textbox --name "Title" --value "Release checklist"`.
  Run `control-notes browser fill --role textbox --name "Body" --value "Tag and publish"`.
  The `Save note` button becomes enabled.
- Save note. Choose `Save note`.
  Run `control-notes browser click --role button --name "Save note"`.
  A status named `Note saved` appears and the heading reads `Release checklist`.
- Confirm persistence. Return to the list and reopen the note.
  Run `control-notes browser click --role link --name "All notes"`.
  Run `control-notes browser click --role link --name "Release checklist"`.
  The editor shows both saved values.
- Cancel draft. Open a new note.
  Enter `Discard me`.
  Choose `Cancel`.
  Run `control-notes browser click --role button --name "New note"`.
  Run `control-notes browser fill --role textbox --name "Title" --value "Discard me"`.
  Run `control-notes browser click --role button --name "Cancel"`.
  The note list returns without a `Discard me` link.
- CLI entry. Create a second note.
  Run `control-notes cli -- notes create --title "CLI note" --body "Created from terminal" --format json`.
  Exit code `0` and stdout contain the new note ID and title.
- Proof. Reopen both saved notes from `All notes`.
  Run `control-notes browser snapshot --aria --path artifacts/create-note/list.aria.txt`.
  Run `control-notes browser screenshot --path artifacts/create-note/list.png`.
  The artifacts show `Release checklist` and `CLI note`.

## Gotchas

- Pressing `n` inside a textbox inserts the character instead of opening an editor.
- Notes trims titles on save.
  Check the rendered title, not the draft input.
- A save status alone does not prove persistence.
  Reopen the note from the list.
- Remove `Release checklist` and `CLI note` during fixture cleanup.
  Keep their proof artifacts.
