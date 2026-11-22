------------------------- MODULE SessionGuards -------------------------
EXTENDS Naturals, FiniteSets

Concerns == {"merge", "write", "git"}

PRs == {1, 2}
Clauses == {"merge", "mergeOne", "negatedMerge", "fullSend", "negatedFullSend",
            "fullStop", "other"}
Prompts == {p \in SUBSET Clauses : Cardinality(p) \in {1, 2}}
Sources == {"user", "none", "frame", "machine"}
Authorities == {"turn", "standing", "base"}
BaseAuthorities == Authorities \cup {"unread"}
Channels == {"gh", "mcp"}
Modes == {"plain", "fullSend", "fullStop"}

OwnerCovers(said, n) == \/ {"merge", "fullSend"} \cap said # {}
                        \/ "mergeOne" \in said /\ n = 1
PersonTyped(source, attended) == \/ source = "user"
                                 \/ source = "none" /\ attended
ProfileCovers(authority, n) == \/ authority = "standing"
                               \/ authority = "base" /\ n = 1

ClauseGrant(c) == CASE c \in {"merge", "fullSend"} -> PRs
                    [] c = "mergeOne" -> {1}
                    [] OTHER -> {}
HumanPrompt(source, attended) == IF source = "none" THEN attended ELSE source = "user"
ModeOf(p) == IF "fullStop" \in p THEN "fullStop"
             ELSE IF "fullSend" \in p THEN "fullSend" ELSE "plain"

Files == [inProject : BOOLEAN, inTemp : BOOLEAN, git : BOOLEAN, marked : BOOLEAN]
IdleFile == [inProject |-> TRUE, inTemp |-> FALSE, git |-> TRUE, marked |-> FALSE]
Scratch(f) == ~f.inProject /\ (f.inTemp \/ ~(f.git \/ f.marked))

Kinds == {"unstaged", "staged", "both", "untracked"}
Places == {"named", "folder", "other"}
Changes == [kind : Kinds, place : Places]
Commands ==
  {[name |-> "reset --hard", lost |-> "tracked", scope |-> "tree", effect |-> "tracked"],
   [name |-> "checkout -f main", lost |-> "tracked", scope |-> "tree", effect |-> "tracked"],
   [name |-> "switch --discard-changes main", lost |-> "tracked", scope |-> "tree", effect |-> "tracked"],
   [name |-> "checkout HEAD -- .", lost |-> "tracked", scope |-> "tree", effect |-> "tracked"],
   [name |-> "checkout .", lost |-> "unstaged", scope |-> "tree", effect |-> "worktree"],
   [name |-> "restore :/", lost |-> "unstaged", scope |-> "tree", effect |-> "worktree"],
   [name |-> "restore src", lost |-> "unstaged", scope |-> "folder", effect |-> "worktree"],
   [name |-> "restore -SW src", lost |-> "tracked", scope |-> "folder", effect |-> "tracked"],
   [name |-> "clean -fd", lost |-> "untracked", scope |-> "tree", effect |-> "untracked"],
   [name |-> "clean -f src", lost |-> "untracked", scope |-> "folder", effect |-> "untracked"],
   [name |-> "checkout HEAD -- notes.txt", lost |-> "tracked", scope |-> "named", effect |-> "tracked"],
   [name |-> "restore notes.txt", lost |-> "unstaged", scope |-> "named", effect |-> "worktree"],
   [name |-> "restore --staged .", lost |-> "none", scope |-> "tree", effect |-> "index"],
   [name |-> "clean -fdn", lost |-> "none", scope |-> "tree", effect |-> "none"],
   [name |-> "checkout main", lost |-> "none", scope |-> "tree", effect |-> "none"],
   [name |-> "stash", lost |-> "none", scope |-> "tree", effect |-> "stash"]}

Broad(cmd) == cmd.scope \in {"tree", "folder"} /\ cmd.effect \in {"tracked", "worktree", "untracked"}

CodeKindLost(lost, kind) == CASE lost = "untracked" -> kind = "untracked"
                              [] lost = "tracked" -> kind # "untracked"
                              [] lost = "unstaged" -> kind \in {"unstaged", "both"}
                              [] OTHER -> FALSE
