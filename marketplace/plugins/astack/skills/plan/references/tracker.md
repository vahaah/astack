# Tracker export, move, import and drift

A plan moves to Linear or GitHub only when the owner asks.
The structure stays the same in each home.
The CLI never calls a tracker and holds no credential.
It reads tracker JSON on stdin and prints a typed write plan.
Run each write through the Linear MCP or `gh`.

## One home at a time

- `home: repo` is the default. The plan file is the plan, and the tracker holds a mirror.
- `astack plan move` writes the tracker copy with `home: linear` or `home: github`. Then it deletes the repo files in one commit.
- `astack plan import` does the reverse. It writes the files back with `home: repo`.
- Never keep two copies that people can edit.

The plan holds the structure, Exit, Proof, the edges and the settled decisions. The tracker holds status, claims, comments, hand-offs and open decision threads. Status never flows into the plan.

## Export

```sh
astack plan export <plan> --to linear|github [--team <name>] [--repo <owner/repo>] [--initiative <name>] [--tracker <file|->] [--overwrite] [--json]
```

1. Fetch the plan's current tracker objects.
   Pass them as `--tracker`.
   Then export writes only what changed.
2. Read the dry run with the owner. Nothing runs before the owner agrees.
3. Run the writes in order with `--json`.
   A value `<key:unit>` or `<number:unit>` stands for the key that an earlier create returned.
   A GitHub number has no `#`.
   An update can carry `addLabels`. When the `save_issue` schema of your Linear server has no `addLabels`, send `labels` in its place. Give the object's labels from the tracker JSON plus the new ones.
4. Record each key that a create returns. Pipe the record into `astack plan keys <plan>`:

```sh
echo '{"data-platform/B01": "ABC-41", "data-platform/B01/S1": "ABC-42"}' | astack plan keys docs/plans/data-platform/index.md
```

5. Commit the plan files in one commit.

Export refuses a key that does not fit the target, such as a Linear key in an export to GitHub.
It marks each update that overwrites a field that drift calls `edited-in-tracker`.
Then export stops until you pull the edit into the plan or the owner grants `--overwrite`.
With `--repo`, a `gh api` call names the repo in its endpoint.
Every other `gh` call gets `-R`.

Export is idempotent.
It makes missing objects and rewrites only changed fields that it owns.
It adds missing edges and labels.
It never deletes.
A second export with the first export's tracker state plans no write.
Blockers come first, so each edge gets a real key.
Each object ends with a back-link line, `astack: <slug>/<unit> @ <commit>`.
The back-link finds the object again.
Drift reads its commit.

## The tracker JSON

Give an object, or a bare array of objects. Map the output of the MCP or `gh` into these fields:

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

`type` is `project`, `document`, `milestone`, `issue` or `comment`. `key` can also come as `identifier`, `number` or `id`, and `body` as `description` or `content`. The state words of Linear and GitHub map to todo, in progress, in review, done and canceled.

## The Linear map

| astack | Linear | Owned fields |
|---|---|---|
| Programme | A delivery project, linked to the roadmap initiative of the team with `--initiative` | name, summary, description, target date |
| Index text, brief text | A project document, a mirror while home is repo | title, content |
| Milestone | A project milestone `M2 <demo title>` | name, description with Demo and Proof, target date |
| Block | An issue `B07 <outcome>`, with the first ticket of its brief as parent, and label `Lane/<x>` | title, description, parent, milestone, blocked by, labels |
| Session | A sub-issue `B07/S2 <what becomes true>`, blocked by its Depends on | the same |
| Open decision | An issue with label `Kind/decision` that blocks the units it binds | the same |
| Standard plan | One addendum comment on the existing ticket. A move adds the plan copy. It makes no session sub-issue | the comment text. The ticket text is never edited |

The label groups `Lane` and `Kind` come first, on the first export.
Turn off "auto-close parent when sub-issues are done" in the team settings, so In Review stays earned.
Never set estimates or cycles.

## The GitHub map

| astack | GitHub |
|---|---|
| Programme | A map issue, type Feature, label `kind:programme` |
| Index text, brief text | A comment on the map issue or the block issue, with the plan in a fenced block |
| Milestone | A repository milestone, with the target as the due date |
| Block | An issue, type Feature, sub-issue of the map, label `lane:<x>` |
| Session | An issue, type Task, sub-issue of the block, with native blocked-by |
| Open decision | An issue, type Task, sub-issue of the map, label `kind:decision` |

A standard plan gets one addendum comment on the existing issue, as in Linear. GitHub allows 100 sub-issues for each parent, so blocks are the parents of sessions. Titles use no long dash. The handle and a space carry the split.

## Drift

```sh
astack plan drift <plan or slug> [--tracker <file|->]
```

Run it at each resume and at each milestone exit. It reads tracker JSON on stdin and exits 1 when it finds drift.

| Kind | Means | Do |
|---|---|---|
| `not-exported`, `not-in-snapshot` | No object, or the snapshot lacks it | Export, or fetch it |
| `stale-export` | The plan changed after the export, and the tracker matches the old plan | Export again |
| `edited-in-tracker` | A person changed an owned field | Ask the owner. Pull it into the plan as a superseding row, or overwrite it |
| `orphan` | The plan no longer holds the unit | Propose to close it as superseded |
| `unmapped-child` | A child issue has no plan unit | Ask whether it is hidden work in the PR or a session amendment |
| `edge-mismatch`, `milestone-mismatch` | The tracker edges or milestone differ from the plan | Export again, or ask |
| `done-with-open-pr`, `block-not-in-review`, `past-target`, `stale-claim` | The status contradicts itself | Report it. Ask before a takeover |

Drift never resolves text that a person wrote.
Give the plan file or the slug.
A slug for a plan in the plan directory reads the repo file.
For a plan whose home is the tracker, give the slug.
Drift reads that plan from the snapshot's copy.

## Move and import

```sh
astack plan move <plan> --to linear|github [the export flags]
astack plan import <slug> --from linear|github [--tracker <file|->]
```

- Move is an export with the copy of each plan file. Run the tracker writes first. The repo deletes come last, in one commit, after each tracker write succeeds.
- Import reads the copies from the snapshot. It prints a repo write for each file with `home: repo`, and an update that marks each copy as a mirror. Commit the files in one commit, then run `astack check-plan` on them.

## PR and ticket rules

These come from the repo profile and from `astack:write-docs`.

- When the profile sets `tracker.requirePartOf: true`, line 1 of a PR body is `Part of <key>`. One line can name more tickets, as in `Part of ABC-327, ABC-331`.
- The hook denies a closing word only when a key or `#n` follows it.
- Never edit the description of a product spec ticket. Put an addendum in a comment.
