import {
	baseNameMatch,
	defaultSkillPathEnv,
	parseSkillRef,
	resolveSkillPath,
	skillFolderFiles,
} from "../../skill-path.ts";
import type { Command } from "../command.ts";
import { type Io, usageError } from "../io.ts";

function run(args: readonly string[], io: Io): number {
	const [ref, file, ...rest] = args;
	const parsed = ref ? parseSkillRef(ref) : undefined;
	if (!parsed || rest.length > 0)
		return usageError(
			io,
			"astack skill-path: give <plugin>:<skill> [file inside the skill]",
		);
	const env = defaultSkillPathEnv(io.env, io.scriptPath, io.cwd);
	const found = resolveSkillPath(parsed, file, env);
	if (found) {
		io.out(`${found}\n`);
		return 0;
	}
	const skill = file ? resolveSkillPath(parsed, undefined, env) : undefined;
	if (!skill) {
		io.err(
			`astack skill-path: ${ref}${file ? ` ${file}` : ""} not installed\n`,
		);
		return 1;
	}
	const match = file ? baseNameMatch(skill, file) : undefined;
	if (match) {
		io.out(`${match}\n`);
		return 0;
	}
	const files = skillFolderFiles(skill);
	io.err(
		[
			`astack skill-path: ${file} is not in ${ref}`,
			...(files.length > 0
				? [
						"Its references/ and playbooks/ folders hold:",
						...files.map((name) => `  ${name}`),
					]
				: []),
			"",
		].join("\n"),
	);
	return 3;
}

export const command: Command = {
	name: "skill-path",
	summary:
		"Prints the path of a skill file in an installed plugin. When the skill does not hold the file, it prints the one .md file of its references/ and playbooks/ folders with the same base name. Exits 1 when the skill is not installed. Exits 3 when no single file matches, and lists the .md files of those folders.",
	usage: "skill-path <plugin>:<skill> [file inside the skill]",
	run,
};
