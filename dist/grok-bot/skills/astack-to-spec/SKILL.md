---
name: "astack-to-spec"
description: "Create and publish a spec from the current conversation. Synthesize known information without another interview."
disable-model-invocation: true
metadata:
  astack-version: "0.1.0"
---

# Create a spec

Create a spec from the current conversation and your understanding of the codebase.
Synthesize the available information.
Do not conduct another interview.

If the tracker or triage labels are unspecified, tell the user to run `/astack-setup`.

When `/astack-plan` drives the work, it uses this skill for the seam step.
It renders the umbrella ticket itself.
Do not publish a second spec.

## Process

1. Explore the repo if you have not already done so. Use the domain glossary throughout the spec. Respect ADRs for the affected area.

2. Identify the seams where tests will exercise the feature. Prefer existing seams. Select the highest available seam. If a new seam is necessary, propose it at the highest practical point. Use as few seams as possible, ideally one.

Confirm that the proposed seams match the user's expectations.

3. Write the spec with the template below. When available, load `astack-write-ticket`. Score the spec with its rubric. Fix every failing point before publishing to the configured tracker. Never label the umbrella spec `ready-for-agent`. That label belongs on its implementation tickets, because one AFK run must not attempt the whole spec.

<spec-template>

## Problem

Describe the user's problem from their perspective.

## Outcome

Describe the solution as the user will experience it.

## Acceptance criteria

- [ ] Include at most seven end-to-end checks for the whole spec. Each check must be observable by a user or a test.

## Scope

State what the spec includes.
State what it excludes.

## Verification

Record the testing decisions:

- Name the seams agreed in step 2.
- Define a good test in terms of external behavior, without implementation details.
- Name the modules under test.
- Point to similar tests already in the codebase.

## User stories

Add numbered user stories only when they contribute information absent from the earlier sections.
Use this format:

1. As an <actor>, I want a <feature>, so that <benefit>

<user-story-example>
1. As a mobile bank customer, I want to see balance on my accounts, so that I can make better informed decisions about my spending
</user-story-example>

## Implementation decisions

List decisions already made.
Possible topics include these:

- Modules to create or change.
- Changes to module interfaces.
- Technical clarifications from the developer.
- Architecture decisions.
- Schema changes.
- API contracts.
- Specific interactions.

Exclude specific file paths and code snippets, because they can become stale.
A prototype snippet is an exception when it states a decision more precisely than prose.
Examples include a state machine, reducer, schema or type shape.
Place such a snippet with the relevant decision.
Briefly identify its prototype origin.
Keep only the parts that express the decision.
Do not include a working demo.

## Further notes

Record any remaining notes about the feature.

</spec-template>
