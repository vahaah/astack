------------------------ MODULE CiProofRecords ------------------------
EXTENDS Naturals, FiniteSets

Checks == {"schema", "base", "regular", "utf8", "sections", "roles", "path"}
RecordOK == [check \in Checks |-> TRUE]
RecordCases == {RecordOK} \cup {[RecordOK EXCEPT ![check] = FALSE] : check \in Checks}
Kinds == {"ci", "ci-records", "ci-source", "ci-model"}
Inputs == [kind : Kinds, records : RecordCases, tools : BOOLEAN,
           movedBase : BOOLEAN, proofValid : BOOLEAN]
RecordAllowed(record) == \A check \in Checks : record[check]
Eligible(candidate) == /\ candidate.tools
                       /\ ~candidate.movedBase
                       /\ candidate.kind \in {"ci", "ci-records"}
                       /\ (candidate.kind = "ci" \/ RecordAllowed(candidate.records))

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

RejectClassification == /\ mode = "pending"
                        /\ ~Eligible(input)
                        /\ mode' = "blocked"
                        /\ status' = "blocked"
                        /\ UNCHANGED input

CheckProof == /\ mode = "ci_proof"
              /\ status = "pending"
              /\ status' = IF input.proofValid THEN "delivery" ELSE "blocked"
              /\ UNCHANGED <<input, mode>>

Finished == /\ status \in {"delivery", "blocked"}
            /\ UNCHANGED vars

Next == Classify \/ RejectClassification \/ CheckProof \/ Finished
Spec == Init /\ [][Next]_vars

TypeOK == /\ input \in Inputs
          /\ mode \in {"pending", "ci_proof", "blocked"}
          /\ status \in {"pending", "delivery", "blocked"}
CiRecordsSafe == mode = "ci_proof" => Eligible(input)
CurrentProofRequired == status = "delivery" => input.proofValid
=============================================================================
