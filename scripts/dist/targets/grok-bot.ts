import { type Build, PUBLIC_REPO, thirdPartyFiles } from "../build.ts";
import { emits } from "../capability.ts";
import { type FlatBuild, flatSkill, flatSkills, rulesSkill } from "../flat.ts";
import { renderFrontmatter } from "../frontmatter.ts";
import { type FileTree, mount, textFile, union } from "../tree.ts";

export const GROK_ROOT = "grok-bot";

export const RULES_DESCRIPTION =
	"Use at the start of every task. The astack standing rules for plans, code, comments, tickets, PRs and replies.";

export function syncSkill(version: string): string {
	return renderFrontmatter(
		[
			["name", "astack-sync"],
			[
				"description",
				"Use to install or refresh the astack skills. Saves each skill of the public astack release as a private skill with its version stamp.",
			],
			["metadata", { "astack-version": version }],
		],
		[
			"",
			"# astack sync",
			"",
			`Install or refresh the astack skills from the public repository \`${PUBLIC_REPO}\`.`,
			"",
			"1. Read the saved `astack-rules` skill before you save any skill. Remember its `astack-version` and `astack-skills` metadata.",
			"2. If no saved rules skill exists, treat this as a first install. Start with an empty old skill list.",
			`3. Find the newest release tag of \`https://github.com/${PUBLIC_REPO}\` with \`git ls-remote --tags --refs --sort=-version:refname\`. Use a tag of the form \`v<version>\`.`,
			"4. If the versions match, verify each saved skill and its reference files. Stop only when that complete set is current.",
			"5. Clone the repository at the release tag into a new temporary folder.",
			`6. Use \`dist/${GROK_ROOT}/skills/\` when that folder exists. Otherwise use \`${GROK_ROOT}/skills/\` in the built output.`,
			"7. Save each `SKILL.md` as a private skill, except `astack-rules`. Use its folder name and keep its full frontmatter and text.",
			"8. Save each other skill file at the same relative path. Report a partial install if any file cannot be saved.",
			"9. Compare the remembered old skill list with the new list. Ask the user before you delete an old skill.",
			"10. Save the new `astack-rules` skill last, after all skill files succeed. Keep its new version stamp and skill list.",
			"11. Enable the skills for this Bot under `Connect apps` and `Private skills`.",
			"12. Report the old version, new version, saved skill count, and any missing reference files.",
			"",
			"Do not change the text of a skill. Save skills only from the repository above, never from a fork.",
			"",
		].join("\n"),
	);
}

function readme(build: Build, count: number): string {
	return [
		"# astack for Grok Bot",
		"",
		`This folder holds ${count} skills for Grok Bot: the astack skills, \`astack-rules\` and \`astack-sync\`.`,
		"",
		"Grok Bot gets no hooks. Grok Bot has no hook support, and this plan has no team marketplace. So nothing enforces the astack rules in Grok Bot. Git hooks and CI that run the astack CLI are the only gates for its work.",
		"",
		"## Install",
		"",
		"The `astack-sync` skill installs and refreshes the skills. It works only after the repository is public.",
		"Before publication, use the portable bundle route in `docs/runbooks/install-grok-bot.md` of the source repository.",
		"",
		"1. In a chat with the bot, paste the text of `skills/astack-sync/SKILL.md`. Ask the bot to save it as a private skill.",
		"2. Run `/astack-sync`. The bot saves each skill in this folder as a private skill.",
		"3. Run `/astack-sync` again after each release. It compares the version stamps and saves only a new version.",
		"4. Enable the saved skills for this Bot under `Connect apps` and `Private skills`.",
		"5. Read one imported reference file and run the CLI before you report a complete install.",
		"",
		"`skills/astack-rules/SKILL.md` holds the astack rules. Ask the bot to add its text to the bot memory too. Then the rules apply when no skill runs.",
		"",
		"The skills run the `astack` CLI. The bot can run it from the published package:",
		"",
		"```sh",
		`bunx github:${PUBLIC_REPO}#v${build.version} --help`,
		"```",
		"",
		`Version: ${build.version}.`,
		"",
		"Source: https://docs.x.ai/grok-bot/skills-routines-and-automations",
		"",
	].join("\n");
}

export function grokBotTarget(build: Build, flat: FlatBuild): FileTree {
	const skills = flatSkills(build, "grok-bot");
	const extras = new Map([
		["skills/astack-sync/SKILL.md", textFile(syncSkill(build.version))],
	]);
	const names = [
		...skills.map((skill) => skill.flat),
		"astack-sync",
		"astack-rules",
	];
	const rules = emits("rule-card", "grok-bot")
		? rulesSkill(build.rules, flat, RULES_DESCRIPTION, names)
		: new Map();
	const count = skills.length + extras.size + rules.size;
	return mount(
		GROK_ROOT,
		union([
			new Map([
				["README.md", textFile(readme(build, count))],
				["VERSION", textFile(`${build.version}\n`)],
				["LICENSE", textFile(build.licenses.astack)],
				["NOTICE", textFile(build.notices.astack)],
			]),
			thirdPartyFiles(build, skills),
			extras,
			rules,
			...skills.map((skill) => flatSkill(skill, flat)),
		]),
	);
}
