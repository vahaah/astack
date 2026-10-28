import {
	MARKETPLACE_NAME,
	MARKETPLACE_REPO,
	PLUGIN_IDS,
} from "../../src/astack/marketplace.ts";

export const marketplaceRepoPlaceholder = `<PLACEHOLDER ${MARKETPLACE_REPO}>`;

export const pstackStoreDir = "~/.local/state/pstack";

export function pluginReadRule(configDir: string): string {
	return `Read(${configDir}/plugins/**)`;
}

export const sharedAllowRules = [
	pluginReadRule("~/.claude"),
	"Bash(astack:*)",
	`Edit(${pstackStoreDir}/**)`,
] as const;

function withAllowRules(
	base: Json,
	rules: readonly string[],
): { ok: true; permissions: Json } | { ok: false; reason: string } {
	const permissions = base.permissions ?? {};
	if (!isRecord(permissions))
		return {
			ok: false,
			reason: "permissions in .claude/settings.json is not an object",
		};
	const allow = permissions.allow ?? [];
	if (!Array.isArray(allow))
		return {
			ok: false,
			reason: "permissions.allow in .claude/settings.json is not an array",
		};
	return {
		ok: true,
		permissions: {
			...permissions,
			allow: [...new Set([...allow, ...rules])],
		},
	};
}

type Json = Record<string, unknown>;

export type GithubSource = { source: "github"; repo: string };

export type SettingsMerge =
	| { ok: true; settings: Json; changed: boolean; notes: string[] }
	| { ok: false; reason: string };

function isRecord(value: unknown): value is Json {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isGithubRepo(value: string): boolean {
	return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/.test(
		value,
	);
}

export function githubSource(repo: string): GithubSource {
	return { source: "github", repo };
}

function sameJson(left: unknown, right: unknown): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

function describeSource(source: unknown): string {
	return JSON.stringify(source);
}

export function mergeMarketplaceWiring(
	existing: unknown,
	repo: string,
): SettingsMerge {
	if (!isGithubRepo(repo)) {
		return {
			ok: false,
			reason: `"${repo}" is not a GitHub owner/repo. Tracked settings take a GitHub source only, never a directory or URL.`,
		};
	}
	if (existing !== undefined && !isRecord(existing)) {
		return { ok: false, reason: ".claude/settings.json is not a JSON object" };
	}
	const base: Json = isRecord(existing) ? existing : {};
	const known = base.extraKnownMarketplaces ?? {};
	if (!isRecord(known)) {
		return {
			ok: false,
			reason:
				"extraKnownMarketplaces in .claude/settings.json is not an object",
		};
	}
	const enabled = base.enabledPlugins ?? {};
	if (!isRecord(enabled)) {
		return {
			ok: false,
			reason: "enabledPlugins in .claude/settings.json is not an object",
		};
	}
	const wanted = { source: githubSource(repo) };
	const current = known[MARKETPLACE_NAME];
	if (current !== undefined && !sameJson(current, wanted)) {
		const currentSource = isRecord(current) ? current.source : current;
		return {
			ok: false,
			reason: `.claude/settings.json already declares ${MARKETPLACE_NAME} with source ${describeSource(currentSource)}; refusing to replace it with ${describeSource(wanted.source)}`,
		};
	}
	const notes: string[] = [];
	const nextEnabled: Json = { ...enabled };
	for (const id of PLUGIN_IDS) {
		const value = enabled[id];
		if (value === undefined) {
			nextEnabled[id] = true;
		} else if (value !== true) {
			notes.push(
				`${id} is set to ${JSON.stringify(value)} in the repo; left as it is`,
			);
		}
	}
	const permissions = withAllowRules(base, sharedAllowRules);
	if (!permissions.ok) return permissions;
	const settings: Json = {
		...base,
		extraKnownMarketplaces: { ...known, [MARKETPLACE_NAME]: wanted },
		enabledPlugins: nextEnabled,
		permissions: permissions.permissions,
	};
	return { ok: true, settings, changed: !sameJson(base, settings), notes };
}

export function pendingWiring(): Json {
	return {
		extraKnownMarketplaces: {
			[MARKETPLACE_NAME]: {
				source: githubSource(marketplaceRepoPlaceholder),
			},
		},
		enabledPlugins: Object.fromEntries(PLUGIN_IDS.map((id) => [id, true])),
		permissions: { allow: [...sharedAllowRules] },
	};
}

export function formatSettings(settings: Json): string {
	return `${JSON.stringify(settings, null, 2)}\n`;
}

export function parseSettings(
	text: string | undefined,
): { ok: true; value: unknown } | { ok: false; reason: string } {
	if (text === undefined) return { ok: true, value: undefined };
	try {
		return { ok: true, value: JSON.parse(text) };
	} catch (error) {
		return {
			ok: false,
			reason: `.claude/settings.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}
