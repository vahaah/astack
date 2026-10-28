import { DEFAULT_OWNER_GATES } from "./types.ts";

function frontmatter(tier: string, extra: readonly string[]): string {
	return [
		"---",
		"plan: <slug>",
		`tier: ${tier}`,
		"status: draft",
		"home: repo",
		"tracker: none",
		"delegate: off",
		"checkpoints: report",
		`owner-gates: [${DEFAULT_OWNER_GATES.join(", ")}]`,
		...extra,
		"execute: none",
		"reviewed: <today>",
		"---",
		"",
	].join("\n");
}

const GOAL = `## Goal

Goal. <The end state in one sentence that a person who never read the code can confirm.>
Decision. <The one decision this work drives, as a question the owner asks.>
Done when. <A check that is false today, with a number.>

## Scope

- In. <What the plan covers.>
- Out. <What it leaves alone that someone can think is included.>

## Decisions

| # | Kind | Decision | Rejected | Door | Settled | Record |
|---|---|---|---|---|---|---|
| D1 | goal | <The goal decision as a fact> | | two-way | default | plan |
`;

const SESSION = (handle: string) => `## Sessions

### ${handle} <What becomes true when this PR merges>

State. now
Depends on. None.
Exit.
- Given <state>, when <action>, then <a result with a number>.
Proof. \`<command that proves the exit>\`

| # | Step | Wave | Lane | Files | Covers | Exit | Proof | Checkpoint |
|---|---|---|---|---|---|---|---|---|
| 1 | <Verb phrase> | W1 | a | <path or path#region> | D1 | <A check that can fail> | \`<command>\` | report |
| 2 | <Verb phrase> | W1 | b | <another region> | D1 | <A check that can fail> | \`<command>\` | report |
| 3 | <Verb phrase> | W2 | integrator | <path> | D1 | <A check that can fail> | \`<command>\` | approve ui |

## How each step runs

<Only what differs from the protocol in the astack:plan sessions reference, such as a device matrix.>

## Proof

- \`<the whole-work proof command>\` passes on the session branch.
`;

const TAIL = `## Unresolved questions

1. <A question worded so yes accepts the recommendation>? Recommended. <Answer>, because <evidence> (principle <name>). Rejected. <Option and its cost>. Settles. D1.
`;

export const STANDARD_TEMPLATE = `${frontmatter("standard", [])}
# <Role> can <do what they cannot do today>

<At most five lines. What changes, for whom, and why now.>

${GOAL}
${SESSION("S1")}
${TAIL}`;

export const BRIEF_TEMPLATE = `${frontmatter("brief", ["programme: <programme slug>", "block: B01"])}
# <Block outcome as a claim>

<At most five lines. The demo this block adds to its milestone.>

${GOAL}
${SESSION("B01/S1")}
${TAIL}`;

export const PROGRAMME_TEMPLATE = `${frontmatter("programme", [])}
# <The destination, stated as a claim>

<At most five lines. Why this needs more than one milestone.>

${GOAL}
## Milestones

### M1 <Demo title>

State. next
Demo. <One sentence that a person can watch on the real system.>
Proof. \`<command that proves the demo>\`
Depends on. None.
Blocks.
- B01 <Block outcome>. Lane. a. Brief. stub.
- B02 <Block outcome>. Lane. b. Depends on. B01. Brief. stub.

### M2 <Demo title>

State. later
Demo. <One sentence that a person can watch on the real system.>
Depends on. M1.
Fog. <What nobody can ask as a question yet.>

## Not yet specified

- <Fog that nobody can ask as a question yet.>

${TAIL}`;

export const TEMPLATES = {
	standard: STANDARD_TEMPLATE,
	programme: PROGRAMME_TEMPLATE,
	brief: BRIEF_TEMPLATE,
} as const;
