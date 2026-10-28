import { originOf, type UpstreamName } from "../lib/upstreams.ts";
import type { Plugin } from "./codemods.ts";
import { type Split, tryFrontmatter, type Values } from "./frontmatter.ts";
import {
	type FileEntry,
	type FileTree,
	isText,
	sortTree,
	textOf,
} from "./tree.ts";

export type Skill = {
	readonly plugin: Plugin;
	readonly name: string;
	readonly values: Values;
	readonly body: string;
	readonly files: FileTree;
	readonly origin: readonly UpstreamName[];
};

export type Agent = {
	readonly plugin: Plugin;
	readonly name: string;
	readonly values: Values;
	readonly body: string;
};

export type Components = {
	readonly skills: readonly Skill[];
	readonly agents: readonly Agent[];
	readonly errors: readonly string[];
};

const SKILL_FILE = /^skills\/([^/]+)\/(.+)$/;
const AGENT_FILE = /^agents\/([^/]+)\.md$/;

function parsed(
	tree: FileTree,
	path: string,
	errors: string[],
): Split | undefined {
	const entry = tree.get(path);
	if (entry === undefined || !isText(entry)) {
		errors.push(`${path}: missing or not text`);
		return undefined;
	}
	const result = tryFrontmatter(textOf(entry), path);
	if (typeof result === "string") {
		errors.push(result);
		return undefined;
	}
	return result;
}

export function componentsOf(plugin: Plugin, tree: FileTree): Components {
	const errors: string[] = [];
	const skillFiles = new Map<string, [string, FileEntry][]>();
	const agentNames: string[] = [];
	for (const [path, entry] of tree) {
		const skill = SKILL_FILE.exec(path);
		if (skill?.[1] && skill[2]) {
			const files = skillFiles.get(skill[1]) ?? [];
			files.push([skill[2], entry]);
			skillFiles.set(skill[1], files);
			continue;
		}
		const agent = AGENT_FILE.exec(path);
		if (agent?.[1]) agentNames.push(agent[1]);
	}
	const skills = [...skillFiles].flatMap(([name, files]): Skill[] => {
		if (!files.some(([relpath]) => relpath === "SKILL.md")) return [];
		const path = `skills/${name}/SKILL.md`;
		const split = parsed(tree, path, errors);
		if (split === undefined) return [];
		const origin = originOf(split.values);
		if (!origin.ok) {
			errors.push(`${path}: ${origin.error}`);
			return [];
		}
		return [
			{
				plugin,
				name,
				values: split.values,
				body: split.body,
				files: sortTree(files),
				origin: origin.value,
			},
		];
	});
	const agents = agentNames.flatMap((name): Agent[] => {
		const split = parsed(tree, `agents/${name}.md`, errors);
		return split === undefined
			? []
			: [{ plugin, name, values: split.values, body: split.body }];
	});
	return { skills, agents, errors };
}

export function isUserOnly(values: Values): boolean {
	return values["disable-model-invocation"] === true;
}
