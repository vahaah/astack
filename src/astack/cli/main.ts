import type { Command } from "./command.ts";
import { CHECKS } from "./commands/check/index.ts";
import { ALIASES, COMMANDS } from "./commands/index.ts";
import { type Io, processIo, usageError } from "./io.ts";

function usageLines(command: Pick<Command, "usage">): string[] {
	return command.usage.split("\n").map((line) => `  astack ${line}`);
}

export function usage(): string {
	return [
		"usage:",
		...COMMANDS.flatMap(usageLines),
		"",
		...COMMANDS.map((command) => `${command.name}: ${command.summary}`),
		...CHECKS.map((check) => `check ${check.name}: ${check.summary}`),
		`${ALIASES.map((alias) => alias.name).join(", ")} are short forms of check <name>.`,
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
	return command.run(args, io);
}
