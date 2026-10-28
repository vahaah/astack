# Eval

You own the experiment design, blinding, execution, and synthesis.

## Blinding rules

- Keep these words out of every directory, file, and prompt that a candidate sees. The words are `eval`, `test`, `judge`, `experiment`, `rubric`, `score`, `compare`, `benchmark`, `candidate`, and `arena`.
- Make the candidate prompt look like an ordinary user request. State the goal without the experiment context.
- Use no cues that elicit the instruction chain. Do not prompt the candidate to list the skills, principles, or files it applied. Ask for design notes generally. Grade its instruction use from the code shape, not its report.
- Sanitize directory and slug names. Use project names that a user might choose.
- Do not tell a candidate that other candidates exist.
- The judge may know that it is judging. Show outputs under sanitized labels, never model names.
- When comparing two variants, use one judge to score both sets in one pass on one scale. Keep the source set hidden from the judge.

## Steps

1. State which variant the experiment tests and which behavior counts as success. Write a rubric with 3-6 concrete criteria for the judge only. Do not show it to candidates.
2. Create a separate working directory for each candidate with its variant installed. Add context that an ordinary task would have, such as a project skeleton and skills the candidate would naturally read.
3. Write one prompt that a user would naturally type. Do not reveal what the experiment measures.
4. Spawn N candidates in parallel on different models under the `arena` skill's Phase B. Give each the same prompt and its own sanitized directory. Choose each subagent's model and effort for the job under the Subagents rules.
5. Spawn one blinded judge from another model family under the `arena` skill's Phase C. Give it the outputs under sanitized labels and the rubric. Do not reveal model names.
6. Verify instruction use from transcripts rather than candidate claims. Find each transcript through Transcripts in `references/paths-and-wakeups.md`. A subagent transcript is `<session id>/subagents/agent-<id>.jsonl`. A headless `claude -p` transcript uses the slug of its own working directory. Never glob across `~/.claude/projects/*/`. That crosses workspaces and reads private chats from unrelated projects. Examine which files each candidate opened. Grade from those files and the code shape, never from the candidate's claims.
7. Read every candidate output from start to end yourself. Compare it with the judge's verdict. Disagreement means that a model is biased or the rubric is ambiguous. Produce your own synthesis.

## Reply

Name the variant, rubric, notes for each candidate, judge verdict, and your synthesis.
Recommend whether to promote the variant.
