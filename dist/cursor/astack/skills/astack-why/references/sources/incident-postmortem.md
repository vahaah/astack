# Incident and postmortem context

Search for incident evidence inside your assigned source:

- In Linear, inspect labels `incident`, `sev-*`, `postmortem-action-item`, and `reliability`.
- In Slack, search `#sev-*` and `#incident-*` around the dates that introduced the target code.
- In git, inspect messages about incident fixes, defensive checks, reverts, and later reapplication.

A sequence such as `revert` followed by `re-apply with...` can identify a relevant change to investigate.
