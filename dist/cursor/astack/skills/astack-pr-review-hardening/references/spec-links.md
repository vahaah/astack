# Spec links

`astack check spec-drift <matrix.json>` checks declared criterion and control links.
It reads real files without running tests or source code.
It does not establish test execution, assertion quality, or semantic coverage.

## Mark the scope

Put `[criterion:EXPORT-1]` beside an acceptance criterion in the spec.
Put `[control:export-valid]` in the test name that checks it.
Use markers in prose and test names, never code comments.
IDs start with a letter and then contain letters, digits, `.`, `_`, or `-`.
Each ID occurs once within its inventory.

Declare every spec and test file in the matrix scope.
The checker reads each inventory from those files independently of the links.
An omitted link cannot hide a criterion that the source declares.
A file outside the declared scope is not checked.
Review the scope against the changed acceptance criteria before trusting the result.

## Write the matrix

```json
{
  "version": 1,
  "specs": ["docs/specs/export.md"],
  "tests": ["tests/export.test.ts"],
  "links": [
    {"criterion": "EXPORT-1", "controls": ["export-valid"]}
  ],
  "exemptions": [
    {"control": "old-import", "kind": "regression", "reason": "Preserves the existing import contract."}
  ]
}
```

Both source lists and their marker inventories must be nonempty.
Each criterion needs one link row with at least one existing control.
One control can serve several criteria.
Each unlinked control needs a `shared` or `regression` exemption with a reason.
An exempt control cannot also have a link.
Unknown fields, duplicate IDs, duplicate rows, and stale links fail the check.
Paths must name regular files inside the repository.
Traversal paths and symlinks that escape it fail the check.

The command exits 0 for valid links and 1 for source-file or trace failures.
It exits 2 for invalid arguments and unreadable or invalid matrices.
It supports `astack check-spec-drift` too.

## Prove the behavior

Run the linked tests through the repo's test gate.
A skipped test can retain its marker, so a traceability pass does not establish that the test ran.
For a critical clause, remove its implementation and confirm that its control fails.
Restore the implementation before the normal gates.
Keep that failing result before the passing result in the PR's Verification.
Record model bounds and assumptions separately when a formal model supplies another control.
