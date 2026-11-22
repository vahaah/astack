-------------------------- MODULE FixtureIsolation --------------------------
EXTENDS Naturals

Copies == {"c1", "c2"}
Repos == {"template"} \cup Copies
MaxCommits == 2
BuildSteps == 2
Builds == {"none", "building", "stopped", "built"}
Phases == {"none", "copied", "rewritten", "ready"}

VARIABLES build, step, final, phase, remote, originRefs, workRefs, indexClean, wroteBy
vars == <<build, step, final, phase, remote, originRefs, workRefs, indexClean, wroteBy>>
copyVars == <<phase, remote, originRefs, workRefs, indexClean, wroteBy>>

Init == /\ build = "none"
        /\ step = 0
        /\ final = FALSE
        /\ phase = [c \in Copies |-> "none"]
        /\ remote = [c \in Copies |-> c]
        /\ originRefs = [r \in Repos |-> 0]
        /\ workRefs = [r \in Repos |-> 0]
        /\ indexClean = [c \in Copies |-> FALSE]
        /\ wroteBy = [r \in Repos |-> {}]

StartBuild == /\ build \in {"none", "stopped"}
              /\ build' = "building"
              /\ step' = 0
              /\ UNCHANGED <<final>>
              /\ UNCHANGED copyVars

BuildStep == /\ build = "building"
             /\ step < BuildSteps
             /\ step' = step + 1
             /\ UNCHANGED <<build, final>>
             /\ UNCHANGED copyVars

StopBuild == /\ build = "building"
             /\ build' = "stopped"
             /\ UNCHANGED <<step, final>>
             /\ UNCHANGED copyVars

FinishBuild == /\ build = "building"
               /\ step = BuildSteps
               /\ build' = "built"
               /\ final' = TRUE
               /\ originRefs' = [originRefs EXCEPT !["template"] = 1]
               /\ workRefs' = [workRefs EXCEPT !["template"] = 1]
               /\ UNCHANGED <<step, phase, remote, indexClean, wroteBy>>

CopyTemplate(c) == /\ final
                   /\ phase[c] = "none"
                   /\ phase' = [phase EXCEPT ![c] = "copied"]
                   /\ remote' = [remote EXCEPT ![c] = "template"]
                   /\ originRefs' = [originRefs EXCEPT ![c] = originRefs["template"]]
                   /\ workRefs' = [workRefs EXCEPT ![c] = workRefs["template"]]
                   /\ indexClean' = [indexClean EXCEPT ![c] = FALSE]
                   /\ UNCHANGED <<build, step, final, wroteBy>>

RewriteConfig(c) == /\ phase[c] = "copied"
                    /\ phase' = [phase EXCEPT ![c] = "rewritten"]
                    /\ remote' = [remote EXCEPT ![c] = c]
                    /\ UNCHANGED <<build, step, final, originRefs, workRefs, indexClean, wroteBy>>

RefreshIndex(c) == /\ phase[c] = "rewritten"
                   /\ phase' = [phase EXCEPT ![c] = "ready"]
                   /\ indexClean' = [indexClean EXCEPT ![c] = TRUE]
                   /\ UNCHANGED <<build, step, final, remote, originRefs, workRefs, wroteBy>>

Commit(c) == /\ phase[c] = "ready"
             /\ workRefs[c] < MaxCommits
             /\ workRefs' = [workRefs EXCEPT ![c] = @ + 1]
             /\ wroteBy' = [wroteBy EXCEPT ![c] = @ \cup {c}]
             /\ UNCHANGED <<build, step, final, phase, remote, originRefs, indexClean>>

Push(c) == /\ phase[c] = "ready"
           /\ originRefs' = [originRefs EXCEPT ![remote[c]] = workRefs[c]]
           /\ wroteBy' = [wroteBy EXCEPT ![remote[c]] = @ \cup {c}]
           /\ UNCHANGED <<build, step, final, phase, remote, workRefs, indexClean>>

Next == \/ StartBuild
        \/ BuildStep
        \/ StopBuild
        \/ FinishBuild
        \/ \E c \in Copies : \/ CopyTemplate(c)
                             \/ RewriteConfig(c)
                             \/ RefreshIndex(c)
                             \/ Commit(c)
                             \/ Push(c)

Spec == Init /\ [][Next]_vars

TypeOK == /\ build \in Builds
          /\ step \in 0..BuildSteps
          /\ final \in BOOLEAN
          /\ phase \in [Copies -> Phases]
          /\ remote \in [Copies -> Repos]
          /\ originRefs \in [Repos -> 0..MaxCommits]
          /\ workRefs \in [Repos -> 0..MaxCommits]
          /\ indexClean \in [Copies -> BOOLEAN]
          /\ wroteBy \in [Repos -> SUBSET Copies]

TemplateUnchanged == /\ wroteBy["template"] = {}
                     /\ final => /\ originRefs["template"] = 1
                                 /\ workRefs["template"] = 1

CopiesDisjoint == \A c \in Copies : wroteBy[c] \subseteq {c}

CopyIndexClean == \A c \in Copies : phase[c] = "ready" => indexClean[c]

NoPartialTemplate == final => /\ build = "built"
                              /\ step = BuildSteps
=============================================================================
