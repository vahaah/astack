-------------------------- MODULE RetryBudget --------------------------
EXTENDS Naturals
CONSTANT MaxAttempts
VARIABLES attempts, active
vars == <<attempts, active>>
Init == /\ attempts = 0
        /\ active = TRUE
Retry == /\ active
         /\ attempts < MaxAttempts
         /\ attempts' = attempts + 1
         /\ active' = (attempts' < MaxAttempts)
Finish == /\ active
          /\ active' = FALSE
          /\ UNCHANGED attempts
Stopped == /\ ~active
           /\ UNCHANGED vars
Next == Retry \/ Finish \/ Stopped
Spec == Init /\ [][Next]_vars /\ WF_vars(Next)
TypeOK == /\ attempts \in Nat
          /\ active \in BOOLEAN
Bounded == attempts <= MaxAttempts
EventuallyStops == <>~active
=============================================================================
