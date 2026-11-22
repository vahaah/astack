# Source scan requirements

[ADR 0026](../adr/0026-one-lexer-reads-typescript-and-javascript-comments-for-both-hooks.md) governs the one lexer of TS and JS for the comment hook and the type hook.
The [model](../../formal/SourceScan.tla) examines each sequence of up to 4 name, name word, operand keyword, dot, slash, close and comment tokens.

## Acceptance criteria

- [criterion:CS-REGEX] A new file with `export default /[//]/.source;` gives no comment. The slash after an operand keyword starts a regex, and its slashes are no comment.
- [criterion:CS-MEMBER] After `obj.default / 2;` and after `obj.return / 2;`, the comment check and the type check each keep the comment. A word after `.` or `?.` ends a value, also a keyword.
- [criterion:CS-NAME] After a name `as`, `satisfies`, `keyof` or `let`, as in `const as = 4; as / 2; // note`, the comment check and the type check each keep the comment.
- [criterion:CS-INCOMPLETE] An unterminated template in a ts file gives no comments and `complete` false.
- [criterion:KEEP-TIE] Each of the 6 keep-list copies names each of the 5 keep classes in exactly one item. A copy that loses its RFC item or its license item fails, and the failure names that copy and that class.

## Claim boundary

The model takes the token kinds as true observations of the source text.
A regex in the model ends at the next slash or comment token. The scan reads a character class and flags, and the model does not.

A regex right after the `)` of an `if`, `while` or `for` head stays a division, because only a parser can tell the two apart.
A slash after a name `of`, `yield` or `await` stays a regex, for the same reason.
A probe outside the repo compared the trunk comment lexer with the scan over 1,274 files with 0 differences. The PR Verification holds its counts.
The keep-list test ties the copies by keyword. It does not compare their words, so review examines a paraphrase.
