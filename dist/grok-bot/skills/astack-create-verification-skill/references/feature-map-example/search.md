# Search notes

Users can search note titles and bodies, inspect a matching note, and distinguish an empty result from unavailable search.

## Sub-features

- `search-open` opens search from each supported browser entry point.
- `search-match` returns title and body matches without changing data.
- `search-open-result` opens a result in the editor.
- `search-empty` shows a complete empty state for a query with no matches.
- `search-clear` removes the query and restores recent notes.
- `search-cli` returns the same matching notes from the terminal.

## How to get to it (user POV)

- Choose `Search` in the browser toolbar.
- Press `/` in the browser while focus is outside an editable field.
- Run `notes search <query>` in a terminal.

## Driving it with control-notes

Preconditions:

- Notes is healthy at `http://127.0.0.1:4173`.
- The disposable data directory holds `Quarterly plan` with body text `Draft budget`.
- `control-notes doctor` reports the expected URL and data directory.

- Toolbar entry. Choose `Search`.
  Run `control-notes browser click --role button --name "Search"`.
  A dialog named `Search notes` appears with focus in its searchbox.
- Keyboard entry. Close the dialog.
  Focus the page.
  Press `/`.
  Run `control-notes browser press --key "/"`.
  The same dialog appears without inserting a slash into the page.
- Title match. Enter `quarterly`.
  Run `control-notes browser fill --role searchbox --name "Search notes" --value "quarterly"`.
  The `Search results` list contains `Quarterly plan` and excludes `Grocery list`.
- Body match. Replace the query with `budget`.
  Run `control-notes browser fill --role searchbox --name "Search notes" --value "budget"`.
  `Quarterly plan` remains visible with an excerpt from the matching body.
- Open result. Choose `Quarterly plan`.
  Run `control-notes browser click --role link --name "Quarterly plan"`.
  The dialog closes and the editor heading reads `Quarterly plan`.
- Empty state. Reopen search and enter `volcano`.
  Run `control-notes browser fill --role searchbox --name "Search notes" --value "volcano"`.
  A status named `No matching notes` appears after search completes.
- Clear query. Choose `Clear search`.
  Run `control-notes browser click --role button --name "Clear search"`.
  The searchbox becomes empty and `Recent notes` replaces the result list.
- CLI match. Search from the terminal.
  Run `control-notes cli -- notes search "quarterly" --format json`.
  Exit code `0` and stdout contain one object titled `Quarterly plan`.
- CLI miss. Search for an absent value.
  Run `control-notes cli -- notes search "volcano" --format json`.
  Exit code `0` and stdout are `[]`.
- Proof. Capture the populated results.
  Run `control-notes browser snapshot --aria --path artifacts/search/results.aria.txt`.
  Run `control-notes browser screenshot --path artifacts/search/results.png`.
  Both artifacts identify Notes, the query, and `Quarterly plan`.

## Gotchas

- Pressing `/` inside the editor or searchbox inserts text instead of opening search.
- Search debounces input.
  Wait for results or the empty status instead of a fixed delay.
- Search excludes archived notes unless the user enables `Include archived`.
- The CLI defaults to text for human readers.
  Use `--format json` for stable assertions.
- A result changes browser state when opened.
  Reopen search before you prove another query.
