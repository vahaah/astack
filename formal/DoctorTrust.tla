---------------------------- MODULE DoctorTrust ----------------------------
EXTENDS Naturals

MaxRelease == 3
HookHash == "h"
Reads == {"none", "listed", "failed"}
Reports == {"none", "ok", "warn", "fail"}
Statuses == {"trusted", "managed", "modified", "untrusted"}

VARIABLES release, trustedHash, trustedContent, enabled, managed, read, report
vars == <<release, trustedHash, trustedContent, enabled, managed, read, report>>

CodexStatus == IF managed THEN "managed"
               ELSE IF trustedHash = "none" THEN "untrusted"
               ELSE IF trustedHash = HookHash /\ trustedContent = release
                    THEN "trusted"
                    ELSE "modified"

Runs == enabled /\ CodexStatus \in {"trusted", "managed"}

Init == /\ release = 1
        /\ trustedHash = HookHash
        /\ trustedContent = 1
        /\ enabled = TRUE
        /\ managed \in BOOLEAN
        /\ read = "none"
        /\ report = "none"

Release == /\ release < MaxRelease
           /\ release' = release + 1
           /\ read' = "none"
           /\ report' = "none"
           /\ UNCHANGED <<trustedHash, trustedContent, enabled, managed>>

Trust == /\ trustedHash' = HookHash
         /\ trustedContent' = release
         /\ read' = "none"
         /\ report' = "none"
         /\ UNCHANGED <<release, enabled, managed>>

Toggle == /\ enabled' = ~enabled
          /\ read' = "none"
          /\ report' = "none"
          /\ UNCHANGED <<release, trustedHash, trustedContent, managed>>

Read == /\ read = "none"
        /\ read' \in {"listed", "failed"}
        /\ UNCHANGED <<release, trustedHash, trustedContent, enabled, managed, report>>

Report == /\ read # "none"
          /\ report = "none"
          /\ report' = IF read = "listed"
                         THEN IF enabled /\ CodexStatus \in {"trusted", "managed"}
                              THEN "ok"
                              ELSE "fail"
                         ELSE IF trustedHash = HookHash THEN "warn" ELSE "fail"
          /\ UNCHANGED <<release, trustedHash, trustedContent, enabled, managed, read>>

Next == Release \/ Trust \/ Toggle \/ Read \/ Report
Spec == Init /\ [][Next]_vars

TypeOK == /\ release \in 1..MaxRelease
          /\ trustedHash \in {"none", HookHash}
          /\ trustedContent \in 0..MaxRelease
          /\ enabled \in BOOLEAN
          /\ managed \in BOOLEAN
          /\ read \in Reads
          /\ report \in Reports
          /\ CodexStatus \in Statuses

OkMeansCodexTrusts == report = "ok" => Runs
OkNeedsReply == report = "ok" => read = "listed"
ListedReportIsExact == (read = "listed" /\ report # "none") => (report = "ok" <=> Runs)
=============================================================================
