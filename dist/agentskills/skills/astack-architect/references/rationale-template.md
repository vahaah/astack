# Rationale template

Write one page beside the type sketch.
Use sentence-case headings without boilerplate.
Replace the italic instructions with the actual rationale.

## Problem

*Use one paragraph. State the goal and the existing constraints that make the design choice unclear. Include constraints found in [Phase A](../SKILL.md#phase-a-ground-the-problem). Name existing types, callers that must keep working, and invariants that span the design. Give the reader the same constraints that guided you.*

## Usage (caller's view)

*Write this section before the type sketch. Show the consumer's README or quickstart and two or three realistic call sites. Show imports, calls and results. Derive [Shape](#shape) from this usage. Keep the two consistent. When they differ, correct the sketch to match the usage. The caller's experience is the specification that the types must serve.*

## Shape

*Describe the recommended architecture, with data structures first. Trace data through the signatures. Name the decisions that the design depends on. State the invariants encoded in types and the location of validation. State what the system deliberately excludes. Judge interface depth. Name hidden complexity and what callers must still know. Explain why the interface needs its size. Cite each decision's principle, such as `per boundary-discipline`, without repeating the principle.*

## Synthesis decision

*[Arena](../../astack-arena/SKILL.md) fills this section. Name the base candidate and the reason for that choice. Name each part taken from another candidate. Record rejected parts and their reasons.*

## Tradeoffs accepted

*Write one bullet for each tradeoff in the form "we accept X in exchange for Y." Include choices that could look accidental. Cover apparent premature optimization or simplification when relevant.*

## Alternatives considered

*Include this section. Name at least one concrete alternative shape and its rejection reason in one line. Judge interface depth as well as implementation simplicity. State the complexity each alternative exposes and hides. Include two or three alternatives when several were viable. One is enough when constraints force the answer. Then say "this was the only viable shape because..." Compare different shapes rather than small variants. Cover alternatives within the chosen shape, separately from other runner candidates.*

## Open questions and risks

*Name questions that need the user's judgment and risks to consider before implementation. Phrase them as questions so the user's answers resolve them.*

## Next implementation step

*Give one sentence that names the first work against the sketch. This starts after synthesis, or after sign-off when the invoker requested a checkpoint.*