CodeScopeHit(scope, place) == scope = "tree" \/ (scope = "folder" /\ place = "folder")
CodeLost(cmd, t) == {c \in t : CodeKindLost(cmd.lost, c.kind) /\ CodeScopeHit(cmd.scope, c.place)}

GitScope(scope, place) == scope = "tree" \/ scope = place
Loses(effect, kind) == CASE effect = "tracked" -> kind # "untracked"
                         [] effect = "worktree" -> kind \in {"unstaged", "both"}
                         [] effect = "untracked" -> kind = "untracked"
                         [] effect = "index" -> kind = "both"
                         [] OTHER -> FALSE
Touches(effect, kind) == \/ Loses(effect, kind)
                         \/ effect = "index" /\ kind = "staged"
                         \/ effect = "stash" /\ kind # "untracked"
Rest(effect, kind) == CASE effect = "worktree" /\ kind = "both" -> "staged"
                        [] effect = "index" /\ kind \in {"staged", "both"} -> "unstaged"
                        [] OTHER -> "gone"
GitLost(cmd, t) == {c \in t : GitScope(cmd.scope, c.place) /\ Loses(cmd.effect, c.kind)}
Touched(cmd, t) == {c \in t : GitScope(cmd.scope, c.place) /\ Touches(cmd.effect, c.kind)}
After(cmd, t) == (t \ Touched(cmd, t))
                 \cup {[c EXCEPT !.kind = Rest(cmd.effect, c.kind)] :
                         c \in {d \in Touched(cmd, t) : Rest(cmd.effect, d.kind) # "gone"}}

VARIABLES concern, attended, baseAuthority, workingAuthority, said, saidBy, grant,
          mode, merged, unauthorized, stopMerged, mcpMerged, faultMerged,
          file, step, writeChecked, commitChecked, tree, broadLoss, falseDenial
mergeVars == <<attended, baseAuthority, workingAuthority, said, saidBy, grant, mode,
               merged, unauthorized, stopMerged, mcpMerged, faultMerged>>
writeVars == <<file, step, writeChecked, commitChecked>>
gitVars == <<tree, broadLoss, falseDenial>>
vars == <<concern, mergeVars, writeVars, gitVars>>

MergeStart == /\ said = {}
              /\ saidBy = "nobody"
              /\ grant = {}
              /\ mode = "plain"
              /\ merged = {}
              /\ unauthorized = FALSE
              /\ stopMerged = FALSE
              /\ mcpMerged = FALSE
              /\ faultMerged = FALSE
MergeIdle == /\ attended = TRUE
             /\ baseAuthority = "turn"
             /\ workingAuthority = "turn"
             /\ MergeStart
WriteStart == step = "new" /\ writeChecked = FALSE /\ commitChecked = FALSE
WriteIdle == file = IdleFile /\ WriteStart
GitIdle == tree = {} /\ broadLoss = FALSE /\ falseDenial = FALSE

Init == \/ /\ concern = "merge"
           /\ attended \in BOOLEAN
           /\ baseAuthority \in BaseAuthorities
           /\ workingAuthority \in Authorities
           /\ MergeStart
           /\ WriteIdle
           /\ GitIdle
        \/ /\ concern = "write"
           /\ MergeIdle
           /\ file \in Files
           /\ WriteStart
           /\ GitIdle
        \/ /\ concern = "git"
           /\ MergeIdle
           /\ WriteIdle
           /\ tree \in SUBSET Changes
           /\ broadLoss = FALSE
           /\ falseDenial = FALSE

Prompt == /\ concern = "merge"
          /\ \E p \in Prompts, source \in Sources :
               IF HumanPrompt(source, attended)
                 THEN /\ grant' = UNION {ClauseGrant(c) : c \in p}
                      /\ said' = p
                      /\ saidBy' = source
                      /\ mode' = ModeOf(p)
                 ELSE UNCHANGED <<grant, said, saidBy, mode>>
          /\ UNCHANGED <<concern, attended, baseAuthority, workingAuthority, merged,
                         unauthorized, stopMerged, mcpMerged, faultMerged, writeVars, gitVars>>

EditProfile == /\ concern = "merge"
               /\ workingAuthority' \in Authorities
               /\ UNCHANGED <<concern, attended, baseAuthority, said, saidBy, grant, mode, merged,
                              unauthorized, stopMerged, mcpMerged, faultMerged, writeVars, gitVars>>

Merge == /\ concern = "merge"
         /\ mode # "fullStop"
         /\ \E n \in PRs \ merged, channel \in Channels, fault \in BOOLEAN :
              /\ channel = "gh"
              /\ ~fault
              /\ ProfileCovers(baseAuthority, n) \/ n \in grant
              /\ merged' = merged \cup {n}
              /\ mcpMerged' = (mcpMerged \/ channel = "mcp")
              /\ faultMerged' = (faultMerged \/ fault)
              /\ unauthorized' = (unauthorized \/ ~(ProfileCovers(baseAuthority, n)
                                   \/ (OwnerCovers(said, n) /\ PersonTyped(saidBy, attended))))
         /\ stopMerged' = (stopMerged \/ mode = "fullStop")
         /\ UNCHANGED <<concern, attended, baseAuthority, workingAuthority, said, saidBy, grant,
                        mode, writeVars, gitVars>>

