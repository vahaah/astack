import type { Command } from "../command.ts";
import { type Io, usageError } from "../io.ts";
import { CHECKS } from "./check/index.ts";

function run(args: readonly string[], io: Io): number | Promise<number> {
	const [name, ...rest] = args;
	const check = CHECKS.find((candidate) => candidate.name === name);
	if (!check)
		return usageError(
			io,
			`astack check: give one of ${CHECKS.map((candidate) => candidate.name).join(", ")}`,
		);
	return check.run(rest, io);
}

export const command: Command<number | Promise<number>> = {
	name: "check",
	summary: `Runs one check: ${CHECKS.map((check) => check.name).join(", ")}.`,
	usage: CHECKS.map((check) => check.usage).join("\n"),
	run,
};

export function checkAlias<Code extends number | Promise<number>>(
	check: Command<Code>,
): Command<Code> {
	return {
		name: `check-${check.name}`,
		summary: `Runs check ${check.name}.`,
		usage: check.usage.replaceAll(`check ${check.name}`, `check-${check.name}`),
		run: check.run,
	};
}
