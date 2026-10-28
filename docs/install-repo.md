# Install astack in a repo

astack has two parts. The owner installs the plugins and the rules one time on each machine. Each repo then gets a small set of committed files. These files set astack for that repo and for each teammate.

## Install astack one time on your machine

| Tool | Steps |
|---|---|
| Claude Code | In this repo, run `bun run apply --global --dry-run` to see the steps. Then run `bun run apply --global`. |
| Codex | `dist/codex/README.md` |
| Cursor | `dist/cursor/astack/README.md` |
| Grok Bot | `dist/grok-bot/README.md` |
| Other Agent Skills clients | `dist/agentskills/README.md` |

`dist/README.md` gives the Claude Code steps for a machine without a clone. If the machine has the old agent-stack install, do the steps in [migration.md](migration.md) first. Run `astack doctor` after each install.

Claude Code puts the `bin` folder of each installed plugin on the PATH of its Bash tool. So in a Claude Code session, `astack` runs the installed copy of the plugin. A terminal does not get that PATH. To use `astack` in a terminal, link the launcher of your clone into a folder on your PATH:

```sh
ln -sfn <repository root>/dist/claude-code/astack/bin/astack ~/.local/bin/astack
astack doctor
```

The link always runs the build of your clone.

## Install in a known repo

A known repo has a config file, `projects/<name>.json`, in the companion. The companion is a private folder of the owner. Set `ASTACK_COMPANION_DIR` to it, or pass `--companion <dir>` to each command. With neither, apply reads the synthetic `examples/companion/`, and a write refuses it. First, preview the result in a temporary copy. Then write it on a new branch:

```sh
bun run apply --project <name> --dry-run
bun run apply --project <name> --worktree
```

The write mode never changes your checkout. It does these steps:

1. It records the HEAD, the branch and the `git status` output of your checkout.
2. It runs `git fetch origin`.
3. It makes the branch `astack/setup` from `origin/<default branch>`, in a worktree at `~/.local/state/astack/worktrees/<name>/astack-setup`.
4. It writes the same files as the dry run.
5. It runs the gates of the repo before and after the write. When a gate needs `node_modules`, it links the folder of your checkout for the gate run and removes the link after.
6. It deletes the files that astack replaces, such as `.claude/commands/pr-review-hardening.md`. A skill wins over a command file with the same name, so the review stub serves `/pr-review-hardening`.
7. It stages only the written and deleted files and makes one commit. The subject follows the commit style of the repo.
8. It shows that your checkout did not change. Then it prints the next steps.

| Option | Effect |
|---|---|
| `--branch <name>` | Sets the branch name. `branchTemplate` in `projects/<name>.json` of the companion sets a default, and `{date}` in it becomes the date. |
| `--base <ref>` | Sets the start point. The default is `origin/<default branch>`. |
| `--worktrees <dir>` | Sets the folder for the worktrees. It must be outside the repo. |
| `--trailer "<Key: value>"` | Adds a trailer line to the commit. You can use it more than one time. |
| `--marketplace-repo <owner/repo>` | Adds the marketplace and the three plugins to `.claude/settings.json`. |
| `--keep` | Keeps the worktree and the branch when the run fails. |
| `--update` | Writes into the existing worktree of the setup branch, as "Update and uninstall" says. |
| `--overlay <branch>` | Uses the overlay of that branch in `projects/<name>.json` of the companion. A `--base` that names the branch of an overlay uses it without this flag. An update needs the flag, as the README says. |

The run stops when the branch or the worktree folder exists. A report-only project prints its report and stops. When the repo has a rule for branch names, the run prints a warning and the rename command. The command has a shell variable for each part of the new name that you must fill in, such as `TICKET`. It stops when that variable is empty.

## Install in any repo

`astack init` needs a copy of the plugin that has the `init` command. An old installed copy stops with `astack: unknown command init`. Update the plugin first, as "Update and uninstall" says. The terminal launcher above always runs the build of your clone.

In the repo root, run `astack init`:

```sh
astack init --dry-run
astack init
```

The command reads the tracker from the branch names and the commit subjects. It also finds the default branch, a PR template, the glossary and the ADR folder. It writes only `.astack/profile.json`, and it never makes a commit. It does not replace a profile unless you add `--force`.

| Flag | Effect |
|---|---|
| `--tracker linear:<TEAM>`, `--tracker github` or `--tracker none` | Sets the tracker when the command finds the wrong one or none. |
| `--require-part-of` | Each PR body must start with `Part of <key>`. |
| `--ste deny` or `--ste advise` | Sets the STE check on docs. The default is `advise`. |

## What each file does

