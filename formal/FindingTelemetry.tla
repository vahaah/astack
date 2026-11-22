-------------------------- MODULE FindingTelemetry --------------------------
EXTENDS Naturals, FiniteSets, Sequences

Runs == {1, 2}
Rules == {"contraction", "word-broad", "noun-cluster"}
Tier == [r \in Rules |->
           IF r = "contraction" THEN "deny"
           ELSE IF r = "word-broad" THEN "advise"
           ELSE "quiet"]
EventKeys == {"time", "turn", "release", "pid", "handler", "check", "event",
              "surface", "rule", "outcome", "fingerprint"}
Phases == {"idle", "logging", "done"}
Verdicts == {"none", "allow", "note", "deny"}
Outcomes == {"deny", "advise", "quiet", "masked"}

Judged(found) ==
  IF \E r \in found : Tier[r] = "deny" THEN "deny"
  ELSE IF \E r \in found : Tier[r] = "advise" THEN "note"
  ELSE "allow"

VARIABLES found, refresh, broken, phase, verdict, result, pending, log
vars == <<found, refresh, broken, phase, verdict, result, pending, log>>

Outcome(p, r) ==
  IF Tier[r] = "deny" THEN "deny"
  ELSE IF Tier[r] = "quiet" THEN "quiet"
  ELSE IF verdict[p] = "deny" THEN "masked"
  ELSE "advise"

Line(p, r) ==
  [time |-> 0, turn |-> 0, release |-> "release", pid |-> p,
   handler |-> "ste-artifact", check |-> "ste", event |-> "write",
   surface |-> "doc", rule |-> r, outcome |-> Outcome(p, r),
   fingerprint |-> r]

Init == /\ found \in [Runs -> SUBSET Rules]
        /\ refresh \in [Runs -> BOOLEAN]
        /\ broken \in BOOLEAN
        /\ phase = [p \in Runs |-> "idle"]
        /\ verdict = [p \in Runs |-> "none"]
        /\ result = [p \in Runs |-> "none"]
        /\ pending = [p \in Runs |-> {}]
        /\ log = <<>>

Judge(p) == /\ phase[p] = "idle"
            /\ verdict' = [verdict EXCEPT ![p] = Judged(found[p])]
            /\ pending' = [pending EXCEPT ![p] = IF refresh[p] THEN {} ELSE found[p]]
            /\ phase' = [phase EXCEPT ![p] = "logging"]
            /\ UNCHANGED <<found, refresh, broken, result, log>>

Write(p) == /\ phase[p] = "logging"
            /\ \E r \in pending[p] :
                 /\ log' = IF broken THEN log ELSE Append(log, Line(p, r))
                 /\ pending' = [pending EXCEPT ![p] = @ \ {r}]
            /\ verdict' = verdict
            /\ UNCHANGED <<found, refresh, broken, phase, result>>

Return(p) == /\ phase[p] = "logging"
             /\ pending[p] = {}
             /\ result' = [result EXCEPT ![p] = verdict[p]]
             /\ phase' = [phase EXCEPT ![p] = "done"]
             /\ UNCHANGED <<found, refresh, broken, verdict, pending, log>>

Finished == /\ \A p \in Runs : phase[p] = "done"
            /\ UNCHANGED vars

Next == (\E p \in Runs : Judge(p) \/ Write(p) \/ Return(p)) \/ Finished
Spec == Init /\ [][Next]_vars

TypeOK == /\ found \in [Runs -> SUBSET Rules]
          /\ refresh \in [Runs -> BOOLEAN]
          /\ broken \in BOOLEAN
          /\ phase \in [Runs -> Phases]
          /\ verdict \in [Runs -> Verdicts]
          /\ result \in [Runs -> Verdicts]
          /\ pending \in [Runs -> SUBSET Rules]
          /\ Len(log) <= Cardinality(Runs) * Cardinality(Rules)

LogNeverChangesVerdict ==
  \A p \in Runs :
    /\ phase[p] # "idle" => verdict[p] = Judged(found[p])
    /\ phase[p] = "done" => result[p] = Judged(found[p])

NoTextInEvent ==
  \A i \in 1..Len(log) : DOMAIN log[i] = EventKeys

RefreshWritesNothing ==
  \A i \in 1..Len(log) : ~refresh[log[i].pid]

OneLinePerFinding ==
  \A p \in Runs :
    /\ \A i \in 1..Len(log) : log[i].pid = p => log[i].rule \in found[p]
    /\ \A r \in Rules :
         Cardinality({i \in 1..Len(log) : log[i].pid = p /\ log[i].rule = r}) <= 1
    /\ (phase[p] = "done" /\ ~refresh[p] /\ ~broken) =>
         \A r \in found[p] :
           Cardinality({i \in 1..Len(log) : log[i].pid = p /\ log[i].rule = r}) = 1

MaskedOnlyUnderDeny ==
  \A i \in 1..Len(log) :
    /\ log[i].outcome \in Outcomes
    /\ log[i].outcome = "masked" => verdict[log[i].pid] = "deny"
=============================================================================
