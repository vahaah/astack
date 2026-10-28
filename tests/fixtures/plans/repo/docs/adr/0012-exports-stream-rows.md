# 0012. Exports stream rows to the client instead of building the file in memory

Status: Accepted

## Context

Exports built the whole file in memory before sending it.

## Decisions

### D1. Exports write each row to the response as the query returns it

The export route streams rows.

### D2. An export over 100,000 rows runs as a background job and emails a link

Large exports leave the request path.
