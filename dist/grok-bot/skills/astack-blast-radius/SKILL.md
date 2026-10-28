---
name: "astack-blast-radius"
description: "Find effects of a change outside its diff before it ships. Prove the key safety fact by running real code. Use for \"blast radius of X\", \"what could this break\", or a small diff that needs review."
disable-model-invocation: true
metadata:
  astack-version: "0.1.0"
---

# Blast radius

Find failures that a change can cause elsewhere before it ships.
Use this for "blast radius of X", "what could this break", or a small diff that needs review.

Use **how** to explain what code does and **why** to explain its design.
Blast radius examines effects elsewhere.
Go beyond the caller list that a search can find.

## Don't trust your own writeup

A plausible report does not prove that its claims are true.
Find the one or two facts on which the report depends.
Prove them by running code before you return the report.

### How sure are you

For every fact that safety depends on, reach the strongest cheap evidence level below.
State where the evidence stops.

1. An assertion alone gives no proof.
2. A real `file:line` or the library's own source identifies the relevant code.
3. A trace of the failure shows why the bad case cannot occur.
4. A script or test calls real code and fails if the claim is wrong.
5. A reproduction demonstrates the behavior in the running app.

Level 4 usually needs a small script that imports the shipped library and calls the exact function in question.

## Steps

1. Read the diff and every added, changed or deleted symbol. Explain the new behavior, including effects outside the diff. Follow step 2 of **why** at `../astack-why/SKILL.md` to get the PR and commits.
2. Find the fact that makes the change safe. For example, a call may only remove dead cache entries and have no other effect. If that fact holds, it can rule out several failures. Spend time proving it rather than listing speculative risks.
3. Read the called library's source, pinned version and local patches. Trace timing through microtasks, unmount and teardown, including differences between Solid and React. Follow effects through API JSON, database columns, wire formats, readers in other languages, feature flags and downstream code. A symbol search may miss these links.
4. Give each risk a realistic likelihood and cost. Keep confirmed risks separate from cases that you checked and cleared. Follow **why** for evidence. Cite real `file:line` references. A search with no result is evidence too. Never invent a caller or API.
5. Write a script or test that proves the key fact through real code. Run it. Include its output.
6. For a large or wide change, read **arena** at `../astack-arena/SKILL.md`. Follow it from this thread. Give several models the same question and combine their answers. Different models can find different real bugs.

## What to hand back

- "What it does" explains the change and effects that the diff does not make obvious.
- "The one fact it's safe because of" states the fact, evidence level and proof. Mark it unproven when proof is missing.
- "Risks" gives each failure path, `file:line`, likelihood, impact and check. Include proof for material risks.
- "Cleared" lists checked cases and the reasons they are safe.
- "Before you merge" gives the cheapest test or reproduction for the real bug, including your script.

Apply `unslop` at `../astack-write-docs/references/unslop.md`.
Cite real code.
Remove private content before any public output.

Return the report with the key safety fact proven or marked unproven.
