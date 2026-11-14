import { asksForHelp, printHelp, usageLines } from "./command.ts";
import { CHECKS } from "./commands/check/index.ts";
import { ALIASES, COMMANDS } from "./commands/index.ts";
import { type Io, processIo, usageError } from "./io.ts";

export function usage(): string {
	return [
		"usage:",
		...COMMANDS.flatMap(usageLines),
		"",
		...COMMANDS.map((command) => `${command.name}: ${command.summary}`),
		...CHECKS.map((check) => `check ${check.name}: ${check.summary}`),
		`${ALIASES.map((alias) => alias.name).join(", ")} are short forms of check <name>.`,
		"Add --help or -h to a command or a check to print only its usage and summary.",
		"A usage error exits 2, unless the summary of the command gives a different code.",
	].join("\n");
}

export function main(
	argv: readonly string[],
	io: Io = processIo(),
): number | Promise<number> {
	const [name, ...args] = argv;
	if (
		name === undefined ||
		name === "help" ||
		name === "--help" ||
		name === "-h"
	) {
		io.out(`${usage()}\n`);
		return 0;
	}
	const command = [...COMMANDS, ...ALIASES].find(
		(candidate) => candidate.name === name,
	);
	if (!command)
		return usageError(io, `astack: unknown command ${name}\n${usage()}`);
	if (!command.ownsHelp && asksForHelp(args)) return printHelp(command, io);
	return command.run(args, io);
}
