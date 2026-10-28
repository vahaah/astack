---
name: "astack-sync"
description: "Use to install or refresh the astack skills. Saves each skill of the public astack release as a private skill with its version stamp."
metadata:
  astack-version: "0.1.0"
---

# astack sync

Install or refresh the astack skills from the public repository `vahaah/astack`.

1. Read the saved `astack-rules` skill before you save any skill. Remember its `astack-version` and `astack-skills` metadata.
2. If no saved rules skill exists, treat this as a first install. Start with an empty old skill list.
3. Find the newest release tag of `https://github.com/vahaah/astack` with `git ls-remote --tags --refs --sort=-version:refname`. Use a tag of the form `v<version>`.
4. If the versions match, verify each saved skill and its reference files. Stop only when that complete set is current.
5. Clone the repository at the release tag into a new temporary folder.
6. Use `dist/grok-bot/skills/` when that folder exists. Otherwise use `grok-bot/skills/` in the built output.
7. Save each `SKILL.md` as a private skill, except `astack-rules`. Use its folder name and keep its full frontmatter and text.
8. Save each other skill file at the same relative path. Report a partial install if any file cannot be saved.
9. Compare the remembered old skill list with the new list. Ask the user before you delete an old skill.
10. Save the new `astack-rules` skill last, after all skill files succeed. Keep its new version stamp and skill list.
11. Enable the skills for this Bot under `Connect apps` and `Private skills`.
12. Report the old version, new version, saved skill count, and any missing reference files.

Do not change the text of a skill. Save skills only from the repository above, never from a fork.
