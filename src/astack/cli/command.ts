import type { Io } from "./io.ts";

export type Command<Code extends number | Promise<number> = number> = {
	readonly name: string;
	readonly summary: string;
	readonly usage: string;
	readonly run: (args: readonly string[], io: Io) => Code;
};
