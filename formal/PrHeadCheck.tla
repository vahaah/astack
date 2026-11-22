---------------------------- MODULE PrHeadCheck ----------------------------
EXTENDS Naturals

GhAnswers == {"pr", "nopr", "error"}
Envs == {"ok", "noruntime", "badargs"}
Relations == {"equal", "descends", "behind", "diverged"}
Held == {"equal", "descends"}
Results == {"none", "ok", "no_pr", "stop", "stop_head", "note", "usage"}

VARIABLES gh, env, named, head, result, pulls, acted, noPr, stopped, decided
vars == <<gh, env, named, head, result, pulls, acted, noPr, stopped, decided>>

ResultOf(g, e) == IF e = "noruntime" THEN "note"
                  ELSE IF e = "badargs" THEN "usage"
                  ELSE IF g = "nopr" /\ ~named THEN "no_pr"
                  ELSE IF g # "pr" THEN "stop"
                  ELSE IF head \in Held THEN "ok"
                  ELSE "stop_head"

Init == /\ gh = "none"
        /\ env = "ok"
        /\ named \in BOOLEAN
        /\ head \in Relations
        /\ result = "none"
        /\ pulls = 0
        /\ acted = FALSE
        /\ noPr = FALSE
        /\ stopped = FALSE
        /\ decided = FALSE

Check == /\ ~decided
         /\ result = "none"
         /\ gh' \in GhAnswers
         /\ env' \in Envs
         /\ result' = ResultOf(gh', env')
         /\ UNCHANGED <<named, head, pulls, acted, noPr, stopped, decided>>

Decide == /\ ~decided
          /\ result # "none"
          /\ acted' = (result = "ok")
          /\ noPr' = (result = "no_pr")
          /\ stopped' = (result \notin {"ok", "no_pr"})
          /\ decided' = TRUE
          /\ UNCHANGED <<gh, env, named, head, result, pulls>>

Pull == /\ ~decided
        /\ result = "stop_head"
        /\ pulls = 0
        /\ head' = "equal"
        /\ pulls' = 1
        /\ result' = "none"
        /\ UNCHANGED <<gh, env, named, acted, noPr, stopped, decided>>

Done == /\ decided
        /\ UNCHANGED vars

Next == Check \/ Decide \/ Pull \/ Done
Spec == Init /\ [][Next]_vars

TypeOK == /\ gh \in GhAnswers \cup {"none"}
          /\ env \in Envs
          /\ named \in BOOLEAN
          /\ head \in Relations
          /\ result \in Results
          /\ pulls \in {0, 1}
          /\ acted \in BOOLEAN
          /\ noPr \in BOOLEAN
          /\ stopped \in BOOLEAN
          /\ decided \in BOOLEAN

ActOnlyOnHeldHead == acted => (gh = "pr" /\ env = "ok" /\ head \in Held)
NoPrOnlyOnMessage == noPr => (gh = "nopr" /\ env = "ok" /\ ~named)
OtherResultStops == (decided /\ result \notin {"ok", "no_pr"}) => (stopped /\ ~noPr)
=============================================================================
