---------------------------- MODULE WordBudget ----------------------------
EXTENDS Naturals

Skills == {"a", "b"}
Files == {"f"}
MaxWords == 2
StartCaps == [s \in Skills |-> 1]
StartLineCaps == [f \in Files |-> 1]
StartTotal == 2
Verdicts == {"none", "pass", "fail"}

Total(f) == f["a"] + f["b"]
Min(x, y) == IF x < y THEN x ELSE y

VARIABLES counts, caps, totalCap, lines, lineCaps, verdict
vars == <<counts, caps, totalCap, lines, lineCaps, verdict>>

Init == /\ counts = StartCaps
        /\ caps = StartCaps
        /\ totalCap = StartTotal
        /\ lines = StartLineCaps
        /\ lineCaps = StartLineCaps
        /\ verdict = "none"

Edit == /\ \/ /\ \E s \in Skills, n \in 0..MaxWords : counts' = [counts EXCEPT ![s] = n]
              /\ UNCHANGED lines
           \/ /\ \E f \in Files, n \in 0..MaxWords : lines' = [lines EXCEPT ![f] = n]
              /\ UNCHANGED counts
        /\ verdict' = "none"
        /\ UNCHANGED <<caps, totalCap, lineCaps>>

Check == /\ verdict = "none"
         /\ verdict' = IF /\ \A s \in Skills : counts[s] <= caps[s]
                          /\ Total(counts) <= totalCap
                          /\ \A f \in Files : lines[f] <= lineCaps[f]
                         THEN "pass"
                         ELSE "fail"
         /\ UNCHANGED <<counts, caps, totalCap, lines, lineCaps>>

Lower == /\ caps' = [s \in Skills |-> Min(counts[s], caps[s])]
         /\ totalCap' = Min(Total(counts), totalCap)
         /\ lineCaps' = [f \in Files |-> Min(lines[f], lineCaps[f])]
         /\ verdict' = "none"
         /\ UNCHANGED <<counts, lines>>

Next == Edit \/ Check \/ Lower
Spec == Init /\ [][Next]_vars

TypeOK == /\ counts \in [Skills -> 0..MaxWords]
          /\ caps \in [Skills -> 0..MaxWords]
          /\ totalCap \in 0..(2 * MaxWords)
          /\ lines \in [Files -> 0..MaxWords]
          /\ lineCaps \in [Files -> 0..MaxWords]
          /\ verdict \in Verdicts

PassWithinCaps == verdict = "pass" => /\ \A s \in Skills : counts[s] <= caps[s]
                                      /\ Total(counts) <= totalCap
                                      /\ \A f \in Files : lines[f] <= lineCaps[f]
FailNamesOverrun == verdict = "fail" => \/ \E s \in Skills : counts[s] > caps[s]
                                        \/ Total(counts) > totalCap
                                        \/ \E f \in Files : lines[f] > lineCaps[f]
CapsNeverRise == /\ \A s \in Skills : caps[s] <= StartCaps[s]
                 /\ totalCap <= StartTotal
                 /\ \A f \in Files : lineCaps[f] <= StartLineCaps[f]
=============================================================================
