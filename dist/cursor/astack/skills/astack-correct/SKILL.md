---
name: "astack-correct"
description: "Find repeated agent mistakes and prevent them. Try architecture, then types, then an actionable lint, then a test. Write docs last. Prove every check on a real past mistake. Repeat after an operator correction. Use for /astack-correct."
disable-model-invocation: true
---

# Correct

Find mistakes that agents repeat after the operator corrects them.
Change the repo so later agents cannot repeat those mistakes.

Assume an agent sees only opened files, copies nearby examples and takes the shortest path that compiles.
Make a locally correct change correct across the repo too.

## Find the mistake classes

Read recent commits, reverts, review comments, agent instructions and comments that explain workarounds.
Group the mistakes into classes.
A class qualifies after two occurrences.

## Fix each class at the highest level that works

1. Eliminate the mistake through architecture. Give state one owner and each task one supported way. Hide internals so invalid imports fail. Replace synchronized lists with one source. Delete obsolete ways and dead code that an agent could copy.
2. Prevent the invalid state through types. If bad code still compiles, add a lint or CI check. Its error names the correct file, type or function. For an existing widespread pattern, fail only when changes add more instances.
3. Test behavior. Fix or delete any test that passes when every called function returns nothing.
4. Write docs and agent rules last, only for judgment calls. They cannot fail when an agent ignores them.

## Fix and prove

Fix the most frequent classes now, with one commit for each class.
Prove each new check fails on a real past mistake.
Run the same command locally and in CI.
Put each exception on its offending line with a reason, expiry date and human approval.

## Keep the rule table

Keep a table in the agent instruction file that pairs each rule with its enforcement.
After an operator correction, fix the mistake and add its rule.
An existing rule without enforcement counts as a repeat.
Enforce it at the highest effective level in the same change.
Remove a rule once its mistake is impossible.

Report each class, its evidence, the chosen level, and why a higher level did not work.
