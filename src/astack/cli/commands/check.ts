import { asksForHelp, type Command, printHelp } from "../command.ts";
import { type Io, usageError } from "../io.ts";
import { CHECKS } from "./check/index.ts";

function run(args: readonly string[], io: Io): number | Promise<number> {
	const [name, ...rest] = args;
	const check = CHECKS.find((candidate) => candidate.name === name);
	if (check)
		return asksForHelp(rest) ? printHelp(check, io) : check.run(rest, io);
	if (asksForHelp(args)) return printHelp(command, io);
	return usageError(
		io,
		`astack check: give one of ${CHECKS.map((candidate) => candidate.name).join(", ")}`,
	);
}

export const command: Command<number | Promise<number>> = {
	name: "check",
	summary: `Runs one check: ${CHECKS.map((check) => check.name).join(", ")}.`,
	usage: CHECKS.map((check) => check.usage).join("\n"),
	run,
	ownsHelp: true,
};

export function checkAlias<Code extends number | Promise<number>>(
	check: Command<Code>,
): Command<Code> {
	return {
		name: `check-${check.name}`,
		summary: check.summary,
		usage: check.usage.replaceAll(`check ${check.name}`, `check-${check.name}`),
		run: check.run,
	};
}
