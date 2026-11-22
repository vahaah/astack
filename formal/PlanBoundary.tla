---------------------------- MODULE PlanBoundary ----------------------------
EXTENDS Naturals

LastSession == 3
Sessions == 1..LastSession
Rows == {"d1", "d2"}
Headings == {"none", "titled", "fenced", "untitled"}
RowStates == {"live", "graduated"}

Resolves(h) == h = "titled"

VARIABLES merged, branch, boundaries, plan, rows, heading
vars == <<merged, branch, boundaries, plan, rows, heading>>

Init == /\ merged = 0
        /\ branch = TRUE
        /\ boundaries = [s \in Sessions |-> 0]
        /\ plan = TRUE
        /\ rows = [r \in Rows |-> "live"]
        /\ heading = [r \in Rows |-> "none"]

Merge == /\ merged < LastSession
         /\ branch
         /\ merged' = merged + 1
         /\ branch' = FALSE
         /\ plan' = (merged + 1 < LastSession)
         /\ UNCHANGED <<boundaries, rows, heading>>

Boundary == /\ merged \in 1..(LastSession - 1)
            /\ ~branch
            /\ boundaries' = [boundaries EXCEPT ![merged] = @ + 1]
            /\ branch' = TRUE
            /\ UNCHANGED <<merged, plan, rows, heading>>

Resume == /\ merged \in 1..(LastSession - 1)
          /\ branch
          /\ UNCHANGED vars

WriteAdr == \E r \in Rows, h \in Headings \ {"none"} :
              /\ heading[r] = "none"
              /\ heading' = [heading EXCEPT ![r] = h]
              /\ UNCHANGED <<merged, branch, boundaries, plan, rows>>

Graduate == \E r \in Rows :
              /\ plan
              /\ rows[r] = "live"
              /\ Resolves(heading[r])
              /\ rows' = [rows EXCEPT ![r] = "graduated"]
              /\ UNCHANGED <<merged, branch, boundaries, plan, heading>>

Done == /\ merged = LastSession
        /\ UNCHANGED vars

Next == Merge \/ Boundary \/ Resume \/ WriteAdr \/ Graduate \/ Done
Spec == Init /\ [][Next]_vars

TypeOK == /\ merged \in 0..LastSession
          /\ branch \in BOOLEAN
          /\ boundaries \in [Sessions -> 0..2]
          /\ plan \in BOOLEAN
          /\ rows \in [Rows -> RowStates]
          /\ heading \in [Rows -> Headings]

OneBoundaryPerMerge == \A s \in Sessions : boundaries[s] <= 1
NoBoundaryAfterLast == boundaries[LastSession] = 0
EachMergeCarriesItsBoundary ==
  \A s \in 2..LastSession : s <= merged => boundaries[s - 1] = 1
RowLeavesWithAuthority ==
  \A r \in Rows : rows[r] = "graduated" => Resolves(heading[r])
LastPrDeletesPlan == merged = LastSession => ~plan
=============================================================================
