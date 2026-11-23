import { spawnSync } from "node:child_process";
import { err, ok, type Result } from "./result.ts";

export type Env = Readonly<Record<string, string | undefined>>;

export type ProcessOptions = {
	readonly cwd?: string;
	readonly env?: Env;
	readonly input?: string;
	readonly timeoutMs?: number;
	readonly maxBuffer?: number;
	readonly stdin?: "pipe" | "ignore" | "inherit";
	readonly output?: "pipe" | "inherit";
};

export type ProcessOutput = {
	readonly status: number | null;
	readonly signal: string | null;
	readonly stdout: Buffer;
	readonly stderr: Buffer;
	readonly stopped: string | undefined;
};

export type StartFailure = { readonly cause: string };

export function runProcess(
	program: string,
	args: readonly string[],
	options: ProcessOptions,
): Result<ProcessOutput, StartFailure> {
	const output = options.output ?? "pipe";
	const result = spawnSync(program, args, {
		cwd: options.cwd,
		input: options.input,
		timeout: options.timeoutMs,
		maxBuffer: options.maxBuffer,
		stdio: [options.stdin ?? "pipe", output, output],
		...(options.env === undefined ? {} : { env: { ...options.env } }),
	});
	if (result.error !== undefined && !result.pid)
		return err({ cause: result.error.message });
	return ok({
		status: result.status,
		signal: result.signal,
		stdout: result.stdout ?? Buffer.alloc(0),
		stderr: result.stderr ?? Buffer.alloc(0),
		stopped: result.error?.message,
	});
}
