# The CI pin check

Read this reference when `astack check ci-pins` exits with a code other than 0, or when the diff changes a CI file.
It explains what each exit code of the check means.
The decision in preflight step 8 stays in `SKILL.md`.

## What each exit code means

It exits 3 when the diff changes only paths under `.github/workflows/` or `.github/actions/`, or in the folder of a local action that a workflow uses.
For exit 3, each tool version that CI sets up stays the same, and the last line starts with `ci_proof:`.
The check reads the tools of the setup steps, the runner, the container and service images and the ref of a remote reusable workflow.
It does not read a tool that a `run` step or a script installs, so the review examines such a change.
Exit 3 also permits `.astack/proof.json` and its declared `ratification.proofRecord` files under `formal/`. The committed manifest must pass the full schema and name the actual merge base. Each record must be non-executable UTF-8 Markdown with all required sections and references. Records cannot also supply ADRs, glossary, implementation, witness, matrix, model, or negative inputs. Changed models, controls, authority, and all other non-CI files still stop the run. These records grant no proof result. The current proof gate stays blocking in every mode. A file outside CI and this checked proof metadata stops the run, because a red gate can come from that file.
A version file is a file that a workflow or an action names in a `-version-file` input.
The check exits 1 when the diff changes a version file and the version that the setup action reads from it changes.
It also exits 1 when it cannot read an exact version from a version file at `BASE_SHA` or at `HEAD`.
It also exits 1 when the diff changes CI and a tool version that CI sets up, or when it cannot read such a version.

Another change to a version file, such as a new dependency in `package.json`, gets the gates of the run.
The gates mirror the CI that astack apply read, and CI runs the workflows of the PR, so only CI can prove a CI change.
