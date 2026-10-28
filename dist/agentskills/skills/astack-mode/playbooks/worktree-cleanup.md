### Worktree and simulator cleanup

1. Record a snapshot and audit the worktrees. Record `df -h /`. Run `scripts/worktree-audit.sh [-b <pr-base-ref>] [repo-path]`. Follow Build the Lever (`astack skill-path astack:principles references/build-the-lever.md`). Without `-b`, the script checks `MERGED` against `origin/HEAD`. Pass `-b origin/<branch>` when PRs target another branch. The script reads paths from `git worktree list`. Do not type those paths by hand. A path such as `myrepo-worktrees/x` can miss a worktree under `.claude/worktrees/x`. Follow Encode Lessons in Structure (`astack skill-path astack:principles references/encode-lessons-in-structure.md`). The script classifies worktrees by size, age, merge state, uncommitted work, PR state, and the newest Claude Code transcript that touched them. It then suggests a bucket. Run the slow transcript scan in the background.
2. Treat the bucket as advice, not permission. Live sessions and sessions that the user plans to resume are the real artifact. Follow Prove It Works (`astack skill-path astack:principles references/prove-it-works.md`). Get that set from the user and `ListAgents`. Compare every candidate with it. The script has marked a worktree `safe` while the user still planned to resume it. The user's set takes priority.
3. Verify use before deletion. For every `verify-recent-chat` row or doubtful candidate, assign subagents to read its transcripts. Tell each subagent to report whether the session is live or one that the user plans to resume. Tell it to name the worktrees that it touches. Transcripts are bulk input. Follow Guard the Context Window (`astack skill-path astack:principles references/guard-the-context-window.md`). A live session creates arena and repro trees in sibling worktrees through agents with `isolation: "worktree"`. Those trees are in use even when the user did not name them. Choose each subagent's model and effort through the Subagents rules.
4. Pause before irreversible loss. `wip:N` means N tracked uncommitted edits. Show the diff before you ask for a decision. Get that decision before removal. A clean worktree can be recovered from its branch. Removing uncommitted work loses it. `scratch:N` means untracked throwaway files. They are safe to drop, but name the files first. Under Autonomy, proceed only with worktrees that are clean, merged, and not in use. Pause for `wip` or in-use worktrees.
5. Prune the confirmed set. Run `git worktree remove --force <path>` for each path. If ignored build artifacts leave the directory behind, remove it with `rm -rf`. Then run `git worktree prune`. Branch refs survive, so no commits are lost. Verify with `df -h /`. List the worktrees again.
6. Examine simulators and other sources of disk use. Simulators are usually the next largest opportunity. Run `xcrun simctl --set testing delete all` for XCTestDevices clones. Run `xcrun simctl delete unavailable`. Use `xcrun simctl runtime list` before `runtime delete <id>` for old runtimes. Other candidates include Xcode `DerivedData`, `iOS DeviceSupport`, and editor state under `~/Library/Application Support/<editor>`. Package caches include pnpm, uv, brew, and yarn. Clear only caches that the user has not asked you to keep.

This playbook deletes user state without a code review to catch mistakes.
The gates above replace that review.

#### Reply

Give `df -h /` before and after the cleanup.
State the space reclaimed and the worktrees pruned.
Give one line for each worktree that you held back.
Name its active chat or uncommitted work as the reason.
