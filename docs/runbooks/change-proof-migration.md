# Adopt required change proof

Every repository adopts the same mandatory contract.
The rollout uses one reviewable adoption PR for each repo.
It does not change an active hardening run's frozen configuration.

## Publish and install the capability

Publish a release that contains the proof command and all client builds.
Update the installed plugin and terminal CLI.
Update each repository and CI pin to that release or an explicit reviewed commit.
Verify `astack check proof --summary` capability against its prepared manifest.
An unknown command or an unverified summary is not proof admission.

## Prepare the repository contract

Add the affected glossary or context map and a governing adoption ADR.
The ADR includes the function contract, category explanation, formal claim, correspondence, and control links.
Preserve earlier decision bodies and record replacements explicitly.
Add `.astack/proof.json`, its relevant TLA+ model and config, and the spec-drift matrix.
Keep the existing implementation controls.
Add a named negative mutation for the changed contract.
Run positive, negative, and unchanged positive controls with the pinned checker.

For an adoption branch, prepare these files before applying a profile whose baseline requires the gate.
Use that prepared commit as the apply base.
The final adoption PR can include both the prepared contract and the managed-file commit.

## Update the companion and CI

Update the companion profile and every branch overlay with separate CI.
Add one unrestricted, nonoptional gate named `change-proof`.
Its command directly invokes `astack check proof` or the pinned CLI equivalent.
Do not add a summary flag, suppression, pipe, redirect, or dynamic substitution.
Keep other reviewers, gates, prerequisites, and iteration limits.
Remove only an unwanted optional `interrogate` entry.
An existing extra reviewer remains an explicit request until its profile changes.

Add the required proof execution to CI for every pull request.
Make Java 17 or later available.
Fetch enough history to resolve the manifest's fixed base.
Match setup, environment, tools, and scope through CI parity.
The proof gate cannot use a path filter or `optional: true`.
The responsible owner must verify required-check settings before the rollout counts as enforced.

## Preview and apply

Commit the companion changes before a worktree apply.
Use the explicit private companion path:

```sh
bun run apply --project <name> --companion <dir> --dry-run
bun run apply --project <name> --companion <dir> --worktree --branch <adoption-branch> --base <prepared-ref>
```

Use `--update` only for an existing clean apply worktree.
Use `--overlay <branch>` when updating a branch overlay.
Review the generated profile, shared fallback, mirrors, and source notices.
Run the repo gates before and after the apply.

## Preserve a blocked transition

The CI-pin guard can reject a mixed CI and proof-tool adoption.
That stop remains principled incompletion.
Do not change the guard or describe the stop as clean.
Finish the active run under its frozen configuration or record its stop.
Snapshot the findings ledger, recurrence history, iteration use, and first-review growth record.

An authorized installation transition records the old and new CLI, pins, profile digests, and preserved review state.
It still needs the required proof, all applicable gates, and fresh required pull-request CI on the candidate head.
The owner grants any installation or merge exception separately.
This runbook grants neither.
If the transition cannot preserve the records, keep the stop visible.

## Complete one repo before the next

Verify installed capability, the current head, required CI, and the effective profile after adoption.
Confirm that the ledger, cap use, and fixed growth baseline were preserved.
Do not create historical proof receipts or reset a baseline.
Keep unrelated past tests outside a new matrix unless the change needs them.
Each new change still supplies a relevant model or explicit preservation relation.
