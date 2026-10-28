---
name: wayfinder
description: Plan work across agent sessions with a shared map of decision tickets. Resolve questions until the route to the destination is clear.
disable-model-invocation: true
---

# Wayfinder

Plan work that cannot fit in one agent session.
Use a shared tracker map to record the decisions still needed before the work can proceed.
Resolve its decision tickets one at a time until the route is clear.
Decision tickets settle questions rather than define implementation slices.

Name the destination before creating tickets.
It can be a spec for later refinement, a decision needed before planning, or a change such as a data-structure migration.
The destination determines the questions that belong on the map.
This process also applies outside engineering, such as course content.

## Plan before execution

Wayfinder produces decisions by default.
The map is complete when no decision remains before execution can begin.
When implementation is the next action, hand off the completed plan.
A map's Notes can explicitly include execution in its scope.
Without that override, produce decisions rather than deliverables.

## Use the astack planning entry point

When `astack:plan` is available, use `/astack:plan` as the planning entry point.
Its programme tier creates the map from a plan index, records decisions there and resolves the tickets.
Run wayfinder directly for a map that `/astack:plan` did not create.
You can also run it directly when the planning capability is unavailable.

## Refer to each item by title

In every human-facing reference, use the map or ticket title as a link.
This includes narration and the map's Decisions so far.
Do not substitute a bare ID, number or slug for the title.
Keep the ID or URL within the named link.
A sequence such as `#42, #43, #44` hides the ticket titles.

## The map

The canonical map is one tracker issue labelled `wayfinder:map`.
Its tickets are child issues.
The map indexes decisions with a short summary and a link to each ticket.
Keep the full decision in its ticket only.
Do not duplicate the decision in the map.

Consult "Wayfinding operations" in the configured tracker document for map storage, child relations, blocking and frontier queries.
If the tracker is unspecified, tell the user to run `/astack:setup`.
Use local Markdown as the default when no tracker has been supplied.

### The map body

Load this summary once per session.
Find open tickets by querying the map's children rather than listing them in its body.
Use the `astack:write-ticket` headings below, including when that skill is unavailable.
The astack hook accepts those headings.
Put the destination under Outcome.
Put excluded work under Scope.

```markdown
## Problem

<why this effort needs a map: the fog between here and the destination>

## Outcome

<the destination: what reaching the end of this map looks like, the spec, decision, or change this effort is finding its way to. One or two lines; every session orients to it before choosing a ticket.>

## Acceptance criteria

- [ ] No open child ticket remains.
- [ ] Not yet specified is empty.
- [ ] A spec built from this map with /astack:to-spec is approved.

## Scope

<what is in scope; then out of scope, one line per item ruled beyond the destination: the gist, why, and a link to its closed ticket. It never graduates.>

## Verification

The operator reads the spec that /astack:to-spec produces from this map and approves it.

## Notes

<domain; skills every session should consult, each with its plugin, as in `astack:grilling`; standing preferences for this effort>

## Decisions so far

- [<closed ticket title>](link): <one-line gist of the answer, one line per closed ticket>

## Not yet specified

<in-scope fog you can't ticket yet; graduates as the frontier advances>
```

### Tickets

Each ticket is a child issue identified by its tracker ID.
Size its question for one 100K token agent session.
Use these headings:

```markdown
## Problem

<the decision or investigation this ticket resolves, and the team, phase or milestone that its answer blocks>

## Outcome

<the form of the answer, such as a chosen option, a measured number or a ratified sketch, and where the answer is recorded>

## Acceptance criteria

- [ ] The answer is posted as a resolution comment.
- [ ] The map's Decisions so far links this ticket.

## Scope

In:
- This question.

Out:
- The build work the answer unblocks, and every sibling question on the map.

## Verification

<who or what confirms the answer: the operator in a HITL session, primary-source citations for research, the prototype branch and its observed result>
```

