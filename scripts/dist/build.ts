import { createHash } from "node:crypto";
import {
	type Marketplace,
	parseMarketplace,
} from "../../src/astack/marketplace.ts";
import { err, ok, type Result } from "../../src/astack/result.ts";
import { ASTACK_RULES } from "../../src/astack/rules.ts";
import type { Plugin } from "./codemods.ts";
import { parseRule, type Rule } from "./flat.ts";
import { type Components, componentsOf } from "./skills.ts";
import { type ByPlugin, ofPlugin, type Source } from "./source.ts";
import { type FileTree, textFile, textOf } from "./tree.ts";

export const PUBLIC_REPO = "vahaah/astack";
export const HOOKS_PATH = "hooks/hooks.json";

export type Build = {
	readonly source: Source;
	readonly marketplace: Marketplace;
	readonly version: string;
	readonly author: string;
	readonly description: string;
	readonly components: ByPlugin<Components>;
	readonly astackSkills: ReadonlySet<string>;
	readonly rules: readonly Rule[];
	readonly licenses: ByPlugin<string>;
	readonly notices: ByPlugin<string>;
	readonly hooksSha256: string;
};

type Manifest = {
	readonly version: string;
	readonly author: string;
	readonly description: string;
};

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function manifestOf(tree: FileTree): Manifest | undefined {
	const entry = tree.get(".claude-plugin/plugin.json");
	if (entry === undefined) return undefined;
	const parsed: unknown = JSON.parse(textOf(entry));
	if (!isRecord(parsed)) return undefined;
	const author = isRecord(parsed.author) ? parsed.author.name : undefined;
	return typeof parsed.version === "string" &&
		typeof author === "string" &&
		typeof parsed.description === "string"
		? { version: parsed.version, author, description: parsed.description }
		: undefined;
}

function fileText(tree: FileTree, path: string): string | undefined {
	const entry = tree.get(path);
	return entry === undefined ? undefined : textOf(entry);
}

export function sha256(bytes: Uint8Array | string): string {
	return createHash("sha256").update(bytes).digest("hex");
}

type Trees = readonly (readonly [Plugin, FileTree])[];

function otherTrees(
	marketplace: Marketplace,
	source: Source,
): Result<Trees, readonly string[]> {
	const errors: string[] = [];
	if (!marketplace.plugins.some(({ name }) => name === "astack"))
		errors.push("marketplace.json lists no astack plugin");
	const others = marketplace.plugins.flatMap(({ name }): Trees => {
		const tree = source.plugins[name];
		if (tree === undefined)
			errors.push(
				`marketplace.json lists ${name}, but marketplace/plugins/${name} is missing`,
			);
		return name === "astack" || tree === undefined ? [] : [[name, tree]];
	});
	return errors.length > 0 ? err(errors) : ok(others);
}

export function prepare(source: Source): Result<Build, readonly string[]> {
	const marketplace = parseMarketplace(source.marketplace);
	if (!marketplace.ok) return err([marketplace.error]);
	const others = otherTrees(marketplace.value, source);
	if (!others.ok) return others;
	const errors: string[] = [];
	const astack = source.plugins.astack;
	const manifest = manifestOf(astack);
	if (manifest === undefined)
		errors.push(
			"marketplace/plugins/astack/.claude-plugin/plugin.json needs version, author.name and description",
		);
	const each = <T>(
		read: (plugin: Plugin, tree: FileTree) => T,
	): ByPlugin<T> => ({
		astack: read("astack", astack),
		...Object.fromEntries(
			others.value.map(([plugin, tree]) => [plugin, read(plugin, tree)]),
		),
	});
	const text = (plugin: Plugin, tree: FileTree, path: string): string => {
		const found = fileText(tree, path);
		if (found === undefined)
			errors.push(`marketplace/plugins/${plugin}/${path} is missing`);
		return found ?? "";
	};
	const licenses = each((plugin, tree) => text(plugin, tree, "LICENSE"));
	const notices = each((plugin, tree) => text(plugin, tree, "NOTICE"));
	const hooks = astack.get(HOOKS_PATH);
	if (hooks === undefined)
		errors.push(`marketplace/plugins/astack/${HOOKS_PATH} is missing`);
	const components = each((plugin, tree) => {
		const found = componentsOf(plugin, tree);
		errors.push(
			...found.errors.map((error) => `marketplace/plugins/${plugin}/${error}`),
		);
		return found;
	});
	const rules: Rule[] = [];
	for (const { name } of ASTACK_RULES)
		if (!source.rules.some((rule) => rule.name === `${name}.md`))
			errors.push(`rules/${name}.md is missing`);
	for (const rule of source.rules) {
		try {
			rules.push(parseRule(rule));
		} catch (error) {
			errors.push(`rules/${rule.name}: ${String(error)}`);
		}
	}
	if (errors.length > 0 || manifest === undefined || hooks === undefined)
		return err(errors);
	return ok({
		source,
		marketplace: marketplace.value,
		version: manifest.version,
		author: manifest.author,
		description: manifest.description,
		components,
		astackSkills: new Set(components.astack.skills.map((skill) => skill.name)),
		rules,
		licenses,
		notices,
		hooksSha256: sha256(hooks.bytes),
	});
}

export function thirdPartyFiles(
	build: Build,
	items: readonly { readonly plugin: Plugin }[],
): FileTree {
	const plugins = new Set(items.map((item) => item.plugin));
	plugins.delete("astack");
	return new Map(
		[...plugins].flatMap((plugin) => [
			[
				`third_party/${plugin}/LICENSE`,
				textFile(ofPlugin(build.licenses, plugin)),
			],
			[
				`third_party/${plugin}/NOTICE`,
				textFile(ofPlugin(build.notices, plugin)),
			],
		]),
	);
}
