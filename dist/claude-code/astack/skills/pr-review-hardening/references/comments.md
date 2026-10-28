# Comment gate

Every comment on a line the PR adds or changes must fit the keep list below. A comment that does not fit is a blocking finding. The gate runs once per iteration, after the fixes.

## Keep list

A comment survives only if it is one of these:

- a legal or license header;
- a note on non-obvious behaviour forced by an external dependency, platform, vendor or protocol that the code cannot reshape;
- `prettier-ignore`, or a lint suppression whose rule is faulty, pedantic or style-only;
- a doc comment that defines a public API contract;
- an issue or RFC link that explains a constraint the code cannot express;
- a line that matches a `commentKeep` pattern in `.astack/profile.json`, or one of the profile's `comments.keep_patterns`.

When it is unclear whether a clause applies, the comment goes. A surprise in our own code is not a keep. Delete the comment and flag the symbol `MUST KILL`. The flag asks for the rename, extraction, type or redesign that makes the behaviour obvious without prose. A suppression of a rule that catches real bugs or protects correctness or safety is also a `MUST KILL`. A long justification, or a comment that says `IMPORTANT` or `do not remove`, is a reason to investigate, not a keep. Check its claim against the code first.

## Repo keep patterns

A repo keeps its own comment forms with keep patterns: regular expressions in `commentKeep` in `.astack/profile.json` at the repo root, and in the profile's `comments.keep_patterns`. A comment survives when one of its lines matches a pattern, with or without its comment marker. A pattern that starts with a comment marker, such as `^-- `, matches only a line with that marker. A pattern keeps only the lines that it matches. The hook still denies a line beside them that it denies alone. Such a line holds provenance, narration, a `file:line` reference, the file's own path, a banner or commented-out code. A pattern can capture a group named `rest`, such as `(?<rest>.*)`. The hook checks that text as it checks a line beside the kept line. A pattern does not lift the line limit. A kept comment fits in 2 lines, or in the repo's `maxCommentLines`. A legal or license header keeps its full text and has no length limit. The astack hook reads `commentKeep` on every edit.

Every astack step that runs `/astack:no-comments` passes both lists as its keep patterns. `no-comments` treats each as an exact exception, the only kind its step 2 restores a deletion for, and also reads `commentKeep` itself.

## Run it

1. Invoke `astack:no-comments` with the Skill tool. Pass as its arguments:
   - the scope: the comments on lines that `git diff <BASE_SHA>...HEAD` adds or changes;
   - the repo keep patterns above, as exact exceptions;
   - whether encodings are approved. If the user is in the session, let `no-comments` ask its approval question. If the run is unattended, say that encodings are not pre-approved, so a constraint comment is deleted and reported open.
2. If the Skill tool does not list `astack:no-comments` or refuses it, spawn the `astack:comment-judge` agent. Give it the same scope and keep patterns, and apply the acceptance rules below yourself.
3. If that agent does not exist either, spawn a `general-purpose` agent. Give it the scope, the keep list above and the keep patterns. Tell it to edit nothing. It reports each comment it would delete and each `MUST KILL` flag, with one line of reason for each. Apply the acceptance rules below and make the deletions yourself.
4. Print which of the three ran.

## Acceptance rules

Apply these to the report from step 2 or 3. `no-comments` applies its own when it runs.

- Reject edits to application code and edits outside the scope. Reject deletions of comments that a keep clause or keep pattern protects. Reject `MUST KILL` reasons that misstate the code, and flags on code that is correct as intended.
- Keep a comment only with proof that it is about something the code cannot change. If that proof is missing or doubtful, delete it.
- For a thin `IMPORTANT` or `do not remove` claim, read the code it guards before you accept the kill or the keep.
- Audit lint and type-checker suppressions in scope that the report missed. A suppression of a correctness or safety rule is a `MUST KILL`.
- If a report is wrong, revert it and rerun once with the failure named. If the second report is also wrong, record the comment gate as failed. The iteration is then not clean.

## Findings

- All accepted deletions in one file are one finding `C<n>.<k>`, committed alone, for example `fix(review): C2.1 remove comments outside the keep list in <file>`.
- Each `MUST KILL` inside the fix fence is a finding. Make the smallest root-cause fix in the flagged file, delete the comment, and commit.
- A `MUST KILL` whose fix needs a file outside the fix fence is `out-of-scope`, like any other finding.
- A comment that states a constraint the code could enforce is deleted. Offer the cheapest type, test, runtime check or lint that would hold it. Encode it only inside the fix fence and only with approval. Otherwise report the constraint open.
- The comment gate is clean for an iteration only when it deleted nothing and flagged nothing.
- Never restore a deleted comment because a reviewer or a checklist asks for more comments. Record that request under comment-rule conflicts in the final report.