Give each ticket one `wayfinder:<type>` label from `research`, `prototype`, `grilling` or `task`.
See [Ticket types](#ticket-types).
Maps and tickets use `wayfinder:` labels only.
Never apply triage labels such as `ready-for-agent`, because these tickets settle decisions rather than implementation work.
Do not apply a bug label.
Exclude bug, regression, crash and broken from their titles.
Those words make the astack hook require bug-report headings.

Claim a ticket by assigning it to the developer driving the map.
Make the assignment before any work so concurrent sessions skip it.
An open ticket without an assignee remains unclaimed.

Use native tracker dependencies when available.
They show the eligible work in the tracker's UI without requiring the user to open the map.
Use a body convention only when native blocking is unavailable.
A ticket is unblocked when every blocker is closed.
The frontier contains open, unblocked and unclaimed children.

Record the answer during [resolution](#work-through-the-map), outside the ticket body.
Link assets from the issue instead of pasting their contents.

## Ticket types

A HITL ticket requires a live exchange with a human who speaks for themselves.
Never supply the human's answers yourself.
An AFK ticket permits the agent to drive its work alone.

### Research

Research is AFK.
Use it to find facts in documentation, third-party APIs or resources outside the working directory, such as knowledge bases.
Delegate to a background `Agent` with `subagent_type: "astack:researcher"`.
Follow `astack:research`: use primary sources and produce one cited file.
The facts must settle a prerequisite for a decision.

### Prototype

A prototype is HITL.
Create a cheap, rough artifact that makes a question concrete enough for the user to answer.
Examples include an outline, draft, stub, UI or logic code.
Load `astack:prototype` with the Skill tool.
Link the prototype as an asset.
Use this type when appearance or behavior is the deciding question.

### Grilling

Grilling is HITL and is the default ticket type.
Load both `astack:grilling` and `astack:domain-modeling` with separate Skill calls.

### Task

A task is manual work required before a decision can be made.
Use it when no decision, prototype or research can proceed until that prerequisite is complete.
Examples include service signup, access provisioning or moving data so its shape can be examined.
A task belongs on the map only to unblock a decision, rather than deliver the destination.
Drive the task as AFK where possible.
Otherwise give the human a precise HITL checklist.
Resolve it when the prerequisite work is complete.
Record the work and the facts later tickets need, such as credential locations, new URLs or row counts.

## Not yet specified

Keep the map deliberately incomplete where questions cannot yet be stated precisely.
The source term "fog of war" names that uncertainty.
Record each suspected question or area to revisit under Not yet specified.
Everything in that section must be within the destination's scope.
Use as much detail as current knowledge supports.
The section also helps collaborators understand what remains unresolved.

Use a ticket as soon as you can state its question precisely.
The question can be blocked or currently unanswerable.
Use Not yet specified when you cannot yet phrase the question precisely.
Do not divide that uncertainty into tentative ticket-sized pieces.
One uncertain area can later produce several tickets or none.

When a resolution makes a question precise, create its ticket and remove the corresponding uncertainty from the map.
Continue until the destination needs no further tickets.
Exclude completed decisions, live tickets and out-of-scope work from Not yet specified.

## Out of scope

The destination fixes the scope.
Record work beyond that destination under Scope as excluded work.
Do not put it in Not yet specified.
Out-of-scope work never becomes a ticket within this effort.
A changed destination starts a new effort rather than resuming the old one.

If an existing ticket proves out of scope, close it.
Under Scope, record a short summary, its exclusion reason and a link to the closed ticket.
Do not add that item to Decisions so far.
That section records decisions on the route to the destination.
An exclusion does not advance that route.

## Invocation

Use either mode below.
Resolve at most one ticket in a session, except for research tickets.

### Chart the map

Use this mode when the user supplies an initial idea.

1. Settle the destination first. Load `astack:grilling` and `astack:domain-modeling` with separate Skill calls. Identify the spec, decision or change that defines the scope.

2. Interview across the full decision space before exploring one topic deeply. Identify open decisions and the first available actions. If no uncertainty remains and the whole effort fits one session, stop. Ask the user how to proceed without creating a map.

3. Create the map with `wayfinder:map`. Fill Problem, Outcome, Scope and Notes. Leave Decisions so far empty. Record the uncertain areas under Not yet specified.

4. Create every child ticket whose question is already precise. Add blocking edges in a second pass after real issue IDs exist. Add cross-references in that pass too. Never use a placeholder such as `#<n>`, because it can link an unrelated issue. Dependencies determine frontier and blocked tickets. Leave questions that cannot yet be stated under Not yet specified.

5. Start a background `Agent` with `subagent_type: "astack:researcher"` for each new research ticket. Run these research tasks in parallel. Save findings on a temporary `research/<name>` branch. Link it from the ticket as a context pointer. Push that branch without opening a PR. Never merge it.

6. Stop after charting. Resolve no ticket manually in that session.

### Work through the map

Use this mode when the user supplies a map URL or number.
A specific ticket is optional.
Without one, select the next decision yourself.

1. Load the map summary without loading every ticket body. If Notes assigns resolution to `/astack:plan <slug>`, direct the user to that command and stop.

2. Use the ticket the user named, or choose the first frontier ticket in order. Claim it through assignment before any work.

3. Resolve the type named by its `wayfinder:<type>` label. Read the label, because the body does not state the type. Fetch related or closed ticket bodies only as needed. Load skills named in `## Notes`. When uncertain, load `astack:grilling` and `astack:domain-modeling` with separate Skill calls.

4. Post the answer as a resolution comment. Close the issue. Append a short summary and ticket link to Decisions so far.

5. Create newly precise tickets before adding their real-ID dependencies. Remove their former entries from Not yet specified. If the answer exposes an out-of-scope ticket, close it under the exclusion process instead of recording a route decision. Update or delete other tickets that the decision invalidates.

Expect concurrent tracker edits because the user can run unblocked tickets in parallel.