Write == /\ concern = "write"
         /\ step = "new"
         /\ step' = "written"
         /\ writeChecked' = ~Scratch(file)
         /\ UNCHANGED <<concern, file, commitChecked, mergeVars, gitVars>>

Commit == /\ concern = "write"
          /\ step = "written"
          /\ file.git
          /\ step' = "committed"
          /\ commitChecked' = TRUE
          /\ UNCHANGED <<concern, file, writeChecked, mergeVars, gitVars>>

Settled == /\ concern = "write"
           /\ step # "new"
           /\ UNCHANGED vars

RunGit == /\ concern = "git"
          /\ \E cmd \in Commands :
               LET denied == CodeLost(cmd, tree) # {}
               IN /\ falseDenial' = (falseDenial \/ (denied /\ GitLost(cmd, tree) = {}))
                  /\ IF denied
                       THEN UNCHANGED <<tree, broadLoss>>
                       ELSE /\ broadLoss' = (broadLoss \/ (Broad(cmd) /\ GitLost(cmd, tree) # {}))
                            /\ tree' = After(cmd, tree)
          /\ UNCHANGED <<concern, mergeVars, writeVars>>

Next == Prompt \/ EditProfile \/ Merge \/ Write \/ Commit \/ Settled \/ RunGit
Spec == Init /\ [][Next]_vars

TypeOK == /\ concern \in Concerns
          /\ attended \in BOOLEAN
          /\ baseAuthority \in BaseAuthorities
          /\ workingAuthority \in Authorities
          /\ said \in Prompts \cup {{}}
          /\ saidBy \in Sources \cup {"nobody"}
          /\ grant \subseteq PRs
          /\ mode \in Modes
          /\ merged \subseteq PRs
          /\ unauthorized \in BOOLEAN
          /\ stopMerged \in BOOLEAN
          /\ mcpMerged \in BOOLEAN
          /\ faultMerged \in BOOLEAN
          /\ file \in Files
          /\ step \in {"new", "written", "committed"}
          /\ writeChecked \in BOOLEAN
          /\ commitChecked \in BOOLEAN
          /\ tree \subseteq Changes
          /\ broadLoss \in BOOLEAN
          /\ falseDenial \in BOOLEAN

GrantFromWords == \A n \in grant : OwnerCovers(said, n)
GrantFromPerson == grant # {} => PersonTyped(saidBy, attended)
MergeNeedsAuthority == ~unauthorized
McpMergeDenied == ~mcpMerged
GuardErrorDenies == ~faultMerged
FullStopNeverMerges == ~stopMerged
WriteChecksKept == step # "new" /\ (file.inProject \/ (~file.inTemp /\ (file.git \/ file.marked)))
                   => writeChecked
ScratchSkipped == step # "new" /\ ~file.inProject /\ (file.inTemp \/ ~(file.git \/ file.marked))
                  => ~writeChecked
CommitSurfaceChecked == step = "committed" => commitChecked
BroadLossDenied == ~broadLoss
DenialNeedsLoss == ~falseDenial
=============================================================================
