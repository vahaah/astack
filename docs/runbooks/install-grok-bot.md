# Install astack in Grok Bot

Use a published signed release in a private Bot conversation.
Import the portable skills and preserve their reference files.
Keep a complete CLI runtime in the Bot's persistent workspace.
The Grok Build plugin uses a separate installation procedure.

## Import a tagged release

Choose a published release and review its verified tag first.
The example below requires `v0.1.0` to exist publicly.
Send this request to the Bot:

```text
Install astack from the published signed tag v0.1.0.
Download https://github.com/vahaah/astack/archive/refs/tags/v0.1.0.tar.gz.
Extract the complete source into /workspace/astack/releases/v0.1.0.
Strip the archive's first directory level so dist sits directly under that release folder.
Keep that release folder for later tasks.
Use its dist/grok-bot/skills folder as the private-skill source.
Read the saved astack-rules metadata before changing any saved skill.
Remember its old version and skill list.
Save each SKILL.md as a private skill, except astack-rules.
Keep every skill's name, frontmatter, full text, and other files.
Preserve each resource at its original relative path.
Keep the licence and notice files.
Ask before deleting an old skill that this release omits.
Save astack-rules last, after all resources succeed.
Keep the complete dist/cursor/astack folder as the portable CLI runtime.
Make Node 22 or later available.
Add that runtime's bin folder to PATH.
Use its absolute launcher path in terminals without that PATH setting.
Run astack --help.
Run astack skill-path astack:principles references/fix-root-causes.md.
Read the reference file that the second command returns.
Report the tag, saved skill count, resource limits, and both command results.
```

The source archive contains no Git history.
It does not carry the tag's signature object.
Review the signed tag before using the archive.

The `dist/cursor/astack/bin/astack` launcher resolves its adjacent flat skill library.
Using that runtime does not register Cursor hooks in Grok Bot.
The imported private skills come from `dist/grok-bot/skills/`.
Keep both trees from the same tagged source.

If the Bot cannot save a skill's reference files, report a partial install.
Keep the source files in its workspace for direct use.
Do not claim a complete private-skill install while a resource is missing.

## Enable and check

Open "Connect apps" in the sidebar.
Open the connected count beside its title.
Enable the saved skills for this Bot under "Private skills".
Type `/` in the desktop composer and select `astack-mode`.
Ask the Bot to read one imported reference and report its selected release tag.

Private skills share one library across your Bots.
Each Bot can still need its skills enabled.
This target ships no astack hooks.
Use direct CLI checks in CI or git hooks for enforced checks.
The portable rules include TypeScript and PostgreSQL scope instructions.
The shared checklists remain available without native reviewer agents.

## Before publication

Use `astack-grok-bot.zip` from the local astack exports folder.
Attach it in a private Bot conversation when the attachment is supported.
Send this request:

```text
Install astack from the attached local bundle.
Read INSTALLATION.json and remember its release identifier.
Extract the complete archive into your persistent workspace.
Use grok-bot/skills as the private-skill source.
Keep runtime as the complete CLI runtime.
Preserve every skill and resource at its original relative path.
Save astack-rules last, after the other resources succeed.
Ask before deleting an old skill.
Make Node 22 or later available.
Add runtime/bin to PATH and retain its absolute launcher path.
Run astack --help.
Run astack skill-path astack:principles references/fix-root-causes.md.
Read the returned reference file.
Report the release identifier, saved skill count, and command results.
Report any resource you cannot save or read.
```

The archive has an `astack-grok-bot` root folder.
If the attachment is unreadable, stop the import and report that limit.
Continue at "Enable and check" after a successful import.
A local bundle does not establish a public release or a live Bot pass.

## Update

Repeat the import with the next published signed tag or local bundle.
Compare its identity with the saved rules metadata.
Keep the old skill list until every new skill and resource succeeds.
Review old names before deleting any.
Enable the skills for this Bot and repeat the reference and CLI checks.

## Sources

- [Grok Bot skills](https://docs.x.ai/grok-bot/skills-routines-and-automations)
- [Grok Bot files and results](https://docs.x.ai/grok-bot/files-and-results)
- [GitHub source archives](https://docs.github.com/en/repositories/working-with-files/using-files/downloading-source-code-archives)
