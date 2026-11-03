------------------------ MODULE ProofAdmission ------------------------
EXTENDS Naturals, FiniteSets, Sequences

Stages == <<"schema", "domain", "category", "controls">>
Required == {Stages[i] : i \in 1..Len(Stages)}
States == {"validating", "modeled", "checked", "restored", "admitted", "rejected"}
PositiveResults == {"pending", "passed", "failed", "incomplete"}
NegativeResults == {"pending", "expected", "parse", "other", "none"}

VARIABLES stage, verified, positive, negative, restored, current, status, firstFailure
vars == <<stage, verified, positive, negative, restored, current, status, firstFailure>>

Init == /\ stage = 1
        /\ verified = {}
        /\ positive = "pending"
        /\ negative = "pending"
        /\ restored = "pending"
        /\ current = TRUE
        /\ status = "validating"
        /\ firstFailure = "none"

ValidationPass == /\ status = "validating"
                  /\ stage <= Len(Stages)
                  /\ verified' = verified \cup {Stages[stage]}
                  /\ stage' = stage + 1
                  /\ UNCHANGED <<positive, negative, restored, current, status, firstFailure>>

ValidationFail == /\ status = "validating"
                  /\ stage <= Len(Stages)
                  /\ firstFailure' = Stages[stage]
                  /\ status' = "rejected"
                  /\ UNCHANGED <<stage, verified, positive, negative, restored, current>>

RunPositive == /\ status = "validating"
               /\ stage > Len(Stages)
               /\ positive' \in PositiveResults \ {"pending"}
               /\ status' = "modeled"
               /\ UNCHANGED <<stage, verified, negative, restored, current, firstFailure>>

RejectPositive == /\ status = "modeled"
                  /\ positive # "passed"
                  /\ firstFailure' = "model"
                  /\ status' = "rejected"
                  /\ UNCHANGED <<stage, verified, positive, negative, restored, current>>

RunNegative == /\ status = "modeled"
               /\ positive = "passed"
               /\ negative' \in NegativeResults \ {"pending"}
               /\ status' = "checked"
               /\ UNCHANGED <<stage, verified, positive, restored, current, firstFailure>>

InputChange == /\ status \in {"modeled", "checked", "restored"}
               /\ current
               /\ current' = FALSE
               /\ UNCHANGED <<stage, verified, positive, negative, restored, status, firstFailure>>

RunRestored == /\ status = "checked"
               /\ negative = "expected"
               /\ restored' \in PositiveResults \ {"pending"}
               /\ status' = "restored"
               /\ UNCHANGED <<stage, verified, positive, negative, current, firstFailure>>

Admit == /\ status = "restored"
         /\ verified = Required
         /\ positive = "passed"
         /\ negative = "expected"
         /\ restored = "passed"
         /\ current
         /\ status' = "admitted"
         /\ UNCHANGED <<stage, verified, positive, negative, restored, current, firstFailure>>

RejectEvidence == /\ status \in {"checked", "restored"}
                  /\ IF status = "checked"
                        THEN negative # "expected"
                        ELSE restored # "passed" \/ ~current
                  /\ firstFailure' = IF status = "checked" THEN "countermodel"
                                      ELSE IF restored # "passed" THEN "restore" ELSE "stale"
                  /\ status' = "rejected"
                  /\ UNCHANGED <<stage, verified, positive, negative, restored, current>>

Finished == /\ status \in {"admitted", "rejected"}
            /\ UNCHANGED vars

Next == ValidationPass \/ ValidationFail \/ RunPositive \/ RejectPositive
        \/ RunNegative \/ RunRestored \/ InputChange \/ Admit \/ RejectEvidence \/ Finished
Spec == Init /\ [][Next]_vars /\ WF_vars(Next)

TypeOK == /\ stage \in 1..(Len(Stages) + 1)
          /\ verified \subseteq Required
          /\ positive \in PositiveResults
          /\ negative \in NegativeResults
          /\ restored \in PositiveResults
          /\ current \in BOOLEAN
          /\ status \in States
          /\ firstFailure \in {"none", "model", "countermodel", "restore", "stale"} \cup Required

AdmitSafe == status = "admitted" =>
            /\ verified = Required
            /\ positive = "passed"
            /\ negative = "expected"
            /\ restored = "passed"
            /\ current = TRUE

FailureIsTerminal == firstFailure # "none" => status = "rejected"
EventuallyTerminal == <> (status \in {"admitted", "rejected"})

Values == {0, 1}
Errors == {"invalid", "missing"}
Ok(value) == [kind |-> "ok", item |-> value]
Err(error) == [kind |-> "error", reason |-> error]
Results == {Ok(value) : value \in Values} \cup {Err(error) : error \in Errors}
Functions == [Values -> Results]
Unit == [value \in Values |-> Ok(value)]
Bind(result, fn) == IF result.kind = "error" THEN result ELSE fn[result.item]
Compose(left, right) == [value \in Values |-> Bind(left[value], right)]

ResultLeftIdentity == /\ status \in States
                      /\ \A value \in Values, fn \in Functions : Bind(Ok(value), fn) = fn[value]
ResultRightIdentity == /\ status \in States
                       /\ \A result \in Results : Bind(result, Unit) = result
ResultAssociativity == /\ status \in States
                       /\ \A result \in Results, left \in Functions, right \in Functions :
                            Bind(Bind(result, left), right) = Bind(result, Compose(left, right))
=============================================================================
