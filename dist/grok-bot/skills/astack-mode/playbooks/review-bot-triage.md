# Review-bot triage

Use this reference when `babysit.md` handles a review bot or other review automation.
Examples include Greptile, `claude[bot]`, the Codex connector, CodeRabbit, and Copilot.
Examine each comment before deciding whether it needs a code change.

## Decision rubric

Classify each review-bot thread before acting.

- `fix`. The comment identifies a plausible defect in correctness, security, privacy, data loss, auth, billing, or migrations. It can also concern idempotency, races, or shipped behavior. Fix it in the lowest PR that owns the code. Reply with the commit SHA and resolve the thread.
- `dismiss`. A documented noisy pattern applies and the risk is low. Current code or context must prove that no code change is needed. Reply with the short reason and resolve the thread.
- `ask`. The finding is novel, severe, ambiguous, or related to security, privacy, or data. Ask the user instead of guessing.

Ask when the evidence leaves doubt.
Skipping noise in a code-quality comment has a low cost.
Skipping a real data or security defect does not.

## Learned pattern format

Use this shape for a new pattern.

```markdown
### <short pattern name>

- Confidence: candidate | recurring | strong
- Skip when: <conditions that must be true>
- Do not skip when: <risk boundaries>
- Example signal: <phrases or code context that identify the pattern>
- Source: <PR/comment URL or short historical note>
```

Use `candidate` for 1 or 2 examples.
Use `recurring` after several real dismissals.
Use `strong` only for a narrow pattern that was verified repeatedly and has low risk.

## Recurring skip candidates

### Intentional UI or design-system visual changes

- Confidence: `candidate`.
- Skip when: The PR description, screenshots, design review, or nearby code makes the visual change explicit. The comment only repeats a changed shared visual default.
- Do not skip when: The comment concerns accessibility, focus visibility, keyboard navigation, or color contrast. This also applies to an unintended component API change.
- Example signal: A comment concerns focus outlines, button sizes, spacing, or shared visual defaults. The owner calls the change "intentional" or "intended".

### Upstack or stack-local usage a review bot cannot see

- Confidence: `candidate`.
- Skip when: The bot calls an export, component, helper, or file unused. PR lists, diffs, or stack context prove that a later PR uses it.
- Do not skip when: This PR is outside a stack or the symbol is public API. Keep it when the supposed later use is unverified.
- Example signal: A comment says "Exported component is never used". The human reply says "used upstack".

### Temporary duplication during parallel implementation

- Confidence: `candidate`.
- Skip when: The PR deliberately duplicates a little code to keep a new path parallel to an old one. The old path is being deleted, replaced, or proven.
- Do not skip when: The duplicate changes security, billing, data access, or API behavior. Keep the finding when a lasting shared abstraction would clearly reduce risk.
- Example signal: A comment reports "Significant duplication" or "duplicated validation logic". The owner explains that the old path will be deleted or that the duplicate should remain local.

### Existing framework or component invariant covers the warning

- Confidence: `candidate`.
- Skip when: A shared component, framework contract, type invariant, or single source of truth already guarantees the disputed property. Verify that guarantee in the diff or nearby code.
- Do not skip when: The invariant is assumed without enforcement or depends on timing. Keep findings about asynchronous operations or state that can diverge.
- Example signal: The bot asks for max-height on an inner popover whose shared popover already enforces viewport bounds. Another example concerns nullable values whose checked and passed values share one source.

### Owner-declared follow-up or deferred cleanup

- Confidence: `candidate`.
- Skip when: The owner explicitly identifies a known follow-up. This PR must not worsen behavior, and the area must have low risk.
- Do not skip when: The agent acts without owner input or deferral would merge a new regression. Keep medium- or high-severity product-behavior findings.
- Example signal: The owner says "I'll worry about that later" or "we'll delete this eventually".

### Self-withdrawn or explicit false-positive rule comments

- Confidence: `recurring`.
- Skip when: The bot comment or a later bot reply explicitly withdraws the finding or calls it compliant or false-positive. Verify the relevant rule locally.
- Do not skip when: Only a human calls a high-risk issue false-positive without an explanation.
- Example signal: A comment about file naming says in its own body that the file already complies.

