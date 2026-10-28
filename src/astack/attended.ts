export function sessionAttended(
	env: Readonly<Record<string, string | undefined>>,
): boolean {
	if (env.CLAUDE_CODE_SESSION_ATTENDED === "0") return false;
	return !(env.CLAUDE_CODE_ENTRYPOINT ?? "").startsWith("sdk");
}
