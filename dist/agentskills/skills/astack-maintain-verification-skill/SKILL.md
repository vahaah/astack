---
name: "astack-maintain-verification-skill"
description: "Maintain a verification skill and feature map through source review and live proof. Use for /astack-maintain-verification-skill or verification audits."
license: "MIT"
metadata:
  astack-version: "0.1.0"
  source: "astack"
  disable-model-invocation: "true"
---

# Maintain a verification skill

Keep a verification skill and its feature map consistent with the app.
This applies to skills from `/astack-create-verification-skill` and other project-local skills with a feature map.
Read source for every feature and drive every feature live.
Do not turn each sentence into a separate test.

## Report one outcome

- `clean`: source and live checks covered every feature, with no change to ship.
  Create no branch or PR.
- `changed`: one PR contains proven doc, driver, or map corrections.
- `blocked`: coverage could not finish, or a proven correction could not ship safely.
  Name the exact blocker.

## Keep the edit scope

Edit only the verification skill's directory.
That includes its `SKILL.md`, `features/`, and owned driver scripts.
Do not edit product code.

If behavior differs from the map, determine whether the map drifted or the product regressed.
Fix doc drift in the map.
Report a product regression without hiding it through a doc change.

## Run the pass

### 0. Find the target

Find the local skill with launch and drive sections and a feature map.
It usually lives under `.claude/skills/verify-*/`.
If several qualify, ask which one to maintain.
If none qualifies, stop and point to `/astack-create-verification-skill`.
Do not invent a target.

### 1. Check the index

Read the feature map README and list its sibling files.
Fix missing, extra, duplicate, and dead entries.
Do not generate a separate inventory.

### 2. Read source in parallel

Spawn one read-only subagent per feature file, all in one message.
Use `subagent_type: general-purpose`.
Tell each subagent to read without edits or app interaction.

Each explains how its user-facing feature works from source.
It cites likely doc drift and returns one concise live recipe.
Use this return shape:

- Feature summary.
- Source entry points.
- Likely drift, or none.
- One verification recipe.

### 3. Reconcile the recipes

Require a returned summary for every feature file.
Combine overlapping recipes into as few app states as practical.
Check cited drift against source.
Do not repeat the work behind clean claims.

Read recent changes for user paths missing from the map.
Require a concrete source path before you call a feature missing.

### 4. Drive every feature

Run the live pass even when source checks find no drift.
Only the coordinator drives the app.
Follow the verification skill's launch model.
For servers and UIs, drive one long-lived instance in sequence.
For short-lived CLIs, use a fresh isolated session for each drive.
The skill's Launch section selects that model.

Exercise every feature at least once.
Keep these three rules through failures too:

1. Run doctor before the first drive and in each fresh session when sessions are the unit.
   Run it again after a failed drive or surprising behavior.
   Do not continue on an instance whose health you have not checked since the surprise.
   If doctor cannot detect the fault, reset to a known state or relaunch.
   A healthy process does not prove that a UI is responsive.
2. Preserve captured evidence through every cleanup.
   Check its named location after cleanup.
3. Stop work that a drive started when that work is no longer useful.
   Clean failed-iteration residue whether the session is stuck, exited, or shared.
   For a shared instance, clean the residue without stopping the instance.

If skill drift causes a doctor failure, fix it inside the edit scope.
Then retry once.
Restart only what that correction invalidated.
If the retry fails, report `blocked`.

Use `verified-unreachable` only with the attempted route and a concrete missing prerequisite.
Name missing auth, entitlement, OS support, or external state.
If the map omits that prerequisite, correct the map.

Drive every corrected harness path live before it ships, including scripts and inline recipes.
Do final teardown after the last drive, including those repeated proofs.
No process may outlive the run.
Keep its evidence.

### 5. Classify corrections

- A wrong or missing user-facing description is doc drift.
  Fix the description.
- Working behavior that the driver cannot exercise is a driver gap.
  Fix the driver.
  Keep scripts executable and document their invocation in the skill body.
- Broken app behavior is a product gap.
  Report it to the user and keep it outside this PR.

### 6. Ship or stop

For `changed`, reread each changed file and create one PR of proven corrections.
For `clean` or `blocked`, create no PR.
Report the outcome and actual coverage.

Keep concise scratch notes for covered features, unreachable prerequisites, confirmed drift, and outcome.
Do not commit those notes.
