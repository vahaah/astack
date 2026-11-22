---------------------------- MODULE WordBudget ----------------------------
EXTENDS Naturals

Skills == {"a", "b"}
MaxWords == 2
StartCaps == [s \in Skills |-> 1]
StartTotal == 2
Verdicts == {"none", "pass", "fail"}

Total(f) == f["a"] + f["b"]
Min(x, y) == IF x < y THEN x ELSE y

VARIABLES counts, caps, totalCap, verdict
vars == <<counts, caps, totalCap, verdict>>

Init == /\ counts = StartCaps
        /\ caps = StartCaps
        /\ totalCap = StartTotal
        /\ verdict = "none"

Edit == /\ \E s \in Skills, n \in 0..MaxWords : counts' = [counts EXCEPT ![s] = n]
        /\ verdict' = "none"
        /\ UNCHANGED <<caps, totalCap>>

Check == /\ verdict = "none"
         /\ verdict' = IF /\ \A s \in Skills : counts[s] <= caps[s]
                          /\ Total(counts) <= totalCap
                         THEN "pass"
                         ELSE "fail"
         /\ UNCHANGED <<counts, caps, totalCap>>

Lower == /\ caps' = [s \in Skills |-> Min(counts[s], caps[s])]
         /\ totalCap' = Min(Total(counts), totalCap)
         /\ verdict' = "none"
         /\ UNCHANGED counts

Next == Edit \/ Check \/ Lower
Spec == Init /\ [][Next]_vars

TypeOK == /\ counts \in [Skills -> 0..MaxWords]
          /\ caps \in [Skills -> 0..MaxWords]
          /\ totalCap \in 0..(2 * MaxWords)
          /\ verdict \in Verdicts

PassWithinCaps == verdict = "pass" => /\ \A s \in Skills : counts[s] <= caps[s]
                                      /\ Total(counts) <= totalCap
FailNamesOverrun == verdict = "fail" => \/ \E s \in Skills : counts[s] > caps[s]
                                        \/ Total(counts) > totalCap
CapsNeverRise == /\ \A s \in Skills : caps[s] <= StartCaps[s]
                 /\ totalCap <= StartTotal
=============================================================================
