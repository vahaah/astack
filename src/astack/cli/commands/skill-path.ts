import {
	defaultSkillPathEnv,
	parseSkillRef,
	resolveSkillPath,
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
	const found = resolveSkillPath(
		parsed,
		file,
		defaultSkillPathEnv(io.env, io.scriptPath, io.cwd),
	);
	if (!found) {
		io.err(
			`astack skill-path: ${ref}${file ? ` ${file}` : ""} not installed\n`,
		);
		return 1;
	}
	io.out(`${found}\n`);
	return 0;
}

export const command: Command = {
	name: "skill-path",
	summary:
		"Prints the path of a skill file in an installed plugin. Exits 1 when the skill is not installed.",
	usage: "skill-path <plugin>:<skill> [file inside the skill]",
	run,
};
