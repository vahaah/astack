import { err, ok, type Result } from "./result.ts";

export type HookGroup = "ste" | "types" | "comments";

export type HookConfig = {
	readonly profile?: "strict" | "minimal";
	readonly ste?: boolean;
	readonly types?: boolean;
	readonly comments?: boolean;
};

export type HookPolicy = Readonly<Record<HookGroup, boolean>>;

const STRICT_HOOKS: HookPolicy = { ste: true, types: true, comments: true };
const HOOK_KEYS = ["profile", "ste", "types", "comments"];

export function parseHookConfig(
	value: unknown,
): Result<HookConfig | undefined, readonly string[]> {
	if (value === undefined) return ok(undefined);
	if (typeof value !== "object" || value === null || Array.isArray(value))
		return err(["hooks must be an object"]);
	const profile: unknown = Reflect.get(value, "profile");
	const ste: unknown = Reflect.get(value, "ste");
	const types: unknown = Reflect.get(value, "types");
	const comments: unknown = Reflect.get(value, "comments");
	const problems = Object.keys(value)
		.filter((key) => !HOOK_KEYS.includes(key))
		.map((key) => `hooks.${key} is not a known key`);
	if (profile !== undefined && profile !== "strict" && profile !== "minimal")
		problems.push('hooks.profile must be "strict" or "minimal"');
	for (const [key, flag] of [
		["ste", ste],
		["types", types],
		["comments", comments],
	] as const)
		if (flag !== undefined && typeof flag !== "boolean")
			problems.push(`hooks.${key} must be true or false`);
	return problems.length > 0
		? err(problems)
		: ok({
				...(profile === "strict" || profile === "minimal" ? { profile } : {}),
				...(typeof ste === "boolean" ? { ste } : {}),
				...(typeof types === "boolean" ? { types } : {}),
				...(typeof comments === "boolean" ? { comments } : {}),
			});
}

export function hookPolicy(value: unknown): HookPolicy {
	const parsed = parseHookConfig(value);
	if (!parsed.ok) return STRICT_HOOKS;
	const config = parsed.value;
	const enabled = config?.profile !== "minimal";
	return {
		ste: config?.ste ?? enabled,
		types: config?.types ?? enabled,
		comments: config?.comments ?? enabled,
	};
}
