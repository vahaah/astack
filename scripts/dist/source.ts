import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseMarketplace } from "../../src/astack/marketplace.ts";
import { ASTACK_RULES } from "../../src/astack/rules.ts";
import type { Plugin } from "./codemods.ts";
import { type FileTree, readTree, textOf } from "./tree.ts";

export type ByPlugin<T> = Readonly<{ astack: T } & Record<Plugin, T>>;

export function ofPlugin<T>(values: ByPlugin<T>, plugin: Plugin): T {
	const value = values[plugin];
	if (value === undefined)
		throw new Error(`the build holds no plugin ${plugin}`);
	return value;
}

export type RuleFile = { readonly name: string; readonly text: string };

export type Source = {
	readonly marketplace: string;
	readonly plugins: ByPlugin<FileTree>;
	readonly rules: readonly RuleFile[];
	readonly bundle: string;
};

export type SourcePaths = {
	readonly marketplace: string;
	readonly rules: string;
};

export const RULE_ORDER = ASTACK_RULES.map(({ name }) => `${name}.md`);

function ruleRank(name: string): number {
	const rank = RULE_ORDER.indexOf(name);
	return rank === -1 ? RULE_ORDER.length : rank;
}

export function sortRules(names: readonly string[]): string[] {
	return [...names].sort(
		(a, b) => ruleRank(a) - ruleRank(b) || (a < b ? -1 : a > b ? 1 : 0),
	);
}

export function readSource(paths: SourcePaths): Source {
	const manifest = join(
		paths.marketplace,
		".claude-plugin",
		"marketplace.json",
	);
	const marketplace = readFileSync(manifest, "utf8");
	const parsed = parseMarketplace(marketplace);
	if (!parsed.ok) throw new Error(`${manifest}: ${parsed.error}`);
	const trees: Record<Plugin, FileTree> = Object.fromEntries(
		parsed.value.plugins.map((plugin) => [
			plugin.name,
			readTree(join(paths.marketplace, plugin.source)),
		]),
	);
	const astack = trees.astack;
	if (astack === undefined)
		throw new Error(`${manifest} lists no astack plugin`);
	const bundle = astack.get("bin/astack.js");
	if (bundle === undefined)
		throw new Error(
			"the astack plugin has no bin/astack.js. Run bun run bundle",
		);
	const rules = existsSync(paths.rules)
		? sortRules(
				readdirSync(paths.rules).filter((name) => name.endsWith(".md")),
			).map((name) => ({
				name,
				text: readFileSync(join(paths.rules, name), "utf8"),
			}))
		: [];
	return {
		marketplace,
		plugins: { ...trees, astack },
		rules,
		bundle: textOf(bundle),
	};
}
