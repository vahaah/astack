import {
	PATH_ORIGINS,
	UPSTREAM_NAMES,
	UPSTREAMS,
	type UpstreamName,
} from "../lib/upstreams.ts";
import { type Build, PUBLIC_REPO } from "./build.ts";
import { emits } from "./capability.ts";
import {
	type FlatContext,
	flatName,
	PLUGIN_CLI,
	type Plugin,
	toFlat,
} from "./codemods.ts";
import {
	type FieldValue,
	renderFrontmatter,
	splitFrontmatter,
	stringList,
	stringValue,
} from "./frontmatter.ts";
import { type Agent, isUserOnly, type Skill } from "./skills.ts";
import { type ByPlugin, ofPlugin, type RuleFile } from "./source.ts";
import {
	type FileEntry,
	type FileTree,
	isText,
	sortTree,
	textFile,
	textOf,
} from "./tree.ts";

export type FlatTarget = "cursor" | "grok-bot" | "agentskills";

type Named = { readonly plugin: Plugin; readonly name: string };

export type Flat<T extends Named> = T & { readonly flat: string };

export function flatSkills(
	build: Build,
	target: FlatTarget,
): readonly Flat<Skill>[] {
	return emits("astack-skills", target)
		? build.components.astack.skills.map((skill) => ({
				...skill,
				flat: flatName(skill.name),
			}))
		: [];
}

export function flatAgents(
	build: Build,
	target: FlatTarget,
): readonly Flat<Agent>[] {
	return emits("agents", target)
		? build.components.astack.agents.map((agent) => ({
				...agent,
				flat: flatName(agent.name),
			}))
		: [];
}

export type FlatBuild = {
	readonly target: FlatTarget;
	readonly version: string;
	readonly astackSkills: ReadonlySet<string>;
	readonly licenses: ByPlugin<string>;
};

function upstreamsOf(skill: Skill): readonly UpstreamName[] {
	return skill.origin;
}

function rulesUpstreams(rules: readonly Rule[]): readonly UpstreamName[] {
	const named = new Set(
		rules.flatMap((rule) => PATH_ORIGINS[`rules/${rule.name}.md`] ?? []),
	);
	return UPSTREAM_NAMES.filter((name) => named.has(name));
}

function sourceLabel(skill: Skill): string {
	const upstreams = upstreamsOf(skill);
	const label = skill.plugin;
	return upstreams.length === 0
		? label
		: `${label}, adapted from ${upstreams.map((name) => UPSTREAMS[name].label).join(" and ")}`;
}

export function skillLicense(skill: Skill, base: string): string {
	return licenseWith(base, upstreamsOf(skill));
}

function licenseWith(base: string, upstreams: readonly UpstreamName[]): string {
	if (upstreams.length === 0) return base;
	return [
		base.trimEnd(),
		"",
		"This skill includes material adapted from these projects, each under the MIT License above:",
		"",
		...upstreams.map(
			(name) => `- ${UPSTREAMS[name].label}, ${UPSTREAMS[name].copyright}`,
		),
		"",
	].join("\n");
}

export function packageCli(version: string): string {
	return `bunx github:${PUBLIC_REPO}#v${version}`;
}

function context(build: FlatBuild, owner: FlatContext["owner"]): FlatContext {
	return {
		owner,
		astackSkills: build.astackSkills,
		cli: build.target === "cursor" ? PLUGIN_CLI : packageCli(build.version),
	};
}

function metadata(
	skill: Skill,
	build: FlatBuild,
): Readonly<Record<string, string>> | undefined {
	switch (build.target) {
		case "cursor":
			return undefined;
		case "grok-bot":
			return { "astack-version": build.version };
		case "agentskills":
			return {
				"astack-version": build.version,
				source: sourceLabel(skill),
				...(isUserOnly(skill.values)
					? { "disable-model-invocation": "true" }
					: {}),
			};
	}
}

function skillFields(
	skill: Flat<Skill>,
	build: FlatBuild,
): (readonly [string, FieldValue | undefined])[] {
	const description = toFlat(
		stringValue(skill.values, "description") ?? "",
		context(build, skill.plugin),
	);
	const userOnly =
		build.target !== "agentskills" && isUserOnly(skill.values)
			? true
			: undefined;
	return [
		["name", skill.flat],
		["description", description],
		["license", build.target === "agentskills" ? "MIT" : undefined],
		["disable-model-invocation", userOnly],
		["metadata", metadata(skill, build)],
	];
}

function flatFile(
	relpath: string,
	entry: FileEntry,
	skill: Skill,
	build: FlatBuild,
): FileEntry {
	if (!relpath.endsWith(".md") || !isText(entry)) return entry;
	return textFile(
		toFlat(textOf(entry), context(build, skill.plugin)),
		entry.executable,
	);
}

