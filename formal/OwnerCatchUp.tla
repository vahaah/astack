---------------------------- MODULE OwnerCatchUp ----------------------------
EXTENDS Naturals, FiniteSets

CONSTANT Items

FoldAt == 3
Kinds == {"none", "catch-up", "checkpoint"}
NoReply == [kind |-> "none", at |-> {}, listed |-> {}, count |-> 0, pointer |-> FALSE]

VARIABLES waiting, reply
vars == <<waiting, reply>>

Init == /\ waiting = {}
        /\ reply = NoReply

Raise == \E i \in Items \ waiting :
           /\ waiting' = waiting \cup {i}
           /\ UNCHANGED reply

Settle == \E i \in waiting :
            /\ waiting' = waiting \ {i}
            /\ UNCHANGED reply

CatchUp == /\ reply' = [kind |-> "catch-up", at |-> waiting,
                        listed |-> waiting,
                        count |-> Cardinality(waiting), pointer |-> FALSE]
           /\ UNCHANGED waiting

Checkpoint == /\ reply' = IF Cardinality(waiting) <= FoldAt
                          THEN [kind |-> "checkpoint", at |-> waiting,
                                listed |-> waiting,
                                count |-> Cardinality(waiting), pointer |-> FALSE]
                          ELSE [kind |-> "checkpoint", at |-> waiting,
                                listed |-> {},
                                count |-> Cardinality(waiting), pointer |-> TRUE]
              /\ UNCHANGED waiting

Next == Raise \/ Settle \/ CatchUp \/ Checkpoint
Spec == Init /\ [][Next]_vars

TypeOK == /\ waiting \subseteq Items
          /\ reply.kind \in Kinds
          /\ reply.at \subseteq Items
          /\ reply.listed \subseteq Items
          /\ reply.count \in 0..Cardinality(Items)
          /\ reply.pointer \in BOOLEAN

CatchUpListsEach == reply.kind = "catch-up" => reply.listed = reply.at

CheckpointHidesNothing ==
  reply.kind = "checkpoint" =>
    IF Cardinality(reply.at) <= FoldAt
    THEN reply.listed = reply.at
    ELSE /\ reply.count = Cardinality(reply.at)
         /\ reply.pointer
=============================================================================