| File | Purpose |
|---|---|
| `.astack/profile.json` | The settings that the astack hooks and the CLI read. These are the tracker, the merge grant, STE, the plan folders and the comment keep patterns. The `managed` list names each file that apply writes. |
| `.astack/NOTICE` | The MIT notices of pstack and mattpocock/skills. It names each file that holds their text, and each of those files names it. |
| `.claude/skills/pr-review-hardening/SKILL.md` | A stub that starts `astack:pr-review-hardening` in this repo. `skillMirrors` in the project config writes the same stub into a mirror such as `.agents/skills`. |
| `.claude/pr-review-hardening.profile.md` | The gates, the reviewers and the limits of the review loop. |
| `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md` and `docs/agents/domain.md` | They tell the astack skills where the tickets, the labels and the domain docs are. |
| `.claude/rules/<dir>/agent-skills.md` | It points agents to the three flow docs. |
| `.claude/rules/<dir>/coding.md` and `.claude/rules/<dir>/comments.md` | Copies of the coding rule and the comment rule. The write mode adds them only when the project config sets `artifacts.rules: true`. |
| `.claude/settings.json` | The marketplace and the three plugins, for teammates. The write mode adds them only with `--marketplace-repo`. |

`astack init` writes only the first file. To add the review loop, run `/astack:pr-review-hardening` in the repo. To add the flow docs, run `/astack:setup`.

## Commit the files and open the PR

The write mode makes the commit for you. After `astack init`, commit `.astack/profile.json` on a new branch yourself.

1. Review the commit with `git -C <worktree> show HEAD`.
2. Push the branch with `git -C <worktree> push -u origin <branch>`.
3. Open the PR with `gh pr create`. Use the PR template of the repo when it has one. If not, write the body with `astack:write-docs`.
4. When the profile sets `requirePartOf`, put `Part of <key>` on the first line of the body.
5. After the merge, remove the worktree with `git worktree remove <worktree>`. Then delete the local branch.

Never commit `node_modules` or the worktree folder.

## Teammates

A teammate needs the published marketplace. Until then, only the owner gets the plugins. After the publication, each teammate installs the plugins one time:

```sh
claude plugin marketplace add vahaah/astack
claude plugin install astack@astack
claude plugin install pstack@astack
claude plugin install flow@astack
```

To show the plugins to each teammate who opens the repo, add the marketplace block to `.claude/settings.json`. For a known repo, run the write mode with `--marketplace-repo <owner/repo>`. The source is always a GitHub repo, never a local folder. `astack init` prints the same block for any repo.

## Update and uninstall

To update the files of a known repo on its open setup branch, run the write mode with `--update`:

```sh
bun scripts/apply.ts --project <name> --worktree --update
```

The update needs the worktree of the setup branch, with no changes in it. It writes the files again and deletes each file that the old `managed` list names and astack no longer writes. It also deletes the files that astack replaces. Then it adds one commit on top of the branch. It never amends a commit and never force-pushes. When the run fails, it puts the worktree back to its commit, unless you add `--keep`. After the merge of the setup branch, run the write mode again with a new branch, such as `--branch astack/update`. For any repo, run `astack init --force` and review the diff.

## Who owns a file

`astack managed <path>` tells whether astack writes a file in the repo. It reads the `managed` list in `.astack/profile.json`. It follows symbolic links, so a path through a linked folder such as `.agents/skills` gets the answer for the real file.

| Answer | Exit code | What to do with a review comment on the file |
|---|---|---|
| `written` | 0 | Fix the source in the astack repo. Then apply it again to each repo with a profile, with `--update`. |
| `retired` | 0 | Apply deletes the file, so do not fix it. Apply the repo again. |
| `merged` | 0 | astack writes only its plugin wiring keys into the file. Fix a wiring key in astack, and any other key in the repo. |
| `repo` | 1 | Fix the file in the repo. |
| `unknown` | 2 | The profile has no `managed` list. Apply the repo again with `--update`. |

To update the plugins in Claude Code, run `claude plugin marketplace update astack`. Then run `claude plugin update` for each plugin, and restart Claude Code. The dist README of each tool gives its update steps.

```sh
claude plugin marketplace update astack
claude plugin update astack@astack
claude plugin update pstack@astack
claude plugin update flow@astack
```

`bun run dist` adds a build stamp to the version of the astack plugin, such as `0.1.0+1a2b3c4d5e6f`. The stamp is a hash of the plugin files. So each new bundle or skill change is a new version, and `claude plugin update` installs it.

To remove astack from a repo, delete the files in the table above in one PR. To remove the plugins, run `claude plugin uninstall` for each plugin. Then run `claude plugin marketplace remove astack`.
