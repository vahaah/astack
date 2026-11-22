---------------------------- MODULE SourceScan ----------------------------
EXTENDS Naturals, Sequences

MaxLen == 4
Kinds == {"name", "word", "opkw", "dot", "slash", "close", "comment"}
Words == {"name", "word", "opkw"}
Lasts == {"none", "name", "word", "opkw", "dot", "div", "regex", "close"}
Positions == 1..MaxLen
Inputs == UNION {[1..n -> Kinds] : n \in 0..MaxLen}
NoCtx == [before |-> "none", last |-> "none"]
Incomplete == [comments |-> {}, complete |-> FALSE]

VARIABLES input, i, last, before, reading, ctx, found, phase, failed, out
vars == <<input, i, last, before, reading, ctx, found, phase, failed, out>>

ClosesAt(k) == {j \in (k + 1)..Len(input) : input[j] \in {"slash", "comment"}}
RegexEnd(k) == CHOOSE j \in ClosesAt(k) : \A m \in ClosesAt(k) : j <= m

Init == /\ input \in Inputs
        /\ i = 1
        /\ last = "none"
        /\ before = "none"
        /\ reading = [k \in Positions |-> "none"]
        /\ ctx = [k \in Positions |-> NoCtx]
        /\ found = {}
        /\ phase = "scan"
        /\ failed = FALSE
        /\ out = Incomplete

Step == /\ phase = "scan"
        /\ ~failed
        /\ i <= Len(input)
        /\ LET t == input[i]
               value == \/ last \in {"name", "word", "close", "regex"}
                        \/ (before = "dot" /\ last \in Words)
           IN CASE t = "comment" ->
                     /\ found' = found \cup {i}
                     /\ i' = i + 1
                     /\ UNCHANGED <<last, before, reading, ctx>>
                [] t = "slash" ->
                     /\ ctx' = [ctx EXCEPT ![i] = [before |-> before, last |-> last]]
                     /\ before' = last
                     /\ IF ~value /\ ClosesAt(i) # {}
                           THEN /\ reading' = [reading EXCEPT ![i] = "regex"]
                                /\ last' = "regex"
                                /\ i' = RegexEnd(i) + 1
                           ELSE /\ reading' = [reading EXCEPT ![i] = "div"]
                                /\ last' = "div"
                                /\ i' = i + 1
                     /\ UNCHANGED found
                [] OTHER ->
                     /\ before' = last
                     /\ last' = t
                     /\ i' = i + 1
                     /\ UNCHANGED <<reading, ctx, found>>
        /\ UNCHANGED <<input, phase, failed, out>>

Fail == /\ phase = "scan"
        /\ ~failed
        /\ i <= Len(input)
        /\ failed' = TRUE
        /\ UNCHANGED <<input, i, last, before, reading, ctx, found, phase, out>>

Finish == /\ phase = "scan"
          /\ failed \/ i > Len(input)
          /\ out' = IF failed THEN Incomplete ELSE [comments |-> found, complete |-> TRUE]
          /\ phase' = "finished"
          /\ UNCHANGED <<input, i, last, before, reading, ctx, found, failed>>

Done == /\ phase = "finished"
        /\ UNCHANGED vars

Next == Step \/ Fail \/ Finish \/ Done
Spec == Init /\ [][Next]_vars

TypeOK == /\ input \in Seq(Kinds)
          /\ Len(input) <= MaxLen
          /\ i \in 1..(MaxLen + 1)
          /\ last \in Lasts
          /\ before \in Lasts
          /\ reading \in [Positions -> {"none", "div", "regex"}]
          /\ ctx \in [Positions -> [before : Lasts, last : Lasts]]
          /\ found \subseteq Positions
          /\ phase \in {"scan", "finished"}
          /\ failed \in BOOLEAN
          /\ out \in [comments : SUBSET Positions, complete : BOOLEAN]

Read(k) == reading[k] # "none"

MemberNameIsValue == \A k \in Positions :
    (Read(k) /\ ctx[k].before = "dot" /\ ctx[k].last \in Words) => reading[k] = "div"

NameWordIsValue == \A k \in Positions :
    (Read(k) /\ ctx[k].last = "word") => reading[k] = "div"

NoCommentInRegex == \A k \in Positions :
    (Read(k) /\ ctx[k].last = "opkw" /\ ctx[k].before # "dot" /\ ClosesAt(k) # {})
        => \A c \in found : c <= k \/ c > RegexEnd(k)

FailedScanIsIncomplete == (failed /\ phase = "finished") => out = Incomplete
=============================================================================
