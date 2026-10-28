# Configure quality hook profiles

Use `.astack/profile.json` to select STE, type, and comment hook checks.
The default profile is `strict`, with all three groups enabled.
`minimal` disables those groups.

## Select a profile

Add a `hooks` object to the repository profile:

```json
{
  "hooks": {
    "profile": "minimal",
    "types": true
  }
}
```

This example runs the type hook and skips the STE and comment modules.
Set `profile` to `strict` to enable the groups by default.
Remove an override to use its profile's value.
An explicit `true` or `false` overrides either profile.

| Key | Values | Scope |
|---|---|---|
| `profile` | `strict`, `minimal` | Default values for the three groups |
| `ste` | `true`, `false` | Artifact STE, reply rewrites, and kept-comment STE |
| `types` | `true`, `false` | Type patterns and compiler suppressions |
| `comments` | `true`, `false` | Comment checks, including their nested STE work |

An unknown key or invalid value retains strict runtime checks for all groups.
Profile validation reports the exact invalid field.
It refuses an invalid companion config before apply can write it.
Keep the same `hooks` object in the companion project config to preserve it through apply.

## Know the overlap

The comment module also checks the STE of kept comments.
Set `ste` to `false` to skip that nested check while keeping ordinary comment checks.
Set `comments` to `false` to skip the whole comment module, including its nested STE check.

The comment and type modules both cover compiler suppressions.
When the type module is enabled, the comment module leaves those suppressions to it.
When types are disabled, the comment module still enforces its own suppression rule.
When types are re-enabled, an unresolved comment suppression keeps its original baseline during handoff.
The type module then applies its current policy and explicit kernel permissions.
Disable both groups to skip both checks.

Required guards stay active.
These include plan edits, ticket and PR structure, merge authority, duplicate PRs, destructive commands, and turn state.
Turn state still records scheduled prompts and advances each interactive turn.
A scheduled prompt does not become a human merge grant when STE is disabled.

## Understand Cursor records

Cursor retains one record for each blocked file and handler in its session and workspace.
Each record keeps the original before text until the current file passes that handler.
A later edit or completed stop reads the current file against that original baseline.
This refresh does not add a ledger attempt or claim a reply rewrite.

Disabled quality records stay dormant with their baselines.
Re-enable the group to examine the current file again.
The comment module also retains its baseline while nested STE is disabled.
It reports only the checks that still run.
Required records stay active under both profiles.
Deleted files resolve active records.
An unreadable file or unavailable handler produces a verification-limit report.

Old string-only reports have no file, workspace, handler, or baseline.
Cursor delivers each once as an unverified report.
The minimal profile does not classify or suppress them.

The state folder can hold before text from blocked source files.
Keep that folder private.
By default, it lives outside the checkout under the astack local state folder.
`ASTACK_STATE_DIR` overrides that location.

## Run checks directly

CLI, git, and CI quality checks remain independent of the hook profile:

```sh
astack check-types
astack check-comments
astack check-ste docs/example.md
```

These commands still examine their inputs when the corresponding hook group is disabled.
