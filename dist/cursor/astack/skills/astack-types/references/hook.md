# The type hook

The astack hook reads `Edit`, `Write` and `MultiEdit` changes to `.ts`, `.tsx`, `.mts` and `.cts` files.
It compares each whole-file pattern count before and after the change.
When a deny count grows, it rejects the change and identifies the new lines.
It checks these patterns:

- `any` in a type position.
- an unsafe cast, which is `as T` other than `as const` and a bare `as unknown`, and also `as unknown as T` and `<T>value` in a `.ts` file.
- a non-null assertion, which is `value!` and `let value!: T`.
- `@ts-ignore`, `@ts-nocheck`, and `@ts-expect-error` outside a `*.test-d.ts` file.

Growth in `enum` declarations, `Function`, `Object` or `{}` types, or unlisted class bases produces a note rather than a deny.
The tokenizer excludes strings, templates, regular expressions, comments and JSX.
A file that cannot tokenize passes.

Existing code does not need cleanup merely to pass this count rule.
Moving, renaming or formatting a line preserves its count.
A new cast raises the count even when old casts remain in the file.
Remove an old cast or `any` only in work about that code.

The hook skips `*.d.ts`, `*.gen.ts`, `*.generated.*`, `generated/` paths and Supabase type output.
It also skips a file with `@generated` or "DO NOT EDIT" in its first 5 lines.
Set further repo exceptions in `.astack/profile.json`:

```json
{
  "types": {
    "skip": ["legacy/**"],
    "allow": [
      { "paths": ["packages/kernel/src/brand.ts"], "kinds": ["cast"], "reason": "brand constructors" }
    ],
    "extendsAllow": ["^Base[A-Z]\\w*Error$"]
  }
}
```

`skip` contains globs for files that the hook leaves unread.
An `allow` entry requires paths, kinds and a reason.
The hook ignores an incomplete entry.
Kinds are `any`, `cast`, `non-null`, `ts-ignore`, `ts-nocheck`, `ts-expect-error`, `banned-type`, `enum` and `extends`.
Keep one kernel file per repo in `allow` for brand constructors, one `fake<T>()` test helper and DOM type guards.
`extendsAllow` contains regular expressions for additional class bases.

For a tool without hooks, run the same check through a git hook or CI:

```sh
astack check-types                 # the working tree, the staged and the untracked files against HEAD
astack check-types --staged        # the staged diff only
astack check-types --base main     # HEAD against its merge base with main
astack check-types --json          # the findings as JSON
```

The command exits 1 when a deny count rises in any file.
