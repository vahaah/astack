# Datadog telemetry

## Available evidence

Datadog records runtime behavior in production.
Its records can show conditions that preceded a code change:

- Metrics: counters, gauges, and histograms.
  Their presence shows that the team chose to measure them.
- Monitors and alerts: conditions that the team chose to watch or escalate.
  A `rate_limit_hit > 10/min` alert records concern about that threshold.
- Dashboards: selected views of a subsystem's behavior.
- APM traces and spans: request paths, latency, and failures.
- Logs: events and errors that may explain defensive code.
- Incidents: timelines and linked postmortems.
- Notebooks: exploratory investigations and hypotheses.

## Search the record

Use the Datadog MCP.
Start broadly and then narrow the scope.

### 1. Find the owning services

   ```
   search_datadog_services (filter by name or team)
   search_datadog_service_dependencies (see upstream/downstream)
   ```

### 2. Read dashboards and monitors

   ```
   search_datadog_dashboards (query: feature name, service name, symbol)
   search_datadog_monitors   (same queries)
   ```

Record relevant queries and thresholds.
They can explain why code uses a particular limit.

### 3. Inspect metrics

   ```
   search_datadog_metrics (by name pattern, e.g., the feature or symbol)
   get_datadog_metric_context (metadata: description, units, tags)
   get_datadog_metric (timeseries; "was there a spike around the PR date?")
   ```

Compare metric behavior with the target's introduction or change date.
A `payment_timeout` spike before retry logic can support a connection between them.
The timing alone does not prove it.

### 4. Narrow log searches

   ```
   search_datadog_logs (raw log patterns near the target, set use_log_patterns=true)
   analyze_datadog_logs (SQL-style aggregations, only when you need counts)
   ```

Search symbols, errors, and feature names.
Prefer a bounded period, such as 30 days before and after the change.
Use `use_log_patterns=true` for raw pattern searches.
Use aggregation when counts answer the question.
Do not return large raw logs.

### 5. Inspect spans and traces

   ```
   aggregate_spans    (stats: "how often does this endpoint fail?")
   search_datadog_spans (inspect individual spans)
   get_datadog_trace  (a specific trace ID)
   ```

Use them for timeout, retry, slow-path, and cross-service questions.

### 6. Read incident records

   ```
   search_datadog_incidents (by title, team, date range)
   get_datadog_incident     (full detail for a specific incident)
   ```

For defensive code, search incidents near its introduction date.
A timeline that names the added check can give strong evidence of the reason.

## Evaluate evidence

Useful signals include these cases:

- A monitor query and threshold match the code's constraint.
- The target's author created a dashboard for the same measured or guarded conditions.
- A production spike precedes the merge and later values stabilize.
- An incident names the target, its symbols, or the same errors.
- Earlier logs show errors that the defensive code could prevent.

## Check limits

Correlation does not prove causation.
Check other PRs in the same period before attributing a change in behavior.
A chart's title records its author's focus, not the reason for a particular code line.

Metrics can change names, disappear, or expire.
Missing data for the requested period is a gap, not an empty result.
Narrow logs by service, tags, and time.
Use `analyze_datadog_logs` to aggregate instead of returning raw logs.
Measurement shows that someone tracked a condition.
Compare it with commit and PR dates before you infer why code was added.

## Return findings

For each relevant item, return:

- Type: dashboard, monitor, metric, log pattern, trace, incident, or notebook.
- Title or name.
- Link or identifier.
- Owner or author and creation or modification date.
- Exact condition, query, or relevant quote when possible.
- Connection to the target and the strength of that connection.
