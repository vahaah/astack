# 0026. One lexer reads TypeScript and JavaScript comments for the comment hook and the type hook

Status: Accepted
Date: 2026-11-22
Ticket: none
Supersedes: none

## Context

The comment hook had its own lexer of TS and JS, `lexJs`, in `src/astack/comments/lexer.ts`.
The type hook reads the same files with `scan` in `src/astack/types/scan.ts`.
The two lexers read a slash after a keyword with two keyword sets of 14 and 24 words.

So they disagreed on real forms.
`lexJs` read `export default /[//]/.source;` as a division and a comment, and the comment check reported that false comment.
`scan` read `/ 2; /` in `obj.default / 2; // note` as a regex, and the type check lost the comment.
Both lost the comment after `obj.return / 2;`.
`scan` also lost the comment after a name `as`, `satisfies`, `keyof` or `let`, which are legal names.
A fix of a regex rule had to land twice.

The bundle has no `typescript` package at run time, because it is a dev dependency only.
`unitsOf` in `src/astack/comments/added.ts` is the one caller of `lex`, and it reads no comment of an incomplete result.

## Decisions

### D1. The comment hook reads TS and JS comments through the scan of the type hook

`lex` maps a scan of a ts, tsx or jsx file to raw comments inline.
A scan that fails gives no comments and `complete` false.
`SourceComment` holds the start and the end of each comment.
`lexJs`, its frames, its keyword set and its regex and JSX helpers go.
The lexers of SQL, Swift, Kotlin, Go, Rust, CSS, SCSS, Python and shell stay in `lexer.ts`.

#### Formal claim

A slash after a member name is a division, also when the name is a keyword.
A slash after a name `as`, `satisfies`, `keyof` or `let` is a division.
A regex after an operand keyword yields no comment.
A failed scan gives no comments and an incomplete result.

```text
MemberNameIsValue      == a slash after a dot and a word is a division
NameWordIsValue        == a slash after a name word is a division
NoCommentInRegex       == no comment lies inside a regex that starts after an operand keyword
FailedScanIsIncomplete == a finished scan that failed gives no comments and complete false
```

The [model](../../formal/SourceScan.tla) and its [configuration](../../formal/SourceScan.cfg) check these invariants.
The input is each sequence of up to 4 tokens of 7 kinds: name, name word, operand keyword, dot, slash, close and comment.
`Step` is one turn of the scan loop, `Fail` is a token that does not close, and `Finish` is the map in `lex`.
A regex in the model ends at the next slash or comment token, as the probe forms need.
The model does not read a character class, flags, a template or JSX.

#### Category composition

```text
scan     : ScanInput -> Scan | undefined           effects: none
lex      : LexInput -> LexResult                   effects: none
unitsOf  : LexInput -> CommentUnit[] | undefined   effects: none
```

`scan` reads a source and a JSX flag, and returns the tokens and comments, or no value.
`lex` picks the JSX flag from the language, calls `scan` and maps the result inline.
`unitsOf` returns no value for an incomplete result. Otherwise it gives the source and the comments to `commentUnits`.

The carrier is pure, and each arrow has no effect.
`unitsOf` reads the source again, so it is not `commentUnits` after `lex`.
No two arrows compose with `o`, so the record declares no composite arrow, and no category law applies.

#### Implementation correspondence

`scan` in `src/astack/types/scan.ts` maps to the `Step` and `Fail` actions.
Its value rule maps to the `value` expression of `Step`, with `takesOperand`, `OPERAND_KEYWORDS` and `isMemberDot`.
`lex` in `lexer.ts` maps to the `Finish` action, and `unitsOf` in `added.ts` reads its `complete` flag.
In the model, the reading of each slash and the context before it are state.

The scan hides the token loop, the frames of templates and JSX, and the line numbers.
Deletion test: without the shared scan, the comment hook needs its own lexer again, and a regex fix lands twice.

#### Verification

