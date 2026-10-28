# Slack conversations

## Search the record

Inspect the available Slack MCP and its tool schema first.
Tool names vary by server.
A server exposing only `authenticate` and `complete_authentication` is not signed in.
If authentication fails, stop and report that Slack was unavailable.

1. Search messages from the PR author around the merge date.
   This limits the search to a useful author and period.
2. Search the PR URL or `/pull/<number>` for review and design discussion.
3. Search exact handled error strings for related incident threads.

## Check limits

Old messages may have expired under retention rules.
Record the earliest searchable date when it limits coverage.
Private DMs may be unavailable to search.
State that limit instead of treating the search as complete.

A casual joke is not proof of a decision.
Look for considered discussion of the choice.
Fetch the full thread before you interpret one message.

If the MCP is not authenticated, report the access gap.
Do not invent findings or describe an unsearched record as empty.
