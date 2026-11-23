# Hook retry requirements

[ADR 0033](../adr/0033-a-hook-reads-each-body-file-as-its-command-leaves-it.md) governs the staged body read, the unread note, the chain line and the origin rule.
[ADR 0022](../adr/0022-each-hook-finding-leaves-an-event-line-with-no-text.md) governs the finding event of the unread note.

## Acceptance criteria

- [criterion:HR-staged] A cat heredoc, an `echo`, a `printf` or a `tee` can write a body file before the body step of the same command. The hook then judges the new text. The body steps are `gh pr create`, `gh issue create`, `gh issue comment` and `git commit -F`. The STE, PR heading and issue heading checks deny that text. An untouched file gives the disk text.
- [criterion:HR-unread] A python heredoc, `sed`, `diff`, a dynamic log target and an unknown folder before the body step give an unread body. The 4 body hooks judge the disk text, as before. The STE hook adds one note that starts with "could not read body.md" and logs one `unread-body` event with no path. A reader step such as `cat` or `astack` gives none.
- [criterion:HR-conditional] A write that can skip gives an unread body, with the same disk check and note. Such a write comes after `||` or a broken `&&` chain. It can also be inside `if`, `case`, a loop or a function, in the body pipeline or in the background.
- [criterion:HR-chain] A shell deny with 2 or more top-level commands starts with `Nothing in this command ran.` and names each step, on Claude Code and on Cursor. A one-step deny, a chained note and a substitution body keep their text. A chained `gh pr merge` keeps its merge reason.
- [criterion:HR-origin] With origin `acme/widget`, `--repo acme/widget`, `Acme/Widget` and `github.com/acme/widget` get the heading deny of this repo on `gh pr create` and `gh issue create`. `--repo other/lib` and a repo with no origin keep the advice.
- [criterion:HR-skill-path] skill-path prints the one `.md` file of `references/` or `playbooks/` with the base name of a missing file, and exits 0. A name in both folders and a name in none exit 3 with the list. Each mode path of the rule card is a file of the mode skill, and each route names its folder.
- [criterion:HR-ticket-text] A version form such as `react-native@0.76.5.patch` gives no email address, and a real address gives one, also in a code span. A lone issue template with bug headings serves a bug ticket and no feature ticket.
- [criterion:HR-pr-length] check-pr notes a PR body over 40 lines. When the body holds table rows or code lines, the note counts them and says to post them in one PR comment. A long body with neither keeps the note of today.

## Claim boundary

The hook reads the command text at PreToolUse and never sees the result of a step.
A redirect on a compound command, such as `done > body.md`, is no step, so the hook reads the disk.
A write in a nested shell, a substitution or a function gives an unread body, also when it always runs.
`sameRepo` drops the host, so a repo of the same owner and name on another host counts as origin.
