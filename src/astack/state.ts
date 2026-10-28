import { join } from "node:path";

type Env = Readonly<Record<string, string | undefined>>;

export function stateDir(env: Env): string | undefined {
	if (env.ASTACK_STATE_DIR) return env.ASTACK_STATE_DIR;
	if (env.XDG_STATE_HOME) return join(env.XDG_STATE_HOME, "astack");
	return env.HOME ? join(env.HOME, ".local", "state", "astack") : undefined;
}

export function sessionFileName(session: string): string | undefined {
	return /^[\w-]{1,128}$/.test(session) ? session : undefined;
}
