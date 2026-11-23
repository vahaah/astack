------------------------ MODULE CiProofRecords ------------------------
EXTENDS Naturals, FiniteSets

Checks == {"schema", "base", "regular", "utf8", "sections", "roles", "path", "manifest"}
RecordOK == [check \in Checks |-> TRUE]
RecordCases == {RecordOK} \cup {[RecordOK EXCEPT ![check] = FALSE] : check \in Checks}
Kinds == {"ci", "ci-records", "ci-source", "ci-model"}
Inputs == [kind : Kinds, records : RecordCases, tools : BOOLEAN,
           movedBase : BOOLEAN, proofValid : BOOLEAN,
           gateRed : BOOLEAN, readBack : BOOLEAN]
RecordAllowed(record) == \A check \in Checks : record[check]
Eligible(candidate) == /\ candidate.tools
                       /\ ~candidate.movedBase
                       /\ candidate.kind \in {"ci", "ci-records"}
                       /\ (candidate.kind = "ci" \/ RecordAllowed(candidate.records))
Mixed(candidate) == /\ candidate.tools
                    /\ ~candidate.movedBase
                    /\ ~Eligible(candidate)

VARIABLES input, mode, status
vars == <<input, mode, status>>

Init == /\ input \in Inputs
        /\ mode = "pending"
        /\ status = "pending"

Classify == /\ mode = "pending"
            /\ input.tools
            /\ ~input.movedBase
            /\ input.kind \in {"ci", "ci-records"}
            /\ (input.kind = "ci" \/ RecordAllowed(input.records))
            /\ mode' = "ci_proof"
            /\ UNCHANGED <<input, status>>

ClassifyMixed == /\ mode = "pending"
                 /\ Mixed(input)
                 /\ mode' = "ci_mixed"
                 /\ UNCHANGED <<input, status>>

RejectClassification == /\ mode = "pending"
                        /\ ~Eligible(input)
                        /\ ~Mixed(input)
                        /\ mode' = "blocked"
                        /\ status' = "blocked"
                        /\ UNCHANGED input

CheckProof == /\ mode = "ci_proof"
              /\ status = "pending"
              /\ status' = IF input.proofValid THEN "delivery" ELSE "blocked"
              /\ UNCHANGED <<input, mode>>

CheckMixed == /\ mode = "ci_mixed"
              /\ status = "pending"
              /\ status' = IF input.proofValid /\ ~input.gateRed /\ input.readBack
                           THEN "delivery" ELSE "blocked"
              /\ UNCHANGED <<input, mode>>

Finished == /\ status \in {"delivery", "blocked"}
            /\ UNCHANGED vars

Next == Classify \/ ClassifyMixed \/ RejectClassification \/ CheckProof
        \/ CheckMixed \/ Finished
Spec == Init /\ [][Next]_vars

TypeOK == /\ input \in Inputs
          /\ mode \in {"pending", "ci_proof", "ci_mixed", "blocked"}
          /\ status \in {"pending", "delivery", "blocked"}
CiRecordsSafe == mode = "ci_proof" => Eligible(input)
CurrentProofRequired == status = "delivery" => input.proofValid
MixedKeepsGates == (mode = "ci_mixed" /\ status = "delivery")
                   => ~input.gateRed /\ input.readBack
=============================================================================
