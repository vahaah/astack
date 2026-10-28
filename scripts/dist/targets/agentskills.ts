import { type Build, PUBLIC_REPO, thirdPartyFiles } from "../build.ts";
import { toFlat } from "../codemods.ts";
import { type FlatBuild, flatSkill, flatSkills, packageCli } from "../flat.ts";
import { type FileTree, mount, textFile, union } from "../tree.ts";
import { fragment } from "./codex.ts";

export const AGENTSKILLS_ROOT = "agentskills";

export function agentSkillsFragment(build: Build): string {
	return fragment(
		build.rules,
		(text) =>
			toFlat(text, {
				owner: "rules",
				astackSkills: build.astackSkills,
				cli: packageCli(build.version),
			}),
		build.version,
	);
}

function readme(build: Build, count: number): string {
	return [
		"# astack for Agent Skills clients",
		"",
		`This folder holds ${count} astack skills in the Agent Skills format. Each SKILL.md keeps only \`name\`, \`description\`, \`license\` and \`metadata\`. A skill that only the user can start has \`disable-model-invocation: "true"\` in its \`metadata\`.`,
		"",
		"## Install",
		"",
		"Install the skills in one project at a time. Run this command in the project:",
		"",
		"```sh",
		`npx skills add <astack repository>/${AGENTSKILLS_ROOT}/skills -a <agent>`,
		"```",
		"",
		"Do not install them at user scope with `-g` on a computer that has a plugin tool. Several tools read `~/.agents/skills`, so each skill then shows two times.",
		"",
		"Add the text of `AGENTS.fragment.md` to the `AGENTS.md` file of the project. It holds the astack rules.",
		"",
		"The skills run the `astack` CLI. Install it from the published package:",
		"",
		"```sh",
		`bunx github:${PUBLIC_REPO}#v${build.version} --help`,
		"```",
		"",
		"No hooks run in this format. Put the CLI checks in git hooks and CI.",
		"",
		`Version: ${build.version}.`,
		"",
	].join("\n");
}

export function agentSkillsTarget(build: Build, flat: FlatBuild): FileTree {
	const skills = flatSkills(build, "agentskills");
	return mount(
		AGENTSKILLS_ROOT,
		union([
			new Map([
				["README.md", textFile(readme(build, skills.length))],
				["AGENTS.fragment.md", textFile(agentSkillsFragment(build))],
				["LICENSE", textFile(build.licenses.astack)],
				["NOTICE", textFile(build.notices.astack)],
			]),
			thirdPartyFiles(build, skills),
			...skills.map((skill) => flatSkill(skill, flat)),
		]),
	);
}
