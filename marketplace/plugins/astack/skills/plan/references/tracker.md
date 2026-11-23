# Tracker keys, JSON and PR rules

The CLI never calls a tracker and holds no credential.
It reads tracker JSON for `astack board` and `astack session resume`, and writes tracker keys back into plan files.

## One home at a time

- `home: repo` is the default. The plan file holds structure, Exit, Proof, edges and settled decisions.
- The tracker holds status, claims, comments, hand-offs and open decision threads. Status never flows into the plan.
- When `home` is `linear` or `github`, the tracker copy is the plan. No command reads that copy, and the owner edits it by hand.

## Write keys back

After filing issues through `astack:write-ticket`, pipe the unit-to-key map into `astack plan keys`:

```sh
echo '{"data-platform/B01": "ABC-41", "data-platform/B01/S1": "ABC-42"}' | astack plan keys docs/plans/data-platform/index.md
```

Commit the updated plan files in one commit.

## The tracker JSON

Pass an object or array of objects to `astack board` or `astack session resume` through `--tracker <file|->`:

```json
{
  "target": "linear",
  "labels": ["Lane/a"],
  "prs": [{ "number": 12, "state": "open" }],
  "objects": [
    {
      "key": "ABC-42",
      "type": "issue",
      "title": "B01/S1 The ingest service publishes events",
      "body": "... astack: data-platform/B01/S1 @ 94fe890",
      "state": "In Progress",
      "parent": "ABC-41",
      "milestone": "M1 Events land in staging within 10 minutes",
      "blockedBy": ["ABC-40"],
      "labels": ["Lane/a"],
      "claimedAt": "2026-10-15T09:00:00Z",
      "pr": { "number": 12, "state": "open" }
    }
  ]
}
```

`type` is `project`, `document`, `milestone`, `issue` or `comment`.
`key` also accepts `identifier`, `number` or `id`, and `body` accepts `description` or `content`.

## PR and ticket rules

- When the profile sets `tracker.requirePartOf: true`, line 1 of a PR body is `Part of <key>`. One line can name multiple keys.
- The hook denies a closing word only when a key or `#n` follows it.
- Never edit the description of a product spec ticket. Put an addendum in a comment.