[The proof matrix](../../.astack/proof-coverage.json) links the criteria of [the source scan requirements](../reference/source-scan.md) to their tests.
In the negative control, `Step` drops the member name rule. TLC must then report a violation of `MemberNameIsValue`.
That mutation is the defect of the old type check, which lost the comment after `obj.return / 2;`.
The normal test gate runs the lexer, type, hook and keep-list tests.

### D2. A word after a dot ends a value in the scan

In `scan`, a word right after `.` or `?.` ends a value, also a keyword.
So a slash after `obj.default` or `obj.return` is a division, and the comment after it stays.
The hatch walk of the type hook already reads a member name in this way.

### D3. A regex or JSX starts after a keyword only when the keyword takes an operand

`OPERAND_KEYWORDS` holds the 14 words of the old comment lexer and `extends`.
A word that is not in the set ends a value, so `as`, `satisfies`, `keyof` and `let` end a value when they are names.
No regex and no JSX can follow these words when they are keywords, so the rule loses no form.
`EXPRESSION_KEYWORDS` keeps its 24 words for the hatch walk of the type hook.

`default` takes an operand only after `export`, as in `export default /[//]/.source;` and `export default <App />;`.
Elsewhere `default` is a name, such as the method name in `default<Item>(x: Item)`.
In a tsx file, no JSX follows `extends` or `new`.
A type parameter list follows them instead, as in `T extends <Item>(x: Item) => void` and `new <Item>(x: Item) => Item`.

### D4. A test ties each keep-list copy to the 5 keep classes by keyword

The keep list has 7 copies in rules, skills, an agent, the comment check, the stub fallback and `AGENTS.md`.
`tests/keep-list.test.ts` reads the first keep list of each copy.
Each of the keywords `license`, `external dependency`, `prettier-ignore`, `public API contract` and `RFC` must match exactly one item.
The test does not compare words, because each copy paraphrases the frozen quote.

## Consequences

- Easier: a fix of a regex or JSX rule lands once, and both hooks read the same comments.
- Easier: the comment hook keeps the comment after `obj.return / 2;` and after a name `as`, and it reports no false comment in `export default /[//]/.source;`.
- Harder: the comment hook now builds a token list. On the 916 KB bundle, the scan took 11.0 ms against 8.2 ms for the old lexer.
- Limit: a regex right after the `)` of an `if`, `while` or `for` head is still a division. A slash after a name `of`, `yield` or `await` is still a regex. Only a parser can tell these apart.
- Limit: in a tsx file, a type parameter list such as `<Item>(` after `=` or `:` still starts JSX, as in the old lexer. The scan then fails, and the comment hook allows the change. A name of 1 or 2 characters, such as `<T>(`, is not JSX.
- Follow-up: of B24 and B25, the block that merges second drops the stub fallback row of the keep-list test with the file.

## Alternatives considered

- Port the keyword set into `lexJs` and keep two lexers. Rejected because each regex fix still lands twice.
- A new shared lexer module. Rejected because it moves 480 lines for one more importer.
- The `typescript` package as the lexer. Rejected because it is a dev dependency only, so the bundle cannot use it.
- Keep the 14-word set of `lexJs` in the scan. Rejected because it keeps the false comment in `export default /[//]/.source;`.
- Compare the exact text of each keep-list copy. Rejected because each STE paraphrase then fails.

## Invariant audit

The audit of 2026-11-22 reads `formal/SourceScan.cfg`. Each row names an invariant or a property other than `TypeOK`.

| Invariant | Class | Action | Controls |
|---|---|---|---|
| `MemberNameIsValue` | restates | `Step` | `cs-member-comment`, `cs-member-type` |
| `NameWordIsValue` | restates | `Step` | `cs-name-comment`, `cs-name-type` |
| `NoCommentInRegex` | independent | It needs each later `Step` after the jump of a regex, so it spans many steps |  |
| `FailedScanIsIncomplete` | restates | `Finish` | `cs-incomplete` |
