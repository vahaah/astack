---- MODULE M ----
EXTENDS Naturals
VARIABLE x
Next == 1+q
Init == x = 0
Spec == Init /\ [][x' = Next]_x
====