export function flatSkill(skill: Flat<Skill>, build: FlatBuild): FileTree {
	const folder = `skills/${skill.flat}`;
	const body = toFlat(skill.body, context(build, skill.plugin));
	const files: [string, FileEntry][] = [...skill.files].map(
		([relpath, entry]) => [
			`${folder}/${relpath}`,
			relpath === "SKILL.md"
				? textFile(renderFrontmatter(skillFields(skill, build), body))
				: flatFile(relpath, entry, skill, build),
		],
	);
	const license: [string, FileEntry][] =
		build.target === "cursor"
			? []
			: [
					[
						`${folder}/LICENSE.txt`,
						textFile(
							skillLicense(skill, ofPlugin(build.licenses, skill.plugin)),
						),
					],
				];
	return sortTree([...files, ...license]);
}

const WRITE_TOOLS = ["Write", "Edit", "MultiEdit", "NotebookEdit"];

export function flatAgent(agent: Flat<Agent>, build: FlatBuild): FileTree {
	const tools = stringValue(agent.values, "tools")
		?.split(",")
		.map((tool) => tool.trim());
	const readonly =
		tools !== undefined && !tools.some((tool) => WRITE_TOOLS.includes(tool));
	return new Map([
		[
			`agents/${agent.flat}.md`,
			textFile(
				renderFrontmatter(
					[
						["name", agent.flat],
						[
							"description",
							toFlat(
								stringValue(agent.values, "description") ?? "",
								context(build, agent.plugin),
							),
						],
						["model", "inherit"],
						["readonly", readonly ? true : undefined],
					],
					toFlat(agent.body, context(build, agent.plugin)),
				),
			),
		],
	]);
}

export type Rule = {
	readonly name: string;
	readonly title: string;
	readonly globs: readonly string[];
	readonly body: string;
};

function titleOf(body: string, fallback: string): string {
	const heading = body.split("\n").find((line) => line.startsWith("# "));
	return heading === undefined ? fallback : heading.slice(2).trim();
}

export function parseRule(rule: RuleFile): Rule {
	const split = splitFrontmatter(rule.text, `rules/${rule.name}`);
	const base = rule.name.replace(/\.md$/, "");
	return {
		name: base,
		title: titleOf(split.body, base),
		globs: stringList(split.values, "paths"),
		body: split.body.replace(/^\n+/, ""),
	};
}

export function ruleBody(rule: Rule, build: FlatBuild): string {
	return toFlat(rule.body, context(build, "rules"));
}

export function cursorRuleName(rule: Rule): string {
	return rule.name === "astack" ? "astack" : `astack-${rule.name}`;
}

export function ruleDescription(rule: Rule): string {
	return rule.name === "astack"
		? "The astack rule card: routes and standing rules for every session."
		: `astack rules for ${rule.title.toLowerCase()}.`;
}

export function cursorRule(rule: Rule, build: FlatBuild): FileTree {
	const scoped = rule.globs.length > 0;
	return new Map([
		[
			`rules/${cursorRuleName(rule)}.mdc`,
			textFile(
				renderFrontmatter(
					[
						["description", ruleDescription(rule)],
						["globs", scoped ? rule.globs.join(",") : undefined],
						["alwaysApply", !scoped],
					],
					ruleBody(rule, build),
				),
			),
		],
	]);
}

export function demote(body: string): string {
	return body.replace(/^(#{1,5}) /gm, "#$1 ");
}

export function scopeLine(rule: Rule): string | undefined {
	return rule.globs.length === 0
		? undefined
		: `This section applies to files that match ${rule.globs.map((glob) => `\`${glob}\``).join(", ")}.`;
}

export function rulesSkill(
	rules: readonly Rule[],
	build: FlatBuild,
	description: string,
	skills: readonly string[] = [],
): FileTree {
	const sections = rules.map((rule) =>
		[scopeLine(rule), demote(ruleBody(rule, build)).trimEnd()]
			.filter((part): part is string => part !== undefined)
			.join("\n\n"),
	);
	const body = [
		"",
		"# astack rules",
		"",
		...sections.map((s) => `${s}\n`),
	].join("\n");
	return new Map([
		[
			"skills/astack-rules/LICENSE.txt",
			textFile(licenseWith(build.licenses.astack, rulesUpstreams(rules))),
		],
		[
			"skills/astack-rules/SKILL.md",
			textFile(
				renderFrontmatter(
					[
						["name", "astack-rules"],
						["description", description],
						[
							"metadata",
							{
								"astack-version": build.version,
								...(skills.length > 0
									? { "astack-skills": [...skills].sort().join(",") }
									: {}),
							},
						],
					],
					body,
				),
			),
		],
	]);
}
