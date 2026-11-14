import type { Io } from "./io.ts";

export type Command<Code extends number | Promise<number> = number> = {
	readonly name: string;
	readonly summary: string;
	readonly usage: string;
	readonly run: (args: readonly string[], io: Io) => Code;
	readonly ownsHelp?: true;
};

export function usageLines(command: Pick<Command, "usage">): string[] {
	return command.usage.split("\n").map((line) => `  astack ${line}`);
}

export function asksForHelp(args: readonly string[]): boolean {
	return args.some((arg) => arg === "--help" || arg === "-h");
}

export function printHelp(
	command: Pick<Command, "usage" | "summary">,
	io: Io,
): number {
	io.out(
		["usage:", ...usageLines(command), "", command.summary, ""].join("\n"),
	);
	return 0;
}
