# Lead Judgment Framework

Use the configured reviewers' findings to make a lead verdict.
Filter claims against the actual context and decide what needs action.

## Why This Step Matters

Adversarial reviewers can expose missed defects, but their limited context can also produce noise.
They saw only a code slice and one intent paragraph.
They may not know these facts:

- Earlier attempts and rejected options.
- Deadlines, dependencies and migration constraints outside the code.
- Temporary code versus permanent architecture.
- Work reserved for the next PR in a stack.

Use the full conversation context to judge those limits.

## Filtering Principles

### Nitpick Gravity

Reviewers may inflate minor preferences when they find no important defect.
If all findings are nits or style choices, say that the code is probably fine.

### Hypothetical vs. Actual

Trace the caller before accepting a concern about null input.
It is a finding only when that input can reach the code.
Dismiss it when earlier validation or types prevent the case.
Read the full call chain when a diff-only reviewer missed it.

### Premature Abstraction Warnings

Check whether the code must support a second form of change before accepting a proposed abstraction.
Without that need, extraction, interfaces or other abstractions can be premature.
Prefer simple inline code that meets the current scope to an unused abstraction.

### "I Would Have Done It Differently"

A different preference alone is neither a bug nor a design flaw.
Require a concrete problem with the current approach.
Otherwise dismiss the finding with its reason.

### Missing Context Signals

Look for claims that reveal missing context:

- Edits requested in code that the author did not change.
- Patterns flagged despite their consistent use in the repo.
- Recommendations that conflict with known constraints.

Dismiss these mistakes with a clear, respectful explanation.

## When Reviewers Are Right

Do not dismiss a finding merely because it challenges your work.
Give attention to these signals:

- Several models independently identify the same issue.
- A finding traces a concrete execution path.
- A finding exposes a gap in your understanding.
- After checking it, you agree with the evidence.

Examine security and correctness findings especially carefully, even from one model.

## Verdict Calibration

Make the verdict useful rather than exhaustive.
The user must be able to identify the fixes needed from "Act On".
More than 5 items often indicates insufficient filtering.

Keep "Dismissed" findings and their reasons visible.
That record lets the user challenge your judgment rather than lose rejected claims.
