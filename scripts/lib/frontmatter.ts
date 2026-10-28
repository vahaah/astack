import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { originOf } from "./upstreams.ts";

export const SKILL_KEYS = [
	"name",
	"description",
	"when_to_use",
	"argument-hint",
	"arguments",
	"disable-model-invocation",
	"user-invocable",
	"allowed-tools",
	"disallowed-tools",
	"model",
	"effort",
	"context",
	"agent",
	"background",
	"hooks",
	"paths",
	"shell",
	"metadata",
	"license",
	"compatibility",
] as const;

export const AGENT_KEYS = [
	"name",
	"description",
	"model",
	"effort",
	"maxTurns",
	"tools",
	"disallowedTools",
	"skills",
	"memory",
	"background",
	"omitClaudeMd",
	"isolation",
	"color",
] as const;

export const MODEL_ALIASES = [
	"inherit",
	"sonnet",
	"opus",
	"haiku",
	"fable",
] as const;
export const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const;
const AGENT_COLORS = [
	"red",
	"blue",
	"green",
	"yellow",
	"purple",
	"orange",
	"pink",
	"cyan",
] as const;
const MEMORY_SCOPES = ["user", "project", "local"] as const;
export const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type FrontmatterEntry = { key: string; lines: string[] };

export type FrontmatterDocument = {
	entries: FrontmatterEntry[];
	body: string;
};

export class FrontmatterError extends Error {}

const ENTRY_START = /^([A-Za-z_][\w-]*):(?:\s|$)/;

