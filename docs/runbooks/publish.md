# Publish a new public repository

The owner creates the public repository and pushes its first commit under ADR 0002.
Prepare and review the exact tree before that step.
Never add the public remote to the old private source repository.

## Prepare a candidate

1. Finish the accepted release gates in the programme plan.
2. Run `bun run check` in the source checkout.
3. Export only the intended files into a new folder outside that checkout.
4. Exclude the old `.git` directory and ignored local files.
5. Reject symbolic links, gitlinks, and unexpected binary files.
6. Run `git init -b main` in the new folder.
7. Stage the complete candidate with `git add --all`.
8. Make sure no intended file remains untracked.

Do not create a commit yet.
The candidate must have no parent commit from the private history.
Frozen upstream images are the only allowed binary files.

## Scan the exact tree

Set `ASTACK_COMPANION_DIR` to the real private companion path.
Run these commands inside the candidate folder.

```sh
: "${ASTACK_COMPANION_DIR:?Set the private companion path}"
bun install --frozen-lockfile
bun run check:drift
bun run check
bun run check:drift
git add --all
git diff --cached --check -- . ':(exclude)upstream/**'
git diff --quiet
bun scripts/neutral.ts --companion "$ASTACK_COMPANION_DIR"
bun scripts/secrets.ts --source "$PWD"
bun test tests/secrets.test.ts
bun test tests/neutral.test.ts -t canary
bun test tests/neutral.test.ts -t 'reads each tracked file'
git write-tree
```

`git diff --quiet` makes sure the indexed files match their working copies.
The whitespace check excludes frozen upstream files because their bytes must stay unchanged.
This exclusion applies only to whitespace.
Inspect untracked files after the scan.
Record the file count, scanner counts, positive controls, and tree hash in private release evidence.
Keep owner values and canary text out of public evidence.

The file scans do not inspect commit messages, author emails, or annotated tag metadata.
Review that metadata separately before the push.
Use a public contact address or a GitHub noreply address for the new commit.

## Create and push

The owner performs these account and publication steps after the candidate passes.

1. Create an empty public repository with no generated README or licence.
2. Review the candidate index and its recorded tree hash.
3. Create the first commit in the candidate.
4. Make sure `git rev-list --count HEAD` returns `1`.
5. Make sure `git rev-parse HEAD^{tree}` matches the scanned tree hash.
6. Review `git show --no-patch --format=fuller HEAD`.
7. Configure the private companion `publicRemote` with the target URL.
8. Enable the pre-push gate with `git config core.hooksPath .githooks`.
9. Add the public remote only to the new candidate repository.
10. Push the first commit.
11. Wait for the required CI check.
12. Create a signed release tag only after that check passes.
13. Review the tag message and signer before you push the tag.

The pre-push gate reads `ASTACK_COMPANION_DIR` and scans every outgoing commit.
It refuses a missing companion, a missing public remote setting, and an empty deny list.
Do not bypass the hook or push the old private repository.

## Signed tag and release draft

Use a signing key that GitHub recognizes.
Signing setup belongs to the owner.
Run these commands only in the clean public checkout whose HEAD is the reviewed release commit:

```sh
ASTACK_TAG=v0.1.0
git tag -s -m "astack $ASTACK_TAG" -- "$ASTACK_TAG"
git verify-tag -- "$ASTACK_TAG"
git cat-file tag "$ASTACK_TAG"
```

Review the tagger address, message, signer, and target commit before the push.
Make sure the tag matches `v` plus the source package version.
Run the real companion scans before that publication step.
The owner then pushes only that tag:

```sh
git push origin "refs/tags/$ASTACK_TAG"
```

The "Signed release" workflow checks the exact ref, annotated tag, source version, commit, and GitHub-verified signature.
It runs drift and the full gates with read permissions.
Only the dependent draft job gets content-write permission.
That job verifies the tag again and creates an unpublished draft.
The workflow holds no signing key.
`--verify-tag` alone proves only that the remote tag exists.

The owner can repeat the read-only verifier from the same public checkout:

```sh
GITHUB_REPOSITORY=vahaah/astack GITHUB_REF="refs/tags/$ASTACK_TAG" bun scripts/release.ts
gh release view "$ASTACK_TAG" --repo vahaah/astack --json isDraft,tagName,url
```

Review the workflow result and draft before publishing it.
Do not publish a draft after a failed or skipped required release check.
The owner publishes the reviewed draft:

```sh
gh release edit "$ASTACK_TAG" --repo vahaah/astack --draft=false --verify-tag
```

These commands are owner steps.
Preparing this runbook does not execute them.
See [GitHub tag verification](https://docs.github.com/en/rest/git/tags) and [GitHub CLI releases](https://cli.github.com/manual/gh_release_create).

## Verify the public result

1. Clone the new public repository into another clean folder.
2. Make sure it has only the expected public history.
3. Repeat the neutrality and secret scans on that clone.
4. Install the CLI from its release tag.
5. Import its marketplace in Cursor.
6. Follow the Grok Bot guide with one skill and one reference file.
7. Record the remote checks separately from the local checks.
