import type { Env } from "./process.ts";
export function unattendedReason(env: Env): string | undefined {
	if (env.CLAUDE_CODE_SESSION_ATTENDED === "0")
		return "CLAUDE_CODE_SESSION_ATTENDED=0";
	const entrypoint = env.CLAUDE_CODE_ENTRYPOINT ?? "";
	return entrypoint.startsWith("sdk")
		? `CLAUDE_CODE_ENTRYPOINT=${entrypoint}`
		: undefined;
}

export function sessionAttended(env: Env): boolean {
	return unattendedReason(env) === undefined;
}
