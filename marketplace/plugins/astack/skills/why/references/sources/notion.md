# Notion docs

## Available evidence

Notion can record reasons before implementation.
Search these document types:

- Product requirements, technical specs, and RFCs.
- Architectural decision records.
- Design review and meeting notes.
- Team pages with domain context.
- Incident postmortems and runbooks.
- Strategy documents that set priorities.

## Search the record

Use the Notion MCP.

1. Use `notion-search` for feature names, key symbols, class names, author handles, errors, and user-visible terms.
   Add a time range when the ship date is known.
2. Use `notion-fetch` to read complete candidate pages.
   A preview can omit the reason.
3. Follow backlinks and child pages within the source.
   Alternatives, appendices, and implementation notes can appear on separate pages.
4. Check related databases through `notion-query-data-sources` and `notion-query-meeting-notes`.
   These can locate meetings that discussed the choice.
5. Search an author's work spaces when they contain relevant planning notes.

## Evaluate evidence

Look for a problem statement or motivation that matches the target.
Read alternatives and rejected approaches.
A postmortem can connect the code to an incident.
Meeting notes can tie a decision to the PR's author and date range.
An ADR needs specific status, context, decision, and consequences rather than an empty template.

## Check limits

A spec can describe a plan that changed before implementation.
Compare it with the actual PR.
If code and a doc disagree, return the contradiction.

A required Why heading can contain filler instead of reasons.
Relevant docs may have no incoming links, so search broadly enough to find them.
For several drafts, identify the final version or latest update and report its date.
If a page is unavailable, record an access gap.

## Return findings

For each relevant doc, return:

- Title and URL.
- Authors and last-updated date.
- Exact motivation text and its page or section location.
- Relevant linked pages for citation.
- Whether the doc is final or a draft.
