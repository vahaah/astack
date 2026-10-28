---
name: research
description: "Research a question from primary sources and save cited findings. Use for background research, official docs, or API facts."
---

# Research

Start a background `Agent` with `subagent_type: "astack:researcher"` and `run_in_background: true`.
Continue other work while it researches the question.
The researcher cannot spawn agents.

Give it these requirements:

1. Use primary sources: official docs, source code, specs, and first-party APIs.
   Follow each claim to the source that owns it instead of relying on a secondary account.
2. Write one Markdown findings file with citations beside its claims.
3. Use the repo's existing location for research notes.
   If none exists, choose a suitable location and report it.
4. Keep notes off the main branch.
   Commit them on a `research/<name>` branch or write them outside the repo.

Notes can become stale and mislead later readers.
