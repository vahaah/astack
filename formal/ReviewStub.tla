---------------------------- MODULE ReviewStub ----------------------------
VARIABLES plugin, tracked, comments, marker, kept, stub, looped, apply, check, markerProblem
vars == <<plugin, tracked, comments, marker, kept, stub, looped, apply, check, markerProblem>>

Unkept == marker /\ ~kept

Init == /\ plugin \in BOOLEAN
        /\ tracked \in BOOLEAN
        /\ comments \in BOOLEAN
        /\ marker \in BOOLEAN
        /\ kept \in BOOLEAN
        /\ stub = "idle"
        /\ looped = FALSE
        /\ apply = "idle"
        /\ check = "idle"
        /\ markerProblem = FALSE

RunStub == /\ stub = "idle"
           /\ stub' = IF plugin THEN "engine" ELSE "install"
           /\ looped' = plugin
           /\ UNCHANGED <<plugin, tracked, comments, marker, kept, apply, check, markerProblem>>

Apply == /\ apply = "idle"
         /\ IF comments \/ Unkept
               THEN /\ apply' = "refused"
                    /\ tracked' = tracked
               ELSE /\ apply' = "ok"
                    /\ tracked' = FALSE
         /\ UNCHANGED <<plugin, comments, marker, kept, stub, looped, check, markerProblem>>

Check == /\ check = "idle"
         /\ markerProblem' = Unkept
         /\ check' = IF Unkept THEN "fail" ELSE "pass"
         /\ UNCHANGED <<plugin, tracked, comments, marker, kept, stub, looped, apply>>

Done == /\ stub # "idle"
        /\ apply # "idle"
        /\ check # "idle"
        /\ UNCHANGED vars

Next == RunStub \/ Apply \/ Check \/ Done
Spec == Init /\ [][Next]_vars

TypeOK == /\ plugin \in BOOLEAN
          /\ tracked \in BOOLEAN
          /\ comments \in BOOLEAN
          /\ marker \in BOOLEAN
          /\ kept \in BOOLEAN
          /\ stub \in {"idle", "engine", "install"}
          /\ looped \in BOOLEAN
          /\ apply \in {"idle", "ok", "refused"}
          /\ check \in {"idle", "pass", "fail"}
          /\ markerProblem \in BOOLEAN

NoStepWithoutEngine == looped => stub = "engine"

InstallOnlyWhenAbsent == /\ stub = "install" => ~plugin
                         /\ (stub # "idle" /\ ~plugin) => stub = "install"

NoFallbackAfterUpdate == apply = "ok" => ~tracked

PreflightAcceptsApplied == check = "fail" => (Unkept /\ apply # "ok")

OneKeepList == check # "idle" => (markerProblem = Unkept)
=============================================================================
