# Sequence work into verifiable units

Do the work as a sequence of small units.
End each unit in a state that you can check.
Go to the next unit only when the current unit is green.

## Why

A break that you find in its own unit is cheap to locate.
A break that you find after a batch is under more work.

## Execution

In a sweep or a migration, examine each change before the next one.
Rebase on a clean trunk first, so each check uses the real baseline.

## Delivery

Put the commits in the order that proves the work.
Then a reviewer can watch each unit go red, then green.
`astack:coding-rules` gives the order for a fix.
Other orders are a removal before a reshape and a scaffold before a feature.

You skipped this principle when one check covers a batch.
