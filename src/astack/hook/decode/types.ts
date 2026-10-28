import type { Env, HookEvent } from "../events.ts";

export type DecodeDeps = {
	readonly env: Env;
	readonly cwd: string;
	readonly readText: (path: string) => string | undefined;
};

export type Decoded = {
	readonly cwd: string;
	readonly projectDir: string | undefined;
	readonly session?: string;
	readonly events: readonly HookEvent[];
};
