---
name: "astack-code-review"
description: "Review committed changes against a fixed point on two axes. Standards checks repo rules. Spec checks the originating requirements. Run parallel reviewers and report each axis separately. Use for a branch, PR, work in progress, or \"review since X\"."
metadata:
  astack-version: "0.1.0"
---

# Code review

Review the diff between `HEAD` and a fixed point from the user on two separate axes:

- "Standards" asks whether the code follows this repo's documented standards.
- "Spec" asks whether the code meets the originating issue or specification.

Run the axes in parallel subagents with separate contexts.
Then present their findings separately.
If no issue tracker was supplied, tell the user to run `/astack-setup`.

## Process

### 1. Pin the fixed point

Use the commit, branch or tag that the user named.
Examples include `main` and `HEAD~5`.
If none was given, ask for it.

Capture `git diff <fixed-point>...HEAD` once.
The three-dot comparison uses the merge base.
Also capture `git log <fixed-point>..HEAD --oneline`.

This diff includes commits only.
If `git status` shows uncommitted changes, ask the user to commit them or state that the review excludes them.
Before you start reviewers, confirm the ref with `git rev-parse <fixed-point>`.
Confirm that the diff is nonempty.
Stop here for an invalid ref or empty diff.

### 2. Identify the spec source

Find the originating specification in this order:

1. Fetch issue references from commit messages through the tracker document's workflow. Examples are `#123`, `Closes #45` and GitLab `!67`.
2. Read a path supplied by the user.
3. Search `docs/`, `specs/` and `.scratch/` for a specification matching the branch or feature.
4. If none exists, ask the user for its location. If the user confirms there is no specification, skip the Spec reviewer and report "no spec available".

### 3. Identify the standards sources

Find every repo file that documents coding standards.
Include `CODING_STANDARDS.md` and `CONTRIBUTING.md` whenever they exist.
Always include the repo's `AGENTS.md` and every file under `.claude/rules/`.

When astack is installed, load `astack-coding-rules`.
Paste the relevant rules into the Standards brief because that subagent cannot load skills.
If `astack-no-comments` is available, leave comments to that skill.
If it is unavailable, review comments on the Standards axis against the repo's comment rules.

Apply the Fowler smell baseline from *Refactoring*, chapter 3, even when the repo documents no standards.
Two limits apply:

- A documented repo standard overrides the baseline. Suppress a smell when the repo endorses that pattern.
- A smell is a labeled judgment, such as "possible Feature Envy". It is never a hard violation. Skip anything that tooling already enforces.

Use these definitions and fixes against the diff:

| Smell | Meaning | Possible fix |
|---|---|---|
| Mysterious Name | A name does not show what the function, variable or type does or holds | Rename it. If no accurate name fits, reconsider the design |
| Duplicated Code | The same logic shape occurs in several changed hunks or files | Extract the shared shape and use it from both |
| Feature Envy | A method uses another object's data more than its own | Move it to the data it uses |
| Data Clumps | The same fields or parameters repeatedly travel together | Group them in a type |
| Primitive Obsession | A primitive or string represents a domain concept that needs a type | Give the concept a small type |
| Repeated Switches | The same `switch` or `if` sequence repeats for one type | Use polymorphism or one shared map |
| Shotgun Surgery | One logical change needs scattered edits | Group code that changes together in one module |
| Divergent Change | One module changes for several unrelated reasons | Split it so each module has one reason to change |
| Speculative Generality | New abstractions, parameters or hooks serve no current specification need | Delete them and inline until a real need exists |
| Message Chains | A caller depends on long navigation such as `a.b().c().d()` | Hide that navigation behind a method on the first object |
| Middle Man | A class or function mainly forwards calls | Remove it and call the target directly |
| Refused Bequest | An inheritor ignores or overrides most inherited behavior | Replace inheritance with composition |

### 4. Spawn both sub-agents in parallel

Make both Agent calls together in the foreground.
Use `subagent_type: "astack-explorer"` for each.
It reads files and runs read-only commands.
It cannot edit, spawn agents or load skills.
Aggregate the reports after both return.

Give the Standards reviewer:

- The full diff command and commit list.
- Every standards-source path from step 3.
- The full smell baseline from step 3. The reviewer has no other access to it.
- This brief: "Report every documented-standard violation by file or hunk. Cite its source file and rule. Report baseline smells with their names and quoted hunks. Separate hard violations from judgment calls. Smells are always judgments, and documented repo standards override them. Skip checks that tooling enforces. Use fewer than 400 words."

Give the Spec reviewer:

- The diff command and commit list.
- The specification path or fetched content.
- This brief: "Report missing or partial requirements, behavior outside the requested scope, and requirements whose implementation appears wrong. Quote the specification line for each finding. Use fewer than 400 words."

If no specification is available, skip that reviewer and say so in the final report.

### 5. Aggregate

Present the reports under `## Standards` and `## Spec`.
Use them verbatim or with light prose edits.
Never merge or rerank findings across axes.

End with one summary line.
Give the finding count and worst issue, if any, for each axis separately.
Do not choose an overall winner between axes.

## Scoped checklists

Use [the TypeScript checklist](references/typescript.md) for TypeScript and TSX changes.
Use [the PostgreSQL checklist](references/postgres.md) for SQL in a PostgreSQL repo.
These checklists also work in clients that have no native agents.

The optional `typescript-reviewer` and `postgres-reviewer` agents use those same checklists.
They inherit the selected model and have only Read, Grep, and Glob tools.
Give each a base, head, and scope.
The parent runs executable proof and applies any accepted fix.
Keep the existing reviewer selection unless the owner or repo profile selects an extra reviewer.

## Why two axes

A change can pass one axis and fail the other.
Code can follow every standard while implementing the wrong requirement.
That passes Standards and fails Spec.
Code can meet the issue while breaking repo conventions.
That passes Spec and fails Standards.
Separate reports keep either result from hiding the other.
