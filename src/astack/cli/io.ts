import { existsSync, readFileSync, realpathSync } from "node:fs";
import { todayIso } from "../plan/files.ts";

export interface Io {
	out(text: string): void;
	err(text: string): void;
	cwd: string;
	env: Record<string, string | undefined>;
	today: string;
	now: Date;
	scriptPath: string | undefined;
	input?: () => string;
}

function realScriptPath(path: string | undefined): string | undefined {
	return path !== undefined && existsSync(path) ? realpathSync(path) : path;
}

export function processIo(): Io {
	return {
		out: (text) => process.stdout.write(text),
		err: (text) => process.stderr.write(text),
		cwd: process.cwd(),
		env: process.env,
		today: todayIso(),
		now: new Date(),
		scriptPath: realScriptPath(process.argv[1]),
		input: () => (process.stdin.isTTY ? "" : readFileSync(0, "utf8")),
	};
}

export function usageError(io: Io, message: string): number {
	io.err(`${message}\n`);
	return 2;
}
