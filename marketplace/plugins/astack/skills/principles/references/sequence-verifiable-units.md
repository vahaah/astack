# Sequence work into verifiable units

Order work as a sequence of small units.
End each unit in a state that you can check.
Advance only when the current unit is green.

## Why

A break caught in the unit that caused it is cheap to locate.
A break caught after a batch is buried under more work on a broken base.
A reviewer can replay the same units to verify the delivery.
The sequence turns "trust me" into "watch it go red, then green."

## Execution

In a sweep, migration, or run of similar edits, verify each change before you start the next one.
Each unit starts from a known good state, makes one change, and runs the check before it proceeds.
Rebase onto clean trunk first so every check uses the real baseline.
Run the check even when a lever makes the edits and the check is almost free.

## Delivery

Stack commits and PRs in the order that proves the work.
For a fix, run the failing check before you make the fix.
Record its output.
Commit the failing check together with the fix, so every commit is green.
The PR's Verification shows the failing run first, then the passing run.
Other story orders include subtraction before a reshape, baseline capture before treatment, and a scaffold before a feature.
Each commit lands on its own, and the sequence reads as an argument.

[Prove It Works](prove-it-works.md) keeps each check real.
[Build the Lever](build-the-lever.md) makes the check of each unit cheap.
This principle adds the sequence between units.