function isListed(list: readonly string[], value: unknown): boolean {
	return list.some((candidate) => candidate === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseDocument(text: string, path: string): FrontmatterDocument {
	const lines = text.split("\n");
	if (lines[0] !== "---") throw new FrontmatterError(`${path}: no frontmatter`);
	const end = lines.indexOf("---", 1);
	if (end === -1)
		throw new FrontmatterError(`${path}: frontmatter is not closed`);
	const entries: FrontmatterEntry[] = [];
	for (const line of lines.slice(1, end)) {
		const start = ENTRY_START.exec(line);
		if (start?.[1]) {
			entries.push({ key: start[1], lines: [line] });
			continue;
		}
		const current = entries.at(-1);
		if (!current)
			throw new FrontmatterError(`${path}: frontmatter starts with '${line}'`);
		current.lines.push(line);
	}
	return { entries, body: lines.slice(end + 1).join("\n") };
}

export function frontmatterValues(
	doc: FrontmatterDocument,
	path: string,
): Record<string, unknown> {
	const yaml = doc.entries.flatMap((entry) => entry.lines).join("\n");
	let parsed: unknown;
	try {
		parsed = Bun.YAML.parse(yaml);
	} catch (error) {
		throw new FrontmatterError(
			`${path}: frontmatter is not valid YAML: ${String(error)}`,
		);
	}
	if (parsed === null || parsed === undefined) return {};
	if (!isRecord(parsed)) {
		throw new FrontmatterError(`${path}: frontmatter is not a mapping`);
	}
	return parsed;
}

function isStringList(value: unknown): boolean {
	return (
		Array.isArray(value) && value.every((item) => typeof item === "string")
	);
}

function checkCommon(
	values: Record<string, unknown>,
	path: string,
	errors: string[],
): void {
	if (
		typeof values.description !== "string" ||
		values.description.trim() === ""
	) {
		errors.push(`${path}: description must be a non-empty string`);
	}
	const model = values.model;
	if (
		model !== undefined &&
		!(
			typeof model === "string" &&
			(isListed(MODEL_ALIASES, model) || /^claude-[a-z0-9-]+$/.test(model))
		)
	) {
		errors.push(
			`${path}: model ${JSON.stringify(model)} is not one of ${MODEL_ALIASES.join(", ")} or a claude-* id`,
		);
	}
	const effort = values.effort;
	if (effort !== undefined && !isListed(EFFORT_LEVELS, effort)) {
		errors.push(
			`${path}: effort ${JSON.stringify(effort)} is not one of ${EFFORT_LEVELS.join(", ")}`,
		);
	}
	if (
		values.background !== undefined &&
		typeof values.background !== "boolean"
	) {
		errors.push(`${path}: background must be a boolean`);
	}
}

export function validateSkillFrontmatter(
	values: Record<string, unknown>,
	dirName: string,
): string[] {
	const path = `skills/${dirName}/SKILL.md`;
	const errors: string[] = [];
	for (const key of Object.keys(values)) {
		if (!isListed(SKILL_KEYS, key))
			errors.push(`${path}: unknown skill key '${key}'`);
	}
	if (values.name !== dirName) {
		errors.push(
			`${path}: name ${JSON.stringify(values.name)} must equal the directory name '${dirName}'`,
		);
	}
	if (!KEBAB_CASE.test(dirName))
		errors.push(`${path}: directory name is not kebab-case`);
	checkCommon(values, path, errors);
	for (const key of ["disable-model-invocation", "user-invocable"]) {
		if (values[key] !== undefined && typeof values[key] !== "boolean") {
			errors.push(`${path}: ${key} must be a boolean`);
		}
	}
	const paths = values.paths;
	if (
		paths !== undefined &&
		typeof paths !== "string" &&
		!isStringList(paths)
	) {
		errors.push(`${path}: paths must be a string or a list of strings`);
	}
	if (values.context !== undefined && values.context !== "fork") {
		errors.push(`${path}: context must be 'fork'`);
	}
	const origin = originOf(values);
	if (!origin.ok) errors.push(`${path}: ${origin.error}`);
	return errors;
}

export function validateAgentFrontmatter(
	values: Record<string, unknown>,
	stem: string,
): string[] {
	const path = `agents/${stem}.md`;
	const errors: string[] = [];
	for (const key of Object.keys(values)) {
		if (!isListed(AGENT_KEYS, key))
			errors.push(`${path}: unknown agent key '${key}'`);
	}
	if (values.name !== stem) {
		errors.push(
			`${path}: name ${JSON.stringify(values.name)} must equal the file name '${stem}'`,
		);
	}
	if (typeof values.name === "string" && !KEBAB_CASE.test(values.name)) {
		errors.push(`${path}: name is not kebab-case`);
	}
	checkCommon(values, path, errors);
	for (const key of ["tools", "disallowedTools", "skills"]) {
		const value = values[key];
		if (
			value !== undefined &&
			typeof value !== "string" &&
			!isStringList(value)
		) {
			errors.push(
				`${path}: ${key} must be a comma-separated string or a list of strings`,
			);
		}
	}
	const maxTurns = values.maxTurns;
	if (
		maxTurns !== undefined &&
		!(
			typeof maxTurns === "number" &&
			Number.isInteger(maxTurns) &&
			maxTurns > 0
		)
	) {
		errors.push(`${path}: maxTurns must be a positive integer`);
	}
	if (values.memory !== undefined && !isListed(MEMORY_SCOPES, values.memory)) {
		errors.push(`${path}: memory must be one of ${MEMORY_SCOPES.join(", ")}`);
	}
	if (
		values.omitClaudeMd !== undefined &&
		typeof values.omitClaudeMd !== "boolean"
	) {
		errors.push(`${path}: omitClaudeMd must be a boolean`);
	}
	if (values.isolation !== undefined && values.isolation !== "worktree") {
		errors.push(`${path}: isolation must be 'worktree'`);
	}
	if (values.color !== undefined && !isListed(AGENT_COLORS, values.color)) {
		errors.push(`${path}: color must be one of ${AGENT_COLORS.join(", ")}`);
	}
	return errors;
}

export type PluginComponent = {
	kind: "skill" | "agent";
	name: string;
	file: string;
};

function isFile(path: string): boolean {
	return existsSync(path) && statSync(path).isFile();
}

function namesIn(dir: string): string[] {
	return existsSync(dir) ? readdirSync(dir).sort() : [];
}

export function listComponents(pluginRoot: string): PluginComponent[] {
	const components: PluginComponent[] = [];
	const skillsDir = join(pluginRoot, "skills");
	for (const dirName of namesIn(skillsDir)) {
		const file = join(skillsDir, dirName, "SKILL.md");
		if (isFile(file)) components.push({ kind: "skill", name: dirName, file });
	}
	const agentsDir = join(pluginRoot, "agents");
	for (const fileName of namesIn(agentsDir)) {
		const file = join(agentsDir, fileName);
		if (fileName.endsWith(".md") && isFile(file)) {
			components.push({ kind: "agent", name: basename(fileName, ".md"), file });
		}
	}
	return components;
}

export function readComponentValues(
	component: PluginComponent,
): Record<string, unknown> {
	const text = readFileSync(component.file, "utf8");
	return frontmatterValues(parseDocument(text, component.file), component.file);
}

export function validateTree(pluginRoot: string): string[] {
	const errors: string[] = [];
	for (const component of listComponents(pluginRoot)) {
		try {
			const values = readComponentValues(component);
			errors.push(
				...(component.kind === "skill"
					? validateSkillFrontmatter(values, component.name)
					: validateAgentFrontmatter(values, component.name)),
			);
		} catch (error) {
			if (!(error instanceof FrontmatterError)) throw error;
			errors.push(error.message);
		}
	}
	return errors;
}
