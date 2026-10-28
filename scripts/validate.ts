import {
	existsSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, normalize, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { parseMarketplace } from "../src/astack/marketplace.ts";
import { err, ok, type Result } from "../src/astack/result.ts";
import { findingLine } from "../src/astack/ste/format.ts";
import { loadSettings } from "../src/astack/ste/profile.ts";
import { componentOrigin, componentPath } from "./build.ts";
import { companionPaths, exampleCompanion } from "./lib/companion.ts";
import { displayPath, listFiles, REPO_ROOT } from "./lib/files.ts";
import {
	FrontmatterError,
	listComponents,
	type PluginComponent,
	parseDocument,
	readComponentValues,
	validateTree,
} from "./lib/frontmatter.ts";
import { skillBodyIssues } from "./lib/skill-shape.ts";
import {
	EXEMPTIONS,
	ownTextReport,
	readOwnText,
	renderedTextReport,
} from "./lib/ste-own.ts";
import type { UpstreamName } from "./lib/upstreams.ts";

export type ResidualPattern = { id: string; pattern: RegExp };

export const RESIDUAL_PATTERNS: readonly ResidualPattern[] = [
	{ id: "cursor-path", pattern: /\.cursor\b/ },
	{ id: "cursor-product", pattern: /\bCursor\b/ },
	{ id: "cursor-agent-cli", pattern: /\bcursor-agent\b/ },
	{ id: "general-purpose-spelling", pattern: /\bgeneralPurpose\b/ },
	{ id: "ask-question-tool", pattern: /\bAskQuestion\b/ },
	{ id: "todo-tool", pattern: /\btodo_write\b|\bTodoWrite\b/ },
	{
		id: "task-tool",
		pattern: /`Task`|\bTask (?:tool|subagents?|spawns?|calls?|schema)\b/,
	},
	{ id: "always-apply", pattern: /\balwaysApply\b/ },
	{ id: "mdc-rule", pattern: /\.mdc\b/ },
	{ id: "grok-model", pattern: /\bgrok(?!_PLUGIN_ROOT\b)/i },
	{ id: "composer-model", pattern: /\bcomposer-/i },
	{
		id: "origin-forge",
		pattern: /\bOrigin\b|\borigin pr\b|\bcommand -v origin\b/,
	},
	{ id: "bugbot", pattern: /bugbot/i },
	{ id: "create-skill", pattern: /\bcreate-skill\b/ },
	{ id: "add-plugin", pattern: /\/add-plugin\b/ },
	{ id: "custom-mode", pattern: /\bCustom Modes?\b/i },
	{ id: "agents-window", pattern: /\bAgents Window\b/i },
	{ id: "cloud-agent", pattern: /\bcloud agents?\b/i },
	{
		id: "cloud-environment",
		pattern: /\benvironment: ?"(?:cloud|local)"|\bcloud_base_branch\b/,
	},
	{
		id: "readonly-mode",
		pattern:
			/\breadonly: ?(?:true|false)\b|\bAsk mode\b|\breadonly strips\b|\bagent mode\b/,
	},
	{ id: "cursor-transcripts", pattern: /\bagent-transcripts\b/ },
	{ id: "cursor-agent-store", pattern: /\bagent store\b/ },
	{ id: "speed-ladder", pattern: /\bfast or standard speed\b/ },
	{ id: "monorepo-path", pattern: /\bpstack\/skills\// },
	{ id: "cursor-docs", pattern: /\bcursor\.com\b/ },
	{ id: "in-cloud", pattern: /\/in-cloud\b/ },
	{
		id: "cursor-automations",
		pattern: /\bcursor automations?\b|`\/?automate`|\bAutomations editor\b/i,
	},
	{ id: "cursor-slack-tools", pattern: /\bSendSlackMessage\b|\bPostToSlack\b/ },
	{
		id: "cursor-projects",
		pattern: /\bCursor Projects?\b|\bcloud subagents?\b/i,
	},
];

export const FLOW_RESIDUAL_PATTERNS: readonly ResidualPattern[] = [
	{ id: "upstream-setup-name", pattern: /\bsetup-matt-pocock-skills\b/ },
	{ id: "glossary-file", pattern: /\bGLOSSARY(?:-MAP)?\.md\b/ },
	{ id: "codex-metadata", pattern: /\bopenai\.yaml\b/ },
	{
		id: "explore-agent",
		pattern: /subagent_type["'`]?\s*[:=]\s*["'`]?Explore\b/,
	},
	{ id: "pr-skill", pattern: /(?<![\w./:-])\/pr(?![\w/-])/ },
];

export function bareSlashPattern(
	plugin: string,
	skills: Iterable<string>,
): ResidualPattern {
	const names = [...skills].sort((a, b) => b.length - a.length);
	return {
		id: `bare-${plugin}-slash`,
		pattern:
			names.length === 0
				? /(?!)/
				: new RegExp(`(?<![\\w./:-])/(?:${names.join("|")})(?![\\w/:-])`),
	};
}

const RESIDUAL_SKIPPED_FILES = new Set(["LICENSE", "NOTICE", "bin/astack.js"]);
export const BUILT_IN_AGENTS = [
	"general-purpose",
	"Explore",
	"Plan",
	"claude",
	"statusline-setup",
	"fork",
];

export type Severity = "error" | "warning";
export type Finding = {
	severity: Severity;
	file?: string;
	line?: number;
	message: string;
};
export type CheckResult = {
	id: string;
	title: string;
	findings: Finding[];
	summary: string[];
	skipped?: boolean;
};

export type AllowEntry = {
	glob: string;
	regex: RegExp;
	reason: string;
	lineNumber: number;
	used: number;
};

export function parseAllowFile(text: string): {
	entries: AllowEntry[];
	errors: string[];
} {
	const entries: AllowEntry[] = [];
	const errors: string[] = [];
	text.split("\n").forEach((raw, index) => {
		const line = raw.trim();
		if (line === "" || line.startsWith("#")) return;
		const first = line.indexOf(":");
		const last = line.lastIndexOf(":");
		const glob = line.slice(0, first);
		const source = line.slice(first + 1, last);
		const reason = line.slice(last + 1).trim();
		if (
			first === -1 ||
			first === last ||
			glob === "" ||
			source === "" ||
			reason === ""
		) {
			errors.push(
				`residuals.allow:${index + 1}: expected <relpath glob>:<regex>:<reason>`,
			);
			return;
		}
		try {
			entries.push({
				glob,
				regex: new RegExp(source),
				reason,
				lineNumber: index + 1,
				used: 0,
			});
		} catch (error) {
			errors.push(`residuals.allow:${index + 1}: bad regex: ${String(error)}`);
		}
	});
	return { entries, errors };
}

export type Residual = {
	relpath: string;
	line: number;
	patternId: string;
	text: string;
	index: number;
};

function isText(bytes: Buffer): boolean {
	return !bytes.subarray(0, 8000).includes(0);
}

export function scanResiduals(
	root: string,
	patterns: readonly ResidualPattern[] = RESIDUAL_PATTERNS,
	relpaths: readonly string[] = listFiles(root),
): Residual[] {
	const residuals: Residual[] = [];
	for (const relpath of relpaths) {
		if (RESIDUAL_SKIPPED_FILES.has(relpath)) continue;
		const bytes = readFileSync(join(root, relpath));
		if (!isText(bytes)) continue;
		bytes
			.toString("utf8")
			.split("\n")
			.forEach((text, index) => {
				for (const { id, pattern } of patterns) {
					const match = pattern.exec(text);
					if (match)
						residuals.push({
							relpath,
							line: index + 1,
							patternId: id,
							text,
							index: match.index,
						});
				}
			});
	}
	return residuals;
}

export function applyAllowlist(
	residuals: Residual[],
	entries: AllowEntry[],
): { unallowed: Residual[]; allowed: Residual[] } {
	const unallowed: Residual[] = [];
	const allowed: Residual[] = [];
	for (const residual of residuals) {
		const entry = entries.find(
			(candidate) =>
				new Bun.Glob(candidate.glob).match(residual.relpath) &&
				candidate.regex.test(residual.text),
		);
		if (entry) {
			entry.used++;
			allowed.push(residual);
		} else {
			unallowed.push(residual);
		}
	}
	return { unallowed, allowed };
}

export function residualGroup(relpath: string): string {
	const [top, skill, sub] = relpath.split("/");
	if (top !== "skills" || skill === undefined) return relpath;
	if (skill.startsWith("principle-")) return "skills/principle-*";
	if (skill === "poteto-mode" && sub !== undefined && sub !== "SKILL.md")
		return `skills/poteto-mode/${sub}/`;
	if (skill === "poteto-mode") return relpath;
	return `skills/${skill}/`;
}

function excerpt(text: string, index: number): string {
	const start = Math.max(0, index - 40);
	const snippet = text.slice(start, start + 110).trim();
	return `${start > 0 ? "..." : ""}${snippet}${start + 110 < text.length ? "..." : ""}`;
}

function countBy<T>(items: T[], key: (item: T) => string): Map<string, number> {
	const counts = new Map<string, number>();
	for (const item of items)
		counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
	return counts;
}

function formatCounts(counts: Map<string, number>): string {
	return [...counts.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.map(([id, count]) => `${id} ${count}`)
		.join(", ");
}

export type ResidualCheck = {
	patterns: readonly ResidualPattern[];
	id: string;
	title: string;
};

const CURSOR_RESIDUALS: ResidualCheck = {
	patterns: RESIDUAL_PATTERNS,
	id: "residuals",
	title: "residual Cursor-isms",
};

export type ResidualScope = {
	readonly plugin: Plugin;
	readonly files: readonly string[];
};

export function checkResiduals(
	scopes: readonly ResidualScope[],
	allowFile: string,
	check: ResidualCheck = CURSOR_RESIDUALS,
): CheckResult {
	const findings: Finding[] = [];
	const summary: string[] = [];
	const allowText = existsSync(allowFile)
		? readFileSync(allowFile, "utf8")
		: "";
	const { entries, errors } = parseAllowFile(allowText);
	for (const error of errors)
		findings.push({ severity: "error", message: error });
	for (const { plugin, files } of scopes) {
		const residuals = scanResiduals(plugin.root, check.patterns, files);
		const { unallowed, allowed } = applyAllowlist(residuals, entries);
		summary.push(
			`${plugin.name}: ${unallowed.length} unallowed in ${new Set(unallowed.map((r) => r.relpath)).size} files, ${allowed.length} allowed`,
		);
		if (unallowed.length > 0) {
			summary.push(`  workload by group (${plugin.name}):`);
			const groups = new Map<string, Residual[]>();
			for (const residual of unallowed) {
				const group = residualGroup(residual.relpath);
				groups.set(group, [...(groups.get(group) ?? []), residual]);
			}
			const sorted = [...groups.entries()].sort((a, b) =>
				a[0].localeCompare(b[0]),
			);
			for (const [group, items] of sorted) {
				summary.push(
					`    ${group.padEnd(44)} ${String(items.length).padStart(4)}  ${formatCounts(countBy(items, (r) => r.patternId))}`,
				);
			}
			summary.push(
				`  by pattern (${plugin.name}): ${formatCounts(countBy(unallowed, (r) => r.patternId))}`,
			);
		}
		for (const residual of unallowed) {
			findings.push({
				severity: "error",
				file: `${plugin.name}/${residual.relpath}`,
				line: residual.line,
				message: `${residual.patternId}: ${excerpt(residual.text, residual.index)}`,
			});
		}
	}
	for (const entry of entries) {
		if (entry.used === 0) {
			findings.push({
				severity: "warning",
				message: `residuals.allow:${entry.lineNumber}: entry ${entry.glob}:${entry.regex.source} matches nothing`,
			});
		}
	}
	return { id: check.id, title: check.title, findings, summary };
}

export type Plugin = { name: string; root: string };

export type Item = {
	readonly plugin: Plugin;
	readonly kind: PluginComponent["kind"];
	readonly name: string;
	readonly path: string;
	readonly origin: readonly UpstreamName[];
};

export const FLOW_ORIGIN = "mattpocock-skills" satisfies UpstreamName;

export function originItems(plugins: readonly Plugin[]): {
	readonly items: readonly Item[];
	readonly errors: readonly string[];
} {
	const items: Item[] = [];
	const errors: string[] = [];
	for (const plugin of plugins) {
		for (const component of listComponents(plugin.root)) {
			const origin = componentOrigin(component);
			if (!origin.ok) {
				errors.push(
					`${plugin.name}/${relative(plugin.root, component.file)}: ${origin.error}`,
				);
				continue;
			}
			items.push({
				plugin,
				kind: component.kind,
				name: component.name,
				path: relative(plugin.root, componentPath(component)),
				origin: origin.value,
			});
		}
	}
	return { items, errors };
}

export function isFlowItem(item: Item): boolean {
	return (
		item.origin.length > 0 &&
		item.origin.every((upstream) => upstream === FLOW_ORIGIN)
	);
}

function itemScopes(
	plugins: readonly Plugin[],
	items: readonly Item[],
): ResidualScope[] {
	return plugins.flatMap((plugin) => {
		const held = items.filter((item) => item.plugin === plugin);
		const files = listFiles(plugin.root).filter((relpath) =>
			held.some(
				(item) => relpath === item.path || relpath.startsWith(`${item.path}/`),
			),
		);
		return files.length === 0 ? [] : [{ plugin, files }];
	});
}

function flowChecks(
	plugins: readonly Plugin[],
	items: readonly Item[],
	catalog: Catalog,
	allowFile: string,
): CheckResult[] {
	const flowItems = items.filter(isFlowItem);
	const scopes = itemScopes(plugins, flowItems);
	if (scopes.length === 0) return [];
	const skills = flowItems
		.filter((item) => item.kind === "skill")
		.map((item) => item.name);
	return [
		checkResiduals(scopes, allowFile, {
			patterns: [...FLOW_RESIDUAL_PATTERNS, bareSlashPattern("flow", skills)],
			id: "flow-residuals",
			title: "residual upstream names in flow",
		}),
		...scopes.map(({ plugin, files }) =>
			checkSkillToolCallees(
				linesOf(
					plugin.root,
					plugin.name,
					files.filter((relpath) => relpath.endsWith(".md")),
				),
				plugin.name,
				catalog,
			),
		),
	];
}

type Catalog = Map<
	string,
	{ skills: Map<string, { dmi: boolean }>; agents: Set<string> }
>;

export function buildCatalog(plugins: Plugin[]): Catalog {
	const catalog: Catalog = new Map();
	for (const plugin of plugins) {
		const skills = new Map<string, { dmi: boolean }>();
		const agents = new Set<string>();
		for (const component of listComponents(plugin.root)) {
			let values: Record<string, unknown> = {};
			try {
				values = readComponentValues(component);
			} catch {}
			const name =
				typeof values.name === "string" ? values.name : component.name;
			if (component.kind === "skill")
				skills.set(name, { dmi: values["disable-model-invocation"] === true });
			else agents.add(name);
		}
		catalog.set(plugin.name, { skills, agents });
	}
	return catalog;
}

function markdownFiles(root: string): string[] {
	if (!existsSync(root)) return [];
	return listFiles(root).filter((relpath) => relpath.endsWith(".md"));
}

type Line = { file: string; relpath: string; line: number; text: string };

function linesOf(root: string, label: string, relpaths: string[]): Line[] {
	return relpaths.flatMap((relpath) =>
		readFileSync(join(root, relpath), "utf8")
			.split("\n")
			.map((text, index) => ({
				file: `${label}/${relpath}`,
				relpath,
				line: index + 1,
				text,
			})),
	);
}

const SUBAGENT_TYPE =
	/subagent_type["'`]?\s*[:=]\s*["'`]?([A-Za-z][\w.:<>-]*)/g;

export function resolveSubagentType(
	value: string,
	catalog: Catalog,
): Finding["severity"] | "ok" {
	if (value.includes("<") || BUILT_IN_AGENTS.includes(value)) return "ok";
	const [plugin = "", agent, ...rest] = value.split(":");
	if (agent === undefined || rest.length > 0) return "error";
	const entry = catalog.get(plugin);
	if (!entry) return "warning";
	return entry.agents.has(agent) ? "ok" : "error";
}

export function checkSubagentTypes(
	lines: Line[],
	catalog: Catalog,
): CheckResult {
	const findings: Finding[] = [];
	let seen = 0;
	for (const line of lines) {
		for (const match of line.text.matchAll(SUBAGENT_TYPE)) {
			const value = match[1] ?? "";
			seen++;
			const severity = resolveSubagentType(value, catalog);
			if (severity === "ok") continue;
			const where = { file: line.file, line: line.line };
			if (severity === "warning") {
				findings.push({
					severity,
					...where,
					message: `subagent_type ${value} names a plugin outside this marketplace, so it cannot be checked`,
				});
				continue;
			}
			const hint = value.includes(":")
				? ""
				: " (plugin agents need <plugin>:<agent>)";
			findings.push({
				severity,
				...where,
				message: `subagent_type ${value} is not a built-in or a plugin agent${hint}`,
			});
		}
	}
	return {
		id: "subagent-types",
		title: "subagent_type values resolve",
		findings,
		summary: [`${seen} subagent_type values checked`],
	};
}

const SKILL_DIR_REF = /\$\{CLAUDE_SKILL_DIR\}([^\s`'"()\\]*)/g;
const PLUGIN_ROOT_REF = /\$\{CLAUDE_PLUGIN_ROOT\}([^\s`'"()\\]*)/g;
const SKILL_BODY = /^skills\/([^/]+)\/SKILL\.md$/;
const AGENT_BODY = /^agents\/[^/]+\.md$/;

function cleanRefPath(raw: string): string | undefined {
	const trimmed = raw.replace(/[.,;:]+$/, "");
	if (/[<>*{}[\]]/.test(trimmed) || trimmed === "") return undefined;
	return trimmed;
}

function insidePlugin(root: string, target: string): boolean {
	const rel = relative(root, target);
	return rel !== "" && !rel.startsWith("..") && !rel.startsWith(sep);
}

function checkTarget(
	plugin: Plugin,
	line: Line,
	reference: string,
	target: string,
): Finding[] {
	const where = { file: line.file, line: line.line };
	if (!insidePlugin(plugin.root, normalize(target))) {
		return [
			{
				severity: "warning",
				...where,
				message: `${reference} points outside the ${plugin.name} plugin, so it cannot be checked`,
			},
		];
	}
	if (!existsSync(target))
		return [{ severity: "error", ...where, message: `missing ${reference}` }];
	return [];
}

export function checkPaths(plugins: Plugin[]): CheckResult {
	const findings: Finding[] = [];
	let seen = 0;
	for (const plugin of plugins) {
		const files = existsSync(plugin.root)
			? listFiles(plugin.root).filter(
					(relpath) => relpath.endsWith(".md") || relpath.endsWith(".json"),
				)
			: [];
		for (const line of linesOf(plugin.root, plugin.name, files)) {
			const skillBody = SKILL_BODY.exec(line.relpath);
			for (const match of line.text.matchAll(SKILL_DIR_REF)) {
				seen++;
				if (!skillBody?.[1]) {
					findings.push({
						severity: "error",
						file: line.file,
						line: line.line,
						message: `\${CLAUDE_SKILL_DIR} is substituted only in SKILL.md bodies; use \${CLAUDE_PLUGIN_ROOT} in agents`,
					});
					continue;
				}
				const path = cleanRefPath(match[1] ?? "");
				if (path === undefined) continue;
				findings.push(
					...checkTarget(
						plugin,
						line,
						match[0],
						join(plugin.root, "skills", skillBody[1], path),
					),
				);
			}
			for (const match of line.text.matchAll(PLUGIN_ROOT_REF)) {
				seen++;
				const path = cleanRefPath(match[1] ?? "");
				if (path !== undefined)
					findings.push(
						...checkTarget(plugin, line, match[0], join(plugin.root, path)),
					);
				if (
					line.relpath.endsWith(".md") &&
					!skillBody &&
					!AGENT_BODY.test(line.relpath)
				) {
					findings.push({
						severity: "warning",
						file: line.file,
						line: line.line,
						message: `\${CLAUDE_PLUGIN_ROOT} stays literal in a file read by path`,
					});
				}
			}
		}
	}
	return {
		id: "paths",
		title: "plugin paths exist",
		findings,
		summary: [`${seen} path references checked`],
	};
}

const MARKDOWN_LINK = /\]\(([^)\s]+)\)/g;

export function relativeLinkTarget(target: string): string | undefined {
	if (/^[a-z][\w+.-]*:|^#|[<>{}$*]/i.test(target)) return undefined;
	const path = target.split(/[#?]/)[0] ?? "";
	return /[/.]/.test(path) ? path : undefined;
}

const CODE_FENCE = /^\s*(?:```|~~~)/;

export function outsideCodeFences(lines: Line[]): Line[] {
	const kept: Line[] = [];
	let file = "";
	let fenced = false;
	for (const line of lines) {
		if (line.file !== file) {
			file = line.file;
			fenced = false;
		}
		if (CODE_FENCE.test(line.text)) {
			fenced = !fenced;
			continue;
		}
		if (!fenced) kept.push(line);
	}
	return kept;
}

export function checkLinks(plugins: Plugin[]): CheckResult {
	const findings: Finding[] = [];
	let seen = 0;
	for (const plugin of plugins) {
		for (const line of outsideCodeFences(
			linesOf(plugin.root, plugin.name, markdownFiles(plugin.root)),
		)) {
			for (const match of line.text.matchAll(MARKDOWN_LINK)) {
				const path = relativeLinkTarget(match[1] ?? "");
				if (path === undefined) continue;
				seen++;
				const target = normalize(join(plugin.root, line.relpath, "..", path));
				const where = { file: line.file, line: line.line };
				if (!insidePlugin(plugin.root, target))
					findings.push({
						severity: "error",
						...where,
						message: `link ${match[1]} points outside the ${plugin.name} plugin`,
					});
				else if (!existsSync(target))
					findings.push({
						severity: "error",
						...where,
						message: `link ${match[1]} has no target`,
					});
			}
		}
	}
	return {
		id: "links",
		title: "relative Markdown links resolve",
		findings,
		summary: [`${seen} relative links checked`],
	};
}

const PLUGIN_NAME_REF =
	/(?<![\w./-])\/?(pstack|astack|flow):([a-z0-9]+(?:-[a-z0-9]+)*)/g;
const RETIRED_NAMESPACE =
	/(?<![\w./-])(?:[/$])?(pstack|flow)\s*:(?=[a-z0-9<'"`$])/g;

function joinedSkillNames(text: string): string {
	const joined = text.replace(/(["'`])\s*\+\s*(["'`])/g, (match) =>
		"\n".repeat(match.split("\n").length - 1),
	);
	let resolved = joined;
	for (const match of joined.matchAll(
		/(?<![\w$])([A-Za-z_$][\w$]*)\s*=\s*(["'`])(pstack|flow)\2/g,
	)) {
		const [, variable, , namespace] = match;
		if (variable === undefined || namespace === undefined) continue;
		const identifier = variable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		resolved = resolved
			.replace(new RegExp(`\\$?\\{\\s*${identifier}\\s*\\}`, "g"), namespace)
			.replace(
				new RegExp(`(?<![\\w$])${identifier}(?![\\w$])(?=\\s*\\+)`, "g"),
				JSON.stringify(namespace),
			);
	}
	return resolved.replace(/(["'`])\s*\+\s*(["'`])/g, (match) =>
		"\n".repeat(match.split("\n").length - 1),
	);
}

export function checkOldSkillNames(lines: Line[]): CheckResult {
	const findings: Finding[] = [];
	for (const [file, source] of Map.groupBy(lines, (line) => line.file)) {
		const text = joinedSkillNames(source.map((line) => line.text).join("\n"));
		const seen = new Set<string>();
		for (const match of text.matchAll(RETIRED_NAMESPACE)) {
			const namespace = match[1];
			const line = text.slice(0, match.index).split("\n").length;
			const key = `${namespace}:${line}`;
			if (seen.has(key)) continue;
			seen.add(key);
			findings.push({
				severity: "error",
				file,
				line,
				message: `${namespace} skill namespace is retired. Use astack:<name>.`,
			});
		}
	}
	return {
		id: "old-skill-names",
		title: "no retired skill namespace calls",
		findings,
		summary: [`${new Set(lines.map((line) => line.file)).size} files checked`],
	};
}

const MENTIONS_SKILL_TOOL =
	/\bSkill tool\b|\bSkill\s*\(|`Skill`|\bvia (?:the )?Skill\b/;

const MODEL_ACTION =
	/\b(?:run|runs|running|use|uses|using|invoke|invokes|invoking|call|calls|calling|load|loads|loading)\b(?:\s+[\w'"-]+){0,2}\s+[`"']?$/i;
const USER_FACING =
	/\b(?:the user|a user|the maintainer|the operator|suggests?|by path|skill-path|types?|use for)\b/i;
const USER_FACING_FILES =
	/^(?:pstack\/guide\/|pstack\/skills\/poteto-help\/|flow\/skills\/ask-matt\/)/;

export function modelRunsDmi(line: Line, index: number): boolean {
	if (USER_FACING_FILES.test(line.file)) return false;
	if (USER_FACING.test(line.text)) return false;
	return MODEL_ACTION.test(line.text.slice(Math.max(0, index - 48), index));
}

export function checkPluginNames(lines: Line[], catalog: Catalog): CheckResult {
	const findings: Finding[] = [];
	let seen = 0;
	for (const line of lines) {
		for (const match of line.text.matchAll(PLUGIN_NAME_REF)) {
			seen++;
			const [, plugin = "", name = ""] = match;
			const entry = catalog.get(plugin);
			if (!entry) {
				findings.push({
					severity: "error",
					file: line.file,
					line: line.line,
					message: `${plugin}:${name}: no plugin ${plugin}`,
				});
				continue;
			}
			const skill = entry.skills.get(name);
			if (!skill && !entry.agents.has(name)) {
				findings.push({
					severity: "error",
					file: line.file,
					line: line.line,
					message: `${plugin}:${name} is not a skill or agent in ${plugin}`,
				});
				continue;
			}
			if (skill?.dmi && MENTIONS_SKILL_TOOL.test(line.text)) {
				findings.push({
					severity: "error",
					file: line.file,
					line: line.line,
					message: `${plugin}:${name} has disable-model-invocation, so the Skill tool refuses it; read its SKILL.md by path instead`,
				});
			} else if (skill?.dmi && modelRunsDmi(line, match.index ?? 0)) {
				findings.push({
					severity: "error",
					file: line.file,
					line: line.line,
					message: `${plugin}:${name} has disable-model-invocation, so the model cannot run it; say to read its SKILL.md by path (astack skill-path ${plugin}:${name}), or that the user runs it`,
				});
			}
		}
	}
	return {
		id: "plugin-names",
		title: "astack:<name> names exist",
		findings,
		summary: [`${seen} references checked`],
	};
}

export function checkBareSlashCommands(
	lines: Line[],
	plugin: string,
	catalog: Catalog,
): CheckResult {
	const { pattern } = bareSlashPattern(
		plugin,
		catalog.get(plugin)?.skills.keys() ?? [],
	);
	const findings: Finding[] = [];
	let seen = 0;
	for (const line of lines) {
		if (!line.file.startsWith(`${plugin}/`) || /^\s*#/.test(line.text))
			continue;
		seen++;
		const match = pattern.exec(line.text);
		if (match)
			findings.push({
				severity: "error",
				file: line.file,
				line: line.line,
				message: `${match[0]} is a bare slash command; name it /${plugin}:${match[0].slice(1)}`,
			});
	}
	return {
		id: `${plugin}-slash-commands`,
		title: `slash commands in ${plugin} name their plugin outside headings`,
		findings,
		summary: [`${seen} lines checked`],
	};
}

const SIBLING_REF = /(?<![\w./-])\/?(?:astack|pstack):[a-z0-9-]+/;
const FALLBACK_CUE =
	/\b(?:when|if|once|with|without|unless)\b[^.]*\b(?:astack|pstack)\b|\belse\b|\botherwise\b|\binstalled\b|\babsent\b/i;
const ROUTER_FILES = /^flow\/skills\/ask-matt\//;

export function checkSiblingFallbacks(lines: Line[]): CheckResult {
	const findings: Finding[] = [];
	let seen = 0;
	for (const line of lines) {
		if (!line.file.startsWith("flow/skills/") || ROUTER_FILES.test(line.file))
			continue;
		if (!SIBLING_REF.test(line.text)) continue;
		seen++;
		if (!FALLBACK_CUE.test(line.text))
			findings.push({
				severity: "error",
				file: line.file,
				line: line.line,
				message:
					"flow names astack or pstack here without saying what to do when that plugin is absent",
			});
	}
	return {
		id: "flow-fallbacks",
		title: "flow says what to do when astack or pstack is absent",
		findings,
		summary: [`${seen} lines that name astack or pstack checked`],
	};
}

const QUOTED_NAME = /["`]([a-z0-9]+(?:-[a-z0-9]+)*)["`]/g;

export function checkSkillToolCallees(
	lines: Line[],
	plugin: string,
	catalog: Catalog,
): CheckResult {
	const findings: Finding[] = [];
	const skills = catalog.get(plugin)?.skills ?? new Map();
	let seen = 0;
	for (const line of lines) {
		if (!MENTIONS_SKILL_TOOL.test(line.text)) continue;
		for (const match of line.text.matchAll(QUOTED_NAME)) {
			const name = match[1] ?? "";
			if (!skills.has(name)) continue;
			seen++;
			findings.push({
				severity: "error",
				file: line.file,
				line: line.line,
				message: `"${name}" is a bare skill name in a Skill tool call; name it ${plugin}:${name}`,
			});
		}
	}
	return {
		id: "skill-tool-callees",
		title: `Skill tool calls in ${plugin} name their plugin`,
		findings,
		summary: [`${seen} bare callees found`],
	};
}

export function checkFrontmatter(plugins: Plugin[]): CheckResult {
	const findings: Finding[] = [];
	const summary: string[] = [];
	for (const plugin of plugins) {
		const errors = existsSync(plugin.root) ? validateTree(plugin.root) : [];
		summary.push(
			`${plugin.name}: ${listComponents(plugin.root).length} skills and agents checked`,
		);
		for (const message of errors)
			findings.push({
				severity: "error",
				message: `${plugin.name}/${message}`,
			});
	}
	return { id: "frontmatter", title: "frontmatter schema", findings, summary };
}

export function checkSkillShapes(plugins: readonly Plugin[]): CheckResult {
	const findings: Finding[] = [];
	let checked = 0;
	for (const plugin of plugins) {
		for (const component of listComponents(plugin.root)) {
			if (component.kind !== "skill") continue;
			checked++;
			const file = `${plugin.name}/skills/${component.name}/SKILL.md`;
			try {
				const text = readFileSync(component.file, "utf8");
				const { body } = parseDocument(text, file);
				for (const message of skillBodyIssues(body))
					findings.push({ severity: "error", file, message });
			} catch (error) {
				if (!(error instanceof FrontmatterError)) throw error;
				findings.push({ severity: "error", file, message: error.message });
			}
		}
	}
	if (checked === 0)
		findings.push({
			severity: "error",
			message: "No skill entry points were found for body validation.",
		});
	return {
		id: "skill-shape",
		title: "skill body shape",
		findings,
		summary: [`${checked} skill entry points checked`],
	};
}

export function checkOwnSte(root: string): CheckResult {
	const read = readOwnText(root);
	const report = ownTextReport(read.sources, loadSettings(root).glossary);
	const rendered = renderedTextReport(
		root,
		companionPaths(exampleCompanion(root)).projects,
	);
	const findings: Finding[] = [
		...[...read.errors, ...report.errors, ...rendered.errors].map(
			({ path, message }): Finding => ({
				severity: "error",
				file: path,
				message,
			}),
		),
		...[...report.findings, ...rendered.findings].map(
			({ path, finding }): Finding => ({
				severity: "error",
				file: path,
				message: findingLine(finding),
			}),
		),
	];
	return {
		id: "ste-own-text",
		title: "astack's own text against the ASD-STE100 deny rules",
		findings,
		summary: [
			`${report.files} files and ${report.descriptions} frontmatter descriptions checked`,
			`${rendered.files} files that apply renders for the projects examined`,
			...EXEMPTIONS.map((exemption) => `exempt: ${exemption}`),
			...(findings.length > 0
				? [
						"Fix each sentence at its source, never in a generated file. `bun src/astack/cli/bin.ts check-ste <file>` shows the findings of one file.",
						"The source of a file that apply renders is in scripts/lib/flow-config.ts or scripts/lib/render.ts.",
					]
				: []),
		],
	};
}

function run(
	command: string[],
	cwd: string,
	timeoutMs: number,
	env: Record<string, string> = {},
) {
	const result = Bun.spawnSync(command, {
		cwd,
		env: { ...process.env, ...env },
		stdout: "pipe",
		stderr: "pipe",
		timeout: timeoutMs,
	});
	return {
		exitCode: result.exitCode,
		stdout: result.stdout.toString(),
		stderr: result.stderr.toString(),
	};
}

export function checkClaudeValidate(dirs: string[]): CheckResult {
	const findings: Finding[] = [];
	const summary: string[] = [];
	for (const dir of dirs) {
		const result = run(
			["claude", "plugin", "validate", dir, "--strict"],
			REPO_ROOT,
			60_000,
		);
		const output = `${result.stdout}${result.stderr}`.trim();
		summary.push(`${displayPath(dir)}: exit ${result.exitCode}`);
		if (result.exitCode !== 0) {
			findings.push({
				severity: "error",
				file: dir,
				message: `claude plugin validate --strict failed:\n${output}`,
			});
		}
	}
	return {
		id: "claude-validate",
		title: "claude plugin validate --strict",
		findings,
		summary,
	};
}

export function pluginLogPattern(plugins: Plugin[]): RegExp {
	const names = plugins.map((plugin) => plugin.name).join("|");
	return new RegExp(
		`\\bplugin "?(?:${names})\\b|\\b(?:${names})(?:@|:)|"(?:${names})"`,
	);
}

export function loadGateFindings(
	debugLog: string,
	plugins: Plugin[],
): { findings: Finding[]; summary: string[] } {
	const findings: Finding[] = [];
	const summary: string[] = [];
	const paths = plugins.flatMap((plugin) => {
		const variants = [resolve(plugin.root)];
		try {
			variants.push(realpathSync(plugin.root));
		} catch {}
		return variants;
	});
	const names = pluginLogPattern(plugins);
	const lines = debugLog.split("\n");
	for (const line of lines) {
		if (!/\[(?:WARN|ERROR)\]/.test(line)) continue;
		if (paths.some((path) => line.includes(path)) || names.test(line)) {
			findings.push({ severity: "error", message: line.trim() });
		}
	}
	for (const plugin of plugins) {
		const components = listComponents(plugin.root);
		for (const kind of ["skill", "agent"] as const) {
			const expected = components.filter(
				(component) => component.kind === kind,
			).length;
			const loaded = new RegExp(
				`Loaded (\\d+) ${kind}s from plugin ${plugin.name} default directory`,
			);
			const match = lines
				.map((line) => loaded.exec(line))
				.find((found) => found !== null);
			const actual = match ? Number(match[1]) : undefined;
			summary.push(
				`${plugin.name}: loaded ${actual ?? "no"} ${kind}s, expected ${expected}`,
			);
			if (expected > 0 && actual !== expected) {
				findings.push({
					severity: "error",
					message: `${plugin.name}: loaded ${actual ?? 0} ${kind}s, expected ${expected}`,
				});
			}
		}
	}
	return { findings, summary };
}

export function loadGateIsolated(
	env: Record<string, string | undefined>,
): boolean {
	return Boolean(env.ANTHROPIC_API_KEY || env.CLAUDE_CODE_OAUTH_TOKEN);
}

const LOAD_GATE_TITLE = "load gate (claude -p --plugin-dir ... --debug-file)";

export function skippedLoadGate(): CheckResult {
	return {
		id: "load-gate",
		title: LOAD_GATE_TITLE,
		findings: [],
		summary: [
			"no ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN is set, so the gate does not run against your own config",
		],
		skipped: true,
	};
}

export function checkLoadGate(plugins: Plugin[]): CheckResult {
	if (!loadGateIsolated(process.env)) return skippedLoadGate();
	const project = mkdtempSync(join(tmpdir(), "astack-load-gate-"));
	const debugFile = join(project, "debug.log");
	try {
		const command = [
			"claude",
			"-p",
			...plugins.flatMap((plugin) => ["--plugin-dir", plugin.root]),
			"--model",
			"haiku",
			"--no-session-persistence",
			"--setting-sources",
			"project,local",
			"--strict-mcp-config",
			"--debug-file",
			debugFile,
			"Reply OK",
		];
		const result = run(command, project, 180_000, {
			CLAUDE_CODE_PLUGIN_CACHE_DIR: join(project, "plugins"),
			CLAUDE_CONFIG_DIR: join(project, "config"),
		});
		const debugLog = existsSync(debugFile)
			? readFileSync(debugFile, "utf8")
			: "";
		const { findings, summary } = loadGateFindings(debugLog, plugins);
		summary.unshift(
			`claude -p exit ${result.exitCode}, reply ${JSON.stringify(result.stdout.trim().slice(0, 40))}`,
			"config: a temporary CLAUDE_CONFIG_DIR, so the run leaves nothing in yours",
		);
		if (result.exitCode !== 0) {
			findings.push({
				severity: "error",
				message: `claude -p failed:\n${result.stderr.trim()}`,
			});
		}
		if (debugLog === "")
			findings.push({
				severity: "error",
				message: "claude -p wrote no debug log",
			});
		return {
			id: "load-gate",
			title: LOAD_GATE_TITLE,
			findings,
			summary,
		};
	} finally {
		rmSync(project, { recursive: true, force: true });
	}
}

function formatReport(results: CheckResult[]): {
	text: string;
	errors: number;
	warnings: number;
} {
	const out: string[] = [];
	let errors = 0;
	let warnings = 0;
	for (const result of results) {
		const errorCount = result.findings.filter(
			(finding) => finding.severity === "error",
		).length;
		const warningCount = result.findings.length - errorCount;
		errors += errorCount;
		warnings += warningCount;
		const status = result.skipped
			? "SKIP"
			: errorCount > 0
				? "FAIL"
				: warningCount > 0
					? "WARN"
					: "PASS";
		out.push(
			`${status} ${result.title}${errorCount + warningCount > 0 ? ` (${errorCount} errors, ${warningCount} warnings)` : ""}`,
		);
		for (const line of result.summary) out.push(`  ${line}`);
		const byFile = new Map<string, Finding[]>();
		for (const finding of result.findings) {
			const key = finding.file ?? "";
			byFile.set(key, [...(byFile.get(key) ?? []), finding]);
		}
		for (const [file, findings] of byFile) {
			if (file !== "") out.push(`  ${file}`);
			for (const finding of findings) {
				const prefix = finding.severity === "warning" ? "warning: " : "";
				const where = finding.line === undefined ? "" : `${finding.line}: `;
				const indent = file === "" ? "  " : "    ";
				out.push(
					`${indent}${where}${prefix}${finding.message.replaceAll("\n", `\n${indent}  `)}`,
				);
			}
		}
		out.push("");
	}
	out.push(`validate: ${errors} errors, ${warnings} warnings`);
	return { text: out.join("\n"), errors, warnings };
}

export function marketplacePlugins(
	marketplace: string,
): Result<Plugin[], string> {
	const manifest = join(marketplace, ".claude-plugin", "marketplace.json");
	if (!existsSync(manifest)) return err(`${manifest} is missing`);
	const parsed = parseMarketplace(readFileSync(manifest, "utf8"));
	return parsed.ok
		? ok(
				parsed.value.plugins.map(({ name, source }) => ({
					name,
					root: join(marketplace, source),
				})),
			)
		: err(`${manifest}: ${parsed.error}`);
}

export function validate(options: {
	marketplace: string;
	allowFile: string;
	flowAllowFile: string;
	rulesDir: string;
	steRoot?: string;
	claude: boolean;
}): { text: string; errors: number; warnings: number } {
	const listed = marketplacePlugins(options.marketplace);
	const plugins = listed.ok ? listed.value : [];
	const checked = plugins.filter((plugin) => existsSync(plugin.root));
	const { pstack, flow } = Object.fromEntries(
		checked.map((plugin) => [plugin.name, plugin]),
	);
	const catalog = buildCatalog(checked);
	const lines = [
		...checked.flatMap((plugin) =>
			linesOf(plugin.root, plugin.name, markdownFiles(plugin.root)),
		),
		...linesOf(options.rulesDir, "rules", markdownFiles(options.rulesDir)),
	];
	const results: CheckResult[] = listed.ok
		? []
		: [
				{
					id: "marketplace",
					title: "the marketplace manifest",
					findings: [{ severity: "error", message: listed.error }],
					summary: [],
				},
			];
	const missing = plugins.filter(
		(plugin) => !existsSync(join(plugin.root, ".claude-plugin", "plugin.json")),
	);
	if (missing.length > 0) {
		results.push({
			id: "plugins",
			title: "plugin directories",
			findings: missing.map((plugin) => ({
				severity: "error",
				message: `${plugin.root} has no .claude-plugin/plugin.json`,
			})),
			summary: [],
		});
	}
	results.push(
		checkResiduals(
			checked.map((plugin) => ({ plugin, files: listFiles(plugin.root) })),
			options.allowFile,
		),
	);
	results.push(
		...flowChecks(
			checked,
			originItems(checked).items,
			catalog,
			options.flowAllowFile,
		),
	);
	if (flow) results.push(checkSiblingFallbacks(lines));
	if (pstack) results.push(checkBareSlashCommands(lines, "pstack", catalog));
	results.push(checkSubagentTypes(lines, catalog));
	results.push(checkPaths(checked));
	results.push(checkLinks(checked));
	results.push(checkOldSkillNames(lines));
	results.push(checkPluginNames(lines, catalog));
	results.push(checkFrontmatter(checked));
	results.push(checkSkillShapes(checked));
	if (options.steRoot !== undefined) results.push(checkOwnSte(options.steRoot));
	if (options.claude) {
		results.push(
			checkClaudeValidate([
				options.marketplace,
				...checked.map((plugin) => plugin.root),
			]),
		);
		results.push(checkLoadGate(checked));
	}
	return formatReport(results);
}

const USAGE = `usage: bun scripts/validate.ts [--marketplace <dir>] [--no-claude]

Checks each plugin that the marketplace manifest lists (default marketplace/):
residual Cursor-isms minus scripts/lib/residuals/pstack.allow, residual upstream names
in flow minus scripts/lib/residuals/flow.allow, bare Skill tool callees in flow,
subagent_type values, plugin paths, relative Markdown links, retired skill namespace calls,
astack:<name> names, frontmatter, skill body shape, the ASD-STE100 deny rules on astack's own text, claude plugin
validate --strict, and a load gate.
--no-claude skips the last two.`;

function main(): number {
	const { values } = parseArgs({
		options: {
			marketplace: { type: "string" },
			"no-claude": { type: "boolean" },
			help: { type: "boolean", short: "h" },
		},
	});
	if (values.help) {
		console.log(USAGE);
		return 0;
	}
	const report = validate({
		marketplace: resolve(values.marketplace ?? join(REPO_ROOT, "marketplace")),
		allowFile: join(REPO_ROOT, "scripts/lib/residuals/pstack.allow"),
		flowAllowFile: join(REPO_ROOT, "scripts/lib/residuals/flow.allow"),
		rulesDir: join(REPO_ROOT, "rules"),
		steRoot: REPO_ROOT,
		claude: !values["no-claude"],
	});
	console.log(report.text);
	return report.errors > 0 ? 1 : 0;
}

if (import.meta.main) process.exit(main());
