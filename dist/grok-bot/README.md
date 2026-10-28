# astack for Grok Bot

This folder holds 55 skills for Grok Bot: the astack skills, `astack-rules` and `astack-sync`.

Grok Bot gets no hooks. Grok Bot has no hook support, and this plan has no team marketplace. So nothing enforces the astack rules in Grok Bot. Git hooks and CI that run the astack CLI are the only gates for its work.

## Install

The `astack-sync` skill installs and refreshes the skills. It works only after the repository is public.
Before publication, use the portable bundle route in `docs/runbooks/install-grok-bot.md` of the source repository.

1. In a chat with the bot, paste the text of `skills/astack-sync/SKILL.md`. Ask the bot to save it as a private skill.
2. Run `/astack-sync`. The bot saves each skill in this folder as a private skill.
3. Run `/astack-sync` again after each release. It compares the version stamps and saves only a new version.
4. Enable the saved skills for this Bot under `Connect apps` and `Private skills`.
5. Read one imported reference file and run the CLI before you report a complete install.

`skills/astack-rules/SKILL.md` holds the astack rules. Ask the bot to add its text to the bot memory too. Then the rules apply when no skill runs.

The skills run the `astack` CLI. The bot can run it from the published package:

```sh
bunx github:vahaah/astack#v0.1.0 --help
```

Version: 0.1.0.

Source: https://docs.x.ai/grok-bot/skills-routines-and-automations
