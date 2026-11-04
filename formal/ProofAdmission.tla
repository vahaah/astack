------------------------ MODULE ProofAdmission ------------------------
EXTENDS Naturals, FiniteSets, Sequences

Stages == <<"schema", "domain", "category", "controls">>
Required == {Stages[i] : i \in 1..Len(Stages)}
States == {"validating", "modeled", "checked", "restored", "admitted", "rejected"}
PositiveResults == {"pending", "passed", "failed", "incomplete"}
NegativeResults == {"pending", "expected", "parse", "other", "none"}

AcceptedAuthority == [lifecycle |-> "accepted", optIn |-> FALSE,
                      history |-> TRUE, ancestor |-> TRUE, unchanged |-> TRUE,
                      processAccepted |-> TRUE, regular |-> TRUE,
                      decisions |-> TRUE, proofRecord |-> TRUE,
                      landingOptIn |-> FALSE, headerValid |-> TRUE,
                      outsideEqual |-> TRUE, processWholeEqual |-> TRUE]
ProposalAuthority == [AcceptedAuthority EXCEPT !.lifecycle = "proposed", !.optIn = TRUE]
LandingAuthority == [ProposalAuthority EXCEPT !.landingOptIn = TRUE, !.unchanged = FALSE]
AuthorityChecks == {"history", "ancestor", "unchanged", "processAccepted",
                    "regular", "decisions", "proofRecord", "processWholeEqual"}
LandingChecks == {"history", "ancestor", "processAccepted", "regular", "decisions",
                  "proofRecord", "headerValid", "outsideEqual", "processWholeEqual"}
AuthorityCases == {AcceptedAuthority, ProposalAuthority, LandingAuthority,
                   [LandingAuthority EXCEPT !.unchanged = TRUE]}
                  \cup {[ProposalAuthority EXCEPT ![key] = FALSE] : key \in AuthorityChecks}
                  \cup {[LandingAuthority EXCEPT ![key] = FALSE] : key \in LandingChecks}
                  \cup {[LandingAuthority EXCEPT !.unchanged = TRUE, !.headerValid = FALSE]}
                  \cup {[ProposalAuthority EXCEPT !.optIn = FALSE],
                        [ProposalAuthority EXCEPT !.lifecycle = "superseded"],
                        [AcceptedAuthority EXCEPT !.optIn = TRUE],
                        [AcceptedAuthority EXCEPT !.regular = FALSE],
                        [AcceptedAuthority EXCEPT !.decisions = FALSE],
                        [AcceptedAuthority EXCEPT !.proofRecord = FALSE]}
LandingAllowed(a) == ~a.landingOptIn \/ (a.headerValid /\ a.outsideEqual)
AuthorityEligible(a) == /\ a.regular
                       /\ a.decisions
                       /\ a.proofRecord
                       /\ ((a.lifecycle = "accepted" /\ ~a.optIn)
                           \/ (a.lifecycle = "proposed" /\ a.optIn
                               /\ a.history /\ a.ancestor
                               /\ (a.landingOptIn \/ a.unchanged)
                               /\ a.processAccepted /\ a.processWholeEqual))
AuthorityAllowed(a) == AuthorityEligible(a) /\ LandingAllowed(a)

VARIABLES stage, verified, positive, negative, restored, current, status, firstFailure, authority
vars == <<stage, verified, positive, negative, restored, current, status, firstFailure, authority>>

Init == /\ stage = 1
        /\ verified = {}
        /\ positive = "pending"
        /\ negative = "pending"
        /\ restored = "pending"
        /\ current = TRUE
        /\ status = "validating"
        /\ firstFailure = "none"
        /\ authority \in AuthorityCases

ValidationPass == /\ status = "validating"
                  /\ stage <= Len(Stages)
                  /\ (Stages[stage] # "domain" \/ AuthorityEligible(authority))
                  /\ (Stages[stage] # "domain" \/ LandingAllowed(authority))
                  /\ verified' = verified \cup {Stages[stage]}
                  /\ stage' = stage + 1
                  /\ UNCHANGED <<positive, negative, restored, current, status, firstFailure, authority>>

ValidationFail == /\ status = "validating"
                  /\ stage <= Len(Stages)
                  /\ firstFailure' = Stages[stage]
                  /\ status' = "rejected"
                  /\ UNCHANGED <<stage, verified, positive, negative, restored, current, authority>>

RunPositive == /\ status = "validating"
               /\ stage > Len(Stages)
               /\ positive' \in PositiveResults \ {"pending"}
               /\ status' = "modeled"
               /\ UNCHANGED <<stage, verified, negative, restored, current, firstFailure, authority>>

RejectPositive == /\ status = "modeled"
                  /\ positive # "passed"
                  /\ firstFailure' = "model"
                  /\ status' = "rejected"
                  /\ UNCHANGED <<stage, verified, positive, negative, restored, current, authority>>

RunNegative == /\ status = "modeled"
               /\ positive = "passed"
               /\ negative' \in NegativeResults \ {"pending"}
               /\ status' = "checked"
               /\ UNCHANGED <<stage, verified, positive, restored, current, firstFailure, authority>>

InputChange == /\ status \in {"modeled", "checked", "restored"}
               /\ current
               /\ current' = FALSE
               /\ UNCHANGED <<stage, verified, positive, negative, restored, status, firstFailure, authority>>

RunRestored == /\ status = "checked"
               /\ negative = "expected"
               /\ restored' \in PositiveResults \ {"pending"}
               /\ status' = "restored"
               /\ UNCHANGED <<stage, verified, positive, negative, current, firstFailure, authority>>

Admit == /\ status = "restored"
         /\ verified = Required
         /\ positive = "passed"
         /\ negative = "expected"
         /\ restored = "passed"
         /\ current
         /\ status' = "admitted"
         /\ UNCHANGED <<stage, verified, positive, negative, restored, current, firstFailure, authority>>

RejectEvidence == /\ status \in {"checked", "restored"}
                  /\ IF status = "checked"
                        THEN negative # "expected"
                        ELSE restored # "passed" \/ ~current
                  /\ firstFailure' = IF status = "checked" THEN "countermodel"
                                      ELSE IF restored # "passed" THEN "restore" ELSE "stale"
                  /\ status' = "rejected"
                  /\ UNCHANGED <<stage, verified, positive, negative, restored, current, authority>>

Finished == /\ status \in {"admitted", "rejected"}
            /\ UNCHANGED vars

Next == ValidationPass \/ ValidationFail \/ RunPositive \/ RejectPositive
        \/ RunNegative \/ RunRestored \/ InputChange \/ Admit \/ RejectEvidence \/ Finished
Spec == Init /\ [][Next]_vars /\ WF_vars(Next)

TypeOK == /\ stage \in 1..(Len(Stages) + 1)
          /\ authority \in AuthorityCases
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
RatifiedAuthority == status = "admitted" => AuthorityAllowed(authority)
StrictDefault == status = "admitted" /\ authority.optIn /\ ~authority.landingOptIn => authority.unchanged
LandingAuthoritySafe == status = "admitted" /\ authority.landingOptIn => authority.headerValid /\ authority.outsideEqual
ProcessAuthoritySafe == status = "admitted" /\ authority.optIn => authority.processWholeEqual
HistoryBound == status = "admitted" /\ authority.optIn => authority.history /\ authority.ancestor
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
