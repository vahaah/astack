# Install astack in Cursor cloud

Use project skills from a published signed release.
This route also serves automation runs.
Keep the committed `dist/` build from that release.
No local astack installation is required.

## Get the tagged source

Review a published release and its verified tag first.
Use `v0.1.0` below only after that release exists.
Run these commands from the project root:

```sh
ASTACK_TAG=v0.1.0
ASTACK_UNPACK="$(mktemp -d)"
curl --fail --location "https://github.com/vahaah/astack/archive/refs/tags/$ASTACK_TAG.tar.gz" -o "$ASTACK_UNPACK/source.tar.gz"
tar -xzf "$ASTACK_UNPACK/source.tar.gz" -C "$ASTACK_UNPACK"
ASTACK_SOURCE="$ASTACK_UNPACK/astack-${ASTACK_TAG#v}"
ASTACK_CURSOR="$ASTACK_SOURCE/dist/cursor/astack"
ASTACK_FRAGMENT="$ASTACK_SOURCE/dist/agentskills/AGENTS.fragment.md"
```

The archive contains a source snapshot and its generated builds.
It contains no Git history.
Downloading the archive does not itself verify the tag's signature.

## Prepare the project

Review an existing `.cursor/astack` folder before replacing it.
Review colliding skill names in `.cursor/skills/` too.
Copy the complete plugin tree and its project skills:

```sh
mkdir -p .cursor/astack .cursor/skills
cp -R "$ASTACK_CURSOR/." .cursor/astack/
cp -R .cursor/astack/skills/. .cursor/skills/
```

The project skills folder lets the cloud agent discover each skill.
The complete `.cursor/astack` tree keeps the launcher, licences, manifest, and reference library together.
Keep both copies from the same release.

Merge `ASTACK_FRAGMENT` into the project's `AGENTS.md`.
Keep one astack block and retain the project's own instructions.
Add the following CLI instruction outside that block:

```text
Run astack commands from the project root.
Use .cursor/astack/bin/astack when astack is absent from PATH.
```

Commit the project changes and push its branch.
The cloud agent must clone the branch that carries these files.

## Start and check

Make Node 22 or later available in the cloud environment.
Start a new cloud agent after the project or environment changes.
Run these commands from the cloned project root:

```sh
export PATH="$PWD/.cursor/astack/bin:$PATH"
astack --help
astack skill-path astack:principles references/fix-root-causes.md
```

Use `.cursor/astack/bin/astack` directly in a terminal without that `PATH` setting.
Keep this instruction in `AGENTS.md` for later terminals.

Select `/astack-mode` in the agent chat.
Ask it to read one skill and the reference path that the CLI returned.
Record the selected tag and both command results.
Report missing skills or references before claiming a complete install.

This project-skills route does not register the plugin's local astack hooks.
Use direct CLI checks in project CI when enforcement is required.
The portable fragment includes the scoped TypeScript and PostgreSQL guidance.
Use the shared review checklists when the client cannot start a native reviewer.
Hook-profile settings affect clients that actually run astack hooks.

## Personal skill sync

Personal skills in `~/.cursor/skills/` can sync to cloud agents that you start yourself.
Enable "Sync Skills for Cloud Agents" under "Settings", "Agents", and "Context and Tools".
Automation runs do not load personal synced skills.
Cursor does not copy `~/.agents/skills/` or unsynced local skills to those agents.
Use the project route for automation.

## Before publication

Use the local portable bundle while no public release exists.
Set the same input variables from that archive:

```sh
ASTACK_EXPORT="$HOME/.local/share/astack/exports/astack-cursor-cloud.zip"
ASTACK_UNPACK="$(mktemp -d)"
unzip "$ASTACK_EXPORT" -d "$ASTACK_UNPACK"
ASTACK_CURSOR="$ASTACK_UNPACK/astack-cursor-cloud"
ASTACK_FRAGMENT="$ASTACK_CURSOR/AGENTS.fragment.md"
```

Continue at "Prepare the project".
Keep the bundle's `INSTALLATION.json` and record its release identifier.
A local bundle install does not establish a published release or a live cloud pass.

## Update

Repeat the procedure with the next published signed tag or local bundle.
Replace both astack copies together.
Review names that the old bundle supplied but the new bundle omits.
Remove only those owned old files after that review.
Merge the new astack block in `AGENTS.md`.
Commit, push, and start a new cloud agent.
Repeat the CLI and reference checks.

## Sources

- [Cursor skills](https://cursor.com/docs/skills)
- [Cursor cloud setup](https://cursor.com/docs/cloud-agent/setup)
- [GitHub source archives](https://docs.github.com/en/repositories/working-with-files/using-files/downloading-source-code-archives)
