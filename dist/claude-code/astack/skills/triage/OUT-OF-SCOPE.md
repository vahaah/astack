# Out-of-scope knowledge base

The `.out-of-scope/` directory records rejected feature concepts and their reasons.
It preserves the reasoning after issue closure.
It also helps triage identify a previous rejection when another request proposes the same concept.

## Directory structure

```
.out-of-scope/
├── dark-mode.md
├── plugin-system.md
└── graphql-api.md
```

Keep one file per concept.
Group requests for the same behavior in that file.
Do not create a separate record for every issue.

## File format

Write a short, readable design document.
Use paragraphs, code samples and examples when they clarify the reason for a new reader.
Avoid a rigid database-entry style.

```markdown
# Dark Mode

This project does not support dark mode or user-facing theming.

## Why this is out of scope

The rendering pipeline assumes a single color palette defined in
`ThemeConfig`. Supporting multiple themes would require:

- A theme context provider wrapping the entire component tree
- Per-component theme-aware style resolution
- A persistence layer for user theme preferences

This is a significant architectural change that doesn't align with the
project's focus on content authoring. Theming is a concern for downstream
consumers who embed or redistribute the output.

```ts
// The current ThemeConfig interface is not designed for runtime switching:
interface ThemeConfig {
  colors: ColorPalette; // single palette, resolved at build time
  fonts: FontStack;
}
```

## Prior requests

- #42: "Add dark mode support"
- #87: "Night theme for accessibility"
- #134: "Dark theme option"
```

### Name the file

Use a short kebab-case concept name.
Examples include `dark-mode.md`, `plugin-system.md` and `graphql-api.md`.
Choose a name that identifies the rejected feature from the directory listing.

### Write the reason

Explain the substantive reason for rejection.
Possible reasons include these:

- Project scope or philosophy can place theming with downstream consumers rather than a project focused on content authoring.
- A technical requirement can conflict with the existing architecture.
- A lasting strategic decision can choose one approach over another.

Keep the reason durable.
A temporary lack of time defers work rather than rejecting its concept.

## Check previous rejections

During triage step 1, read every `.out-of-scope/` file.
Compare the new request by concept rather than keywords.
For example, "night theme" can match `dark-mode.md`.

Report a match and its recorded reason to the maintainer.
For example, "This matches `.out-of-scope/dark-mode.md`, previously rejected for the recorded reason."
Ask whether the earlier decision still applies.
The maintainer can choose one of these outcomes:

- Confirm the decision. Append the new issue to "Prior requests" and close it.
- Reconsider the decision. Delete or update the record and continue normal triage.
- Distinguish the concepts. Continue normal triage for the new request.

## Record a rejected enhancement

Write a record only for an enhancement rejected as `wontfix`.
The rule applies equally to enhancement issues and PRs.
Do not record bug rejections here.
Do not record a request closed because the feature already exists.
For an existing feature, point to its implementation in the closing comment.
Otherwise a built feature would appear to be a rejected concept.

Follow this sequence:

1. Get the maintainer's decision that the feature is out of scope.
2. Check for a matching `.out-of-scope/` record.
3. If one exists, append the issue to "Prior requests".
4. Otherwise create a record with the concept, decision, reason and first request.
5. Comment on the issue with the reason and a reference to the record.
6. Close the issue with `wontfix`.

## Change or remove records

When the maintainer reverses a rejection, delete its `.out-of-scope/` file.
Do not reopen old issues solely because the decision changed.
Treat those issues as historical records.
Continue normal triage for the new request that prompted reconsideration.
