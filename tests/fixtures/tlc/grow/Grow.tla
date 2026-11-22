---- MODULE Grow ----
EXTENDS Naturals
VARIABLE x
Init == x = 0
Step == x' = x + 1
Spec == Init /\ [][Step]_x
Small == x < 2
====
