# astack for Agent Skills clients

This folder holds 52 astack skills in the Agent Skills format. Each SKILL.md keeps only `name`, `description`, `license` and `metadata`. A skill that only the user can start has `disable-model-invocation: "true"` in its `metadata`.

## Install

Install the skills in one project at a time. Run this command in the project:

```sh
npx skills add <astack repository>/agentskills/skills -a <agent>
```

Do not install them at user scope with `-g` on a computer that has a plugin tool. Several tools read `~/.agents/skills`, so each skill then shows two times.

Add the text of `AGENTS.fragment.md` to the `AGENTS.md` file of the project. It holds the astack rules.

The skills run the `astack` CLI. Install it from the published package:

```sh
bunx github:vahaah/astack#v0.1.0 --help
```

No hooks run in this format. Put the CLI checks in git hooks and CI.

Version: 0.1.0.
