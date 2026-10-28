# Sentry error history

## Search the record

Use the Sentry MCP.

### 1. Identify the scope

If the project and organization are unknown, discover them:

   ```
   find_organizations
   find_projects
   ```

### 2. Search relevant issues

   ```
   search_issues (natural language, e.g., "errors in PaymentService timeout", "unhandled exceptions in uploadFile")
   ```

Use handled exception classes, function or class names, checked error messages, and file paths as queries.

### 3. Limit release and time

   ```
   search_issue_events (filter by release, time, environment, trace ID, tags)
   get_issue_tag_values (for an issue, see distribution across versions, users, environments)
   ```

For each candidate, inspect first-seen and last-seen times.
Compare the last occurrence with the target's ship date.
Check affected releases and changes in frequency.
Identify releases with the error and the release that may contain the correction.

### 4. Read the full event

   ```
   get_sentry_resource (pass a Sentry URL or type+ID)
   ```

Check whether the stack passes through the target code.
Compare tags and breadcrumbs with the conditions that the code handles.

### 5. Check nearby releases

   ```
   find_releases (around the commit date of the target)
   ```

Compare release versions with the PR merge date.

### 6. Use Seer sparingly

   ```
   analyze_issue_with_seer
   ```

Treat Seer's root-cause analysis as a hypothesis.
Events and stack traces remain the primary evidence.

## Return findings

For each relevant issue, return:

- Issue ID and title.
- Project and organization.
- First-seen and last-seen timestamps.
- Event count and sampling rate when known.
- Affected releases.
- An exact stack trace excerpt that shows the target connection.
- Timing relative to the target's ship date.
- Issue link.
- Author comments or resolution notes.
