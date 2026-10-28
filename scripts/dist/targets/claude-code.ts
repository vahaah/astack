import { createHash } from "node:crypto";
import type { Build } from "../build.ts";
import { emits } from "../capability.ts";
import type { Plugin } from "../codemods.ts";
import { isUserOnly } from "../skills.ts";
import { ofPlugin } from "../source.ts";
import { type FileTree, mount, textFile, textOf, union } from "../tree.ts";

export const CLAUDE_ROOT = "claude-code";

export const CODEX_POLICY = "policy:\n  allow_implicit_invocation: false\n";

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function rewriteMarketplace(text: string): string {
	const parsed: unknown = JSON.parse(text);
	if (!isRecord(parsed) || !Array.isArray(parsed.plugins))
		throw new Error("marketplace.json has no plugins array");
	const plugins = parsed.plugins.map((entry: unknown) =>
		isRecord(entry) && typeof entry.source === "string"
			? {
					...entry,
					source: entry.source.replace(/^\.\/plugins\//, `./${CLAUDE_ROOT}/`),
				}
			: entry,
	);
	return `${JSON.stringify({ ...parsed, plugins }, null, "\t")}\n`;
}

export const MANIFEST = ".claude-plugin/plugin.json";

export function buildStamp(tree: FileTree): string {
	const hash = createHash("sha256");
	for (const [path, entry] of tree) {
		if (path === MANIFEST) continue;
		hash.update(`${path}\0${entry.executable ? "x" : "-"}\0`);
		hash.update(entry.bytes);
		hash.update("\0");
	}
	return hash.digest("hex").slice(0, 12);
}

export function stampedPlugin(tree: FileTree): FileTree {
	const manifest = tree.get(MANIFEST);
	if (manifest === undefined) return tree;
	const parsed: unknown = JSON.parse(textOf(manifest));
	if (!isRecord(parsed) || typeof parsed.version !== "string")
		throw new Error(`${MANIFEST} has no version`);
	const version = `${parsed.version.replace(/\+.*$/, "")}+${buildStamp(tree)}`;
	return new Map([
		...tree,
		[
			MANIFEST,
			textFile(`${JSON.stringify({ ...parsed, version }, null, "\t")}\n`),
		],
	]);
}

export function claudePlugin(build: Build, plugin: Plugin): FileTree {
	const tree = ofPlugin(build.source.plugins, plugin);
	return plugin === "astack" ? stampedPlugin(tree) : tree;
}

export function codexPolicyPath(skill: string): string {
	return `skills/${skill}/agents/openai.yaml`;
}

function codexPolicies(build: Build, plugin: Plugin): FileTree {
	const tree = ofPlugin(build.source.plugins, plugin);
	return new Map(
		ofPlugin(build.components, plugin)
			.skills.filter((skill) => isUserOnly(skill.values))
			.map((skill) => codexPolicyPath(skill.name))
			.filter((path) => !tree.has(path))
			.map((path) => [path, textFile(CODEX_POLICY)]),
	);
}

export const RULES_ROOT = "rules";

export function ruleFiles(build: Build): FileTree {
	return new Map(
		build.source.rules.map((rule) => [
			`${RULES_ROOT}/${rule.name}`,
			textFile(rule.text),
		]),
	);
}

export function claudeCodeTarget(build: Build): FileTree {
	return union([
		new Map([
			[
				".claude-plugin/marketplace.json",
				textFile(rewriteMarketplace(build.source.marketplace)),
			],
		]),
		...(emits("rule-card", "claude-code") ? [ruleFiles(build)] : []),
		...build.marketplace.plugins.map(({ name: plugin }) =>
			mount(
				`${CLAUDE_ROOT}/${plugin}`,
				union([claudePlugin(build, plugin), codexPolicies(build, plugin)]),
			),
		),
	]);
}
