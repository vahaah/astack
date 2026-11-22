# Proof ladder requirements

[ADR 0015](../adr/0015-change-proof-follows-risk.md) governs the proof rung, the model registry and the profile floor.
The [model](../../formal/ProofLadder.tla) examines two models, seven path kinds, a base registry that can be absent and three floors on each side.
[The change proof requirements](change-proof-contract.md) still apply to each model run at R4.

## Acceptance criteria

- [criterion:RL-R0] A docs-only diff prints `rung: R0` and admits with no Java process, also with no Java on `PATH`. Its receipt names no jar and no Java.
- [criterion:RL-FLOOR] A base floor of R4 gives R4 to a docs-only diff, and a lower tree floor cannot lower it. The profile and apply accept `proof.minRung` from R0 to R4 and name each other value.
- [criterion:RL-SELECT] A covered path runs the manifest model first and then the model of the path, one triple each. A registry diff runs each model of both sides once, also when git does not list the registry.
- [criterion:RL-COVERS] A diff of `merge-guard.ts` or `paths.ts` with a PlanBoundary manifest runs PlanBoundary and SessionGuards at R4. Each `src/` path of a record, and each file that its Implementation correspondence maps, matches a covers or text glob of its model.
- [criterion:RL-FAIL-CLOSED] An uncovered file under a fail-closed glob stops at `rung`, names the path and starts no Java process. The fail-closed globs of the diff base also apply.
- [criterion:RL-REGISTRY-GONE] A registry at the diff base with no registry in the tree stops at `rung` and starts no Java process.
- [criterion:RL-STAGE-ORDER] A domain error stops before a rung stop, and a rung stop comes before the model evidence.
- [criterion:RL-ONE-RUN] A manifest model that a path also selects runs one triple with the manifest negative.
- [criterion:RL-STOP-ORDER] A failed positive run of the first model stops at `model` and starts no triple of a later model.
- [criterion:RL-ADMIT-R4] At R4 each selected model needs a full triple. A failed restored run of the second model stops at `model`. Below R4 the admission needs no triple.
- [criterion:RL-STALE] An edit of `formal/models.json` during the runs stops at `stale` and names the file. An edit of the registry or the profile after the rung reads it also stops at `stale`.
- [criterion:RL-SCHEMA] A scope row can omit `modelRefs`, and a `modelRefs` name that no model defines still admits.
- [criterion:RL-RUNG] Docs give R0, an unlisted path gives R1, and a covered path, a model file or a text glob gives R4. A deleted path takes its rung from the base registry.
- [criterion:RL-REGISTRY] The registry parser names the key path of each bad entry. Each registry negative of astack passes the static model plan, and `records` lists each file whose Formal claim names the model.
- [criterion:RL-UNMODELLED] Each tracked file under a fail-closed glob has a model glob or an `unmodelled` entry. Each `unmodelled` entry names a control marker of a test, and no glob is stale.
- [criterion:RL-LEGACY] A repo with no registry runs only the manifest model and keeps its earlier output, with no rung line.

## Claim boundary

The model takes the glob match, the registry parse and the TLC verdict as true observations.
The CLI controls use fixture repos and a Java shim that logs each start of Java.
No path gives R2 or R3. A law of a plan block gives them, as [the domain record requirements](domain-record.md) say.
A path outside the fail-closed globs that no glob lists runs at R1, so review of each registry diff must catch it.
