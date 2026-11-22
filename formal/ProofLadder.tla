---------------------------- MODULE ProofLadder ----------------------------
EXTENDS Naturals, FiniteSets

Models == {"m1", "m2"}
Manifest == "m1"
PathKinds == {"contract", "other", "unmodelled", "failGap", "cover1", "cover2", "registry"}
Covers == [m1 |-> "cover1", m2 |-> "cover2"]
Floors == {0, 1, 4}
TlcRung == 4
Results == {"none", "pending", "pass", "fail"}
LawKinds == {"none", "propRead", "prop", "tla"}

Rank(kind) == IF kind = "contract" THEN 0
              ELSE IF kind \in {"other", "unmodelled"} THEN 1
              ELSE TlcRung
Max(set) == CHOOSE x \in set : \A y \in set : y <= x

VARIABLES changed, base, tree, treeModels, baseModels, baseFloor, treeFloor,
          law, status, rung, needed, triples, result
fixed == <<changed, base, tree, treeModels, baseModels, baseFloor, treeFloor,
           law>>
vars == <<changed, base, tree, treeModels, baseModels, baseFloor, treeFloor,
          law, status, rung, needed, triples, result>>

Lost == base /\ ~tree
Legacy == ~base /\ ~tree
Edited == "registry" \in changed \/ (tree /\ ~base) \/ baseModels # treeModels
PathRung == Max({0} \cup {Rank(kind) : kind \in changed \ {"failGap"}}
                \cup (IF Edited THEN {TlcRung} ELSE {}))
LawRung == IF law = "tla" THEN TlcRung
           ELSE IF law = "prop" THEN 3
           ELSE IF law = "propRead" THEN 2
           ELSE 0
Rung == IF Legacy THEN TlcRung
        ELSE Max({PathRung, LawRung, baseFloor, treeFloor})
Selected == IF Legacy THEN {Manifest}
            ELSE {Manifest}
                 \cup {m \in Models : Covers[m] \in changed}
                 \cup (IF Edited THEN treeModels \cup baseModels ELSE {})
                 \cup (IF law = "tla" THEN {"m2"} ELSE {})

Diffs == {set \in SUBSET PathKinds : set # {} /\ Cardinality(set) <= 2}
Consistent == /\ ~tree => changed \subseteq {"contract", "other"}
              /\ "cover2" \in changed => "m2" \in treeModels
              /\ law = "tla" => "m2" \in treeModels

Init == /\ base \in BOOLEAN
        /\ tree \in BOOLEAN
        /\ treeModels \in IF tree THEN {{Manifest}, Models} ELSE {{}}
        /\ baseModels \in IF base THEN SUBSET Models ELSE {{}}
        /\ changed \in Diffs
        /\ law \in LawKinds
        /\ Consistent
        /\ baseFloor \in Floors
        /\ treeFloor \in Floors
        /\ status = "start"
        /\ rung = 0
        /\ needed = {}
        /\ triples = [m \in Models |-> 0]
        /\ result = [m \in Models |-> "none"]

DeriveStop == /\ status = "start"
              /\ ("failGap" \in changed \/ Lost)
              /\ status' = "stopped"
              /\ UNCHANGED <<fixed, rung, needed, triples, result>>

Derive == /\ status = "start"
          /\ "failGap" \notin changed
          /\ ~Lost
          /\ rung' = Rung
          /\ needed' = IF Rung = TlcRung THEN Selected ELSE {}
          /\ status' = "derived"
          /\ UNCHANGED <<fixed, triples, result>>

CanStart(m) == triples[m] = 0 /\ (m = Manifest \/ result[Manifest] = "pass")

Start == \E m \in needed :
           /\ status = "derived"
           /\ \A other \in Models : result[other] # "pending"
           /\ CanStart(m)
           /\ triples' = [triples EXCEPT ![m] = @ + 1]
           /\ result' = [result EXCEPT ![m] = "pending"]
           /\ UNCHANGED <<fixed, status, rung, needed>>

Judge == \E m \in Models, outcome \in {"pass", "fail"} :
           /\ result[m] = "pending"
           /\ result' = [result EXCEPT ![m] = outcome]
           /\ status' = IF outcome = "fail" THEN "stopped" ELSE status
           /\ UNCHANGED <<fixed, rung, needed, triples>>

Admit == /\ status = "derived"
         /\ \A m \in needed : result[m] = "pass"
         /\ status' = "admitted"
         /\ UNCHANGED <<fixed, rung, needed, triples, result>>

Done == /\ status \in {"admitted", "stopped"}
        /\ UNCHANGED vars

Next == DeriveStop \/ Derive \/ Start \/ Judge \/ Admit \/ Done
Spec == Init /\ [][Next]_vars

TypeOK == /\ changed \in Diffs
          /\ base \in BOOLEAN
          /\ tree \in BOOLEAN
          /\ treeModels \subseteq Models
          /\ baseModels \subseteq Models
          /\ baseFloor \in Floors
          /\ treeFloor \in Floors
          /\ law \in LawKinds
          /\ status \in {"start", "derived", "admitted", "stopped"}
          /\ rung \in 0..TlcRung
          /\ needed \subseteq Models
          /\ triples \in [Models -> Nat]
          /\ result \in [Models -> Results]

TlcOnlyAtR4 == \A m \in Models : triples[m] > 0 => rung = TlcRung
AdmitNeedsEachTriple == status = "admitted" /\ Rung = TlcRung =>
                          \A m \in Selected : triples[m] = 1 /\ result[m] = "pass"
FailClosedStops == "failGap" \in changed => status \in {"start", "stopped"}
FloorOnlyRaises == status \in {"derived", "admitted"} /\ ~Legacy =>
                     /\ rung >= PathRung
                     /\ rung >= LawRung
                     /\ rung >= baseFloor
                     /\ rung >= treeFloor
                     /\ rung \in {PathRung, LawRung, baseFloor, treeFloor}
OneTriplePerModel == \A m \in Models : triples[m] <= 1
ManifestFirst == \A m \in Models \ {Manifest} :
                   triples[m] > 0 => result[Manifest] = "pass"
RegistryRunsAll == status = "admitted" /\ Edited =>
                     \A m \in treeModels \cup baseModels : result[m] = "pass"
DeletedRegistryStops == Lost => status \in {"start", "stopped"}
TlaLawSelects == status \in {"derived", "admitted"} /\ law = "tla" =>
                   "m2" \in needed
=============================================================================