## Ask by default

Never skip these categories automatically because an earlier PR dismissed a similar finding.

- Security, privacy, auth, billing, data retention, training-data, and permission boundaries.
- High severity.
- Migrations, schemas, idempotency, concurrency, and behavior across systems.
- A small suggested fix that clearly reduces risk without changing product intent.

Historical human dismissals of security or data-flow findings remain owner decisions.
They do not establish a skip rule for the team.

## Candidate learnings from recent babysits

Add a candidate here during or after babysitting when it can help the team but still needs more evidence.
Promote it to a recurring candidate above after several PRs confirm the pattern.

### Manual reimplementations of native browser behavior

- Confidence: `candidate`.
- Skip when: Almost never. Logic findings have repeatedly proved valid when a change replaces native browser behavior with manual code. Examples replace native sticky behavior with JavaScript-positioned copies, or native scroll targeting with forwarded wheel and touch events. Another example replaces paint-order occlusion with masks or clipping paths. Apply this evidence to findings from any review bot.
- Do not skip when: The finding concerns gaps in forwarding wheel or touch events. Examples include wheel `deltaMode`, touch pans, edge scroll-chaining, and tap slop. Also keep findings about mask or clip hit-testing differences and observer timing races against React state. Default to fixing these findings.
- Example signal: "masks do not affect hit-testing", "overlay blocks wheel scroll", "ignores deltaMode", or "runs in the IntersectionObserver callback before React applies state".
- Source: One sticky-occlusion PR had 6 Bugbot passes upstream and about 18 findings. Every finding was fixed.

### Verify contract-test drift claims by running the test first

- Confidence: `candidate`.
- Skip when: Never skip the verification. It costs one command. A PR can include a test that pins protocol or documentation prose. Examples include a regex over `SKILL.md` or a snapshot of documentation wording. If a bot claims that the test and document differ, run the test on the PR tip before classifying. A red run confirms the claim. A green run supplies a concrete disproof for the dismissal reply.
- Do not skip when: This is a verification shortcut, not a dismissal pattern. A bias toward dismissal on later bot passes fails here. Earlier fix rounds can change the prose that the test pins.
- Example signal: A comment says "Contract test omits the pre-fix wait" after earlier commits changed the pinned passage. The test on the PR tip failed at that assertion.
- Source: One PR that pinned prose had 8 Bugbot passes upstream. The claim was real on pass 7 despite fixes and resolved threads on every earlier pass.

### Stale security-review finding already fixed later in the same PR

- Confidence: `candidate`.
- Skip when: A security review claims a missing authorization or validation call. The current tip must contain that exact gate and its tests. Those tests often come from a hardening commit made after the review.
- Do not skip when: The helper does nothing for the principal in question. Also keep findings when the check follows its guarded side effect. Keep the finding when that principal has no coverage.
- Example signal: A `HIGH` missing-authorization finding cites code whose current tip calls the exact guard before the side effect.
- Source: One webhook-endpoint PR added its hardening commit after the review ran.

### Widening a deliberately narrow error condition would mask the real error

- Confidence: `candidate`.
- Skip when: The request broadens a specific `errno`, error code, or status class to catch every failure. The narrow condition must encode a real distinction. For example, a dependency fallback can run only on `ENOENT`. A missing binary differs from a command that ran and failed. Retrying every nonzero exit would also retry not-found, expired-auth, and network failures. It would then report the fallback error and hide the original failure.
- Do not skip when: The condition misses a case in the same category. Examples include `EACCES` for an unusable binary and another transport failure. Also keep the finding when an unhandled path loses data or leaves partial state. Keep it when a retry is idempotent and still reports the original error.
- Example signal: "only retries when X fails with ENOENT … never tries the fallback even when a working Y exists". The fallback exists for a missing dependency rather than a failed command.
- Source: One CLI-rename PR used its fallback only for a missing binary, not for a failed command.
