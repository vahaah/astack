# Migrate Callers Then Delete Legacy APIs

When you choose a new internal API, move each caller in one refactor wave.
Remove the old API in that wave. Do not keep a compatibility layer.

`astack-coding-rules` gives the rule in its section "Keep the change small and fenced".

Apply it when no external user needs backward compatibility and the project can take a coordinated break.
Two APIs give two paths for the same work.

You skipped this principle when both APIs still do the same work after the change.
