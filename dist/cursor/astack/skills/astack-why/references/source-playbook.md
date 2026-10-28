# Source playbooks

The why skill assigns one investigator to each available evidence category.
Each investigator reads one source-specific playbook.
These playbooks show common MCPs.
Adapt the recipe when another MCP supplies the same category.

Tool names differ by server and version.
Claude Code names MCP calls `mcp__<server>__<tool>`.
Load the server's tools with ToolSearch before use.
Then map each step to an available tool with the same purpose.

| Category | Playbook | Example source |
|---|---|---|
| Source control history | [`code-archaeology.md`](./sources/code-archaeology.md) | git and `gh` |
| Issue / ticket tracker | [`linear.md`](./sources/linear.md) | Linear, or Jira, GitHub Issues, Plane, and Shortcut |
| Long-form documents | [`notion.md`](./sources/notion.md) | Notion, or Confluence, Google Docs, and Coda |
| Real-time team chat | [`slack.md`](./sources/slack.md) | Slack, or Discord, Microsoft Teams, and Mattermost |
| Infrastructure observability | [`datadog.md`](./sources/datadog.md) | Datadog, or New Relic, Honeycomb, Grafana, and Splunk |
| Error / exception tracking | [`sentry.md`](./sources/sentry.md) | Sentry, or Rollbar, Bugsnag, and Airbrake |
| Product analytics warehouse | [`databricks.md`](./sources/databricks.md) | Databricks SQL, or Snowflake, BigQuery, ClickHouse, dbt, and PostHog |

Add [`incident-postmortem.md`](./sources/incident-postmortem.md) when the target code looks defensive.
Examples include null checks, retries, timeouts, rate limits, feature flags, egress guards, and OOM handlers.
