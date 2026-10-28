import {
	name,
	plugins,
} from "../../marketplace/.claude-plugin/marketplace.json";
import { err, ok, type Result } from "./result.ts";

export type MarketplacePlugin = {
	readonly name: string;
	readonly source: string;
};

export type Marketplace = {
	readonly name: string;
	readonly plugins: readonly MarketplacePlugin[];
};

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pluginOf(value: unknown): MarketplacePlugin | undefined {
	return isRecord(value) &&
		typeof value.name === "string" &&
		typeof value.source === "string"
		? { name: value.name, source: value.source }
		: undefined;
}

export function parseMarketplace(text: string): Result<Marketplace, string> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		return err(`marketplace.json is not JSON: ${String(error)}`);
	}
	if (
		!isRecord(parsed) ||
		typeof parsed.name !== "string" ||
		!Array.isArray(parsed.plugins)
	)
		return err("marketplace.json needs a name and a plugins array");
	const entries = parsed.plugins.map(pluginOf);
	const listed = entries.filter(
		(entry): entry is MarketplacePlugin => entry !== undefined,
	);
	return listed.length === entries.length
		? ok({ name: parsed.name, plugins: listed })
		: err("each plugin of marketplace.json needs a name and a source");
}

export function pluginIds(marketplace: Marketplace): readonly string[] {
	return marketplace.plugins.map(
		(plugin) => `${plugin.name}@${marketplace.name}`,
	);
}

const MARKETPLACE: Marketplace = { name, plugins };

export const MARKETPLACE_NAME = MARKETPLACE.name;
export const MARKETPLACE_REPO = "vahaah/astack";
export const PLUGIN_IDS = pluginIds(MARKETPLACE);
