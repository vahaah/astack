# Databricks analytics and system tables

## Available evidence

Databricks records product usage, data pipelines, and warehouse activity.
Datadog records infrastructure and runtime behavior.
Use the warehouse for user actions, experiments, feature usage, and the data behind thresholds.

- Product events can live in raw `your_warehouse.events.analytics_track_event` and typed dbt models under `<your_analytics_db>.<schema>.<table>`.
  They can record feature calls, clicks, acceptance, rejection, submissions, and client errors.
- Usage and billing can appear in `your_warehouse.events.usage_event` and `<your_analytics_db>.<schema>.stg_usage_events`.
  Model events can appear in `your_warehouse.events.raw_model_event` and `<your_analytics_db>.<schema>.stg_raw_model_events`.
  These can explain cost or volume choices.
- Experiment and feature-flag tables record exposures and outcomes.
  Their schema depends on the organization.
  Discover names with `SHOW TABLES`.
- System tables include `system.query.history`, `system.compute.warehouses`, `system.billing.*`, and `system.access.audit`.
  They can show query cost, frequency, and warehouse load.
- dbt models under `<your_analytics_db>.<schema>` show dependencies on tables and fields.
  Upstream changes can explain consumer changes.
- Databricks notebooks can hold exploratory analysis before a code change.
  The SQL MCP cannot read them.
  Report a gap when a relevant reason may be there.

## Search the record

Use the Databricks SQL MCP and `execute_sql_read_only`.
If it returns `statement_id`, use `poll_sql_result` instead of repeating the query.

Discover schemas before you assume a table name:

```sql
SHOW TABLES IN <your_analytics_db>.<schema> LIKE '*<keyword>*';
DESCRIBE TABLE <your_analytics_db>.<schema>.stg_<event>;
```

Bound every query by time.
Large unconstrained scans can time out.
Use `_timestamp` for events and `start_time` for `system.query.history`.
Start with about 30 days before and after the ship date.
Widen the range only with a strong reason.

Prefer typed dbt models over raw events.
These models can supply deduplication, types, and liquid clustering.
The raw table can contain duplicates and untyped `properties_json`.
A typical name is `stg_<source>_<event_name_with_underscores>`.
The `<source>` can be `app`, `backend`, `website`, or `cli`.
Confirm the exact name with `SHOW TABLES` when the pattern does not resolve it.
Use raw events when no model exists or when dbt refresh lag omits recent events.

The example typed models use these column conventions:

- `_timestamp`, `_id`, `_auth_id`, `_request_id`, and `event_name`.
- `properties_<name>` for typed event fields, such as `properties_entrypoint` and `properties_size_bytes`.
- `context_team_id`, `context_client_version`, `context_country`, and `context_client_os` for extracted client context.

## Investigate the relevant pattern

1. For feature usage, count events per day across the relevant `stg_*` model near the PR merge.
   Use a window of about 30 days on each side.
   A rise from zero to steady volume can support a launch hypothesis.
   A fall to zero can suggest deprecation or deletion.
2. For a defensive threshold, inspect the relevant `properties_<name>` distribution in the 14 days before the PR.
   Compare median, p99, and maximum with the code's constant.
   A match can support a data-based origin without proving it.
3. For experiments or flags, use `SHOW TABLES ... LIKE '*experiment*'` to find exposure tables.
   Query variant exposure counts for the flag key near the PR date.
4. For migrations, backfills, or performance changes, inspect `system.query.history` in a narrow `start_time` range.
   Filter `statement_text ILIKE '%<table_or_symbol>%'`.
   Sort by `total_duration_ms` or aggregate `SUM(read_bytes)` and `COUNT(*)`.
   These queries can identify expensive work that preceded a change.
5. For a model dependency, give the model's git-history lead to the source-control investigator.
   Do not leave your assigned source to search it yourself.

An error event count that drops after a defensive PR can support a correction hypothesis.
A flag exposure row can record a `shipped` or `concluded` decision near the ship date.

## Check limits

A recorded event proves measurement, not why the code exists.
Get a PR or commit citation from the source-control investigator before you claim causation.

New instrumentation can change event volume without changing user behavior.
Check for instrumentation PRs in the same window before you infer a launch.
A current typed column may not have existed when the code was written.
Older data may store it only in `properties_json`.

dbt models under `<your_analytics_db>.<schema>.*` refresh on a schedule, often hourly or daily.
For data inside that lag, use `your_warehouse.events.*` and deduplicate by `_id`.

Confirm organization-specific experiment, flag, billing, and usage tables with `SHOW TABLES` and `DESCRIBE TABLE`.
Never report from an assumed table.
If the requested period predates retention or model creation, report a gap instead of an empty result.
Report notebooks as unavailable through the SQL MCP.

## Return findings

For each relevant item, return:

- Type: product event, experiment exposure, usage or billing event, system-table row, or dbt model.
- Fully qualified table and exact query.
- Queried time window.
- Compact counts, percentiles, and first-seen or last-seen times.
  Do not return raw rows.
- Timing relative to the target's ship date.
- Relevance and strength: direct, circumstantial, or weak.
