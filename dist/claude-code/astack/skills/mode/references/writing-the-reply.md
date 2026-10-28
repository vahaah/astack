# Writing the reply

Write the reply clean as you draft it.
A cleanup pass after drafting does not remove these patterns.

- Write short declarative sentences. Put one thought in each sentence. End it with a period.
- Never use a long-dash character. Write a file-list bullet as a sentence, such as "`main.js` owns persistence and the IPC handlers". Write a bold section header as its own sentence, such as "**Verification.** End to end via CDP".
- Do not use a colon as a connector within a sentence (unslop rule 14). A colon before a list is fine.
- Keep every section that the playbook's reply names. Brevity does not permit you to drop details, tradeoffs, choices, or open decisions.
- Describe the impact for the consumer and maintainer. Name who the work serves and what changes for them before any implementation detail. Examples include an end user or a colleague who imports the library. Then describe what the next engineer who owns this code inherits. If you cannot say what either would notice, the work or explanation is wrong.
- Never fabricate a link, citation, or transcript reference. Link only artifacts that you produced or read this session.
- Put each claim's evidence or label in the same sentence. Labels are measured, inferred, or guess. A prediction or unseen cause is a guess. Never hand the human a check that you can run.

Every playbook ends with a reply written this way.
Use the PR link format `https://github.com/<owner>/<repo>/pull/<number>`.
Each playbook's reply lines name only the content that is unique to that playbook.

## Comments

Write comments clean as you go, under the same rules as replies.
Keep a comment only when a keep clause in `astack:comment-judge` covers it.
If your own code has a surprise, use a rename, type, or test instead of a comment.
Do not add comments that narrate phases in a verification or test script, such as `// Phase 1: add cards`.
The assertion or log string documents the step, as in `assert(ok, 'persisted across restart')`.
These rules apply to every file you produce, including the delegate's diff.
