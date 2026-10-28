import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { err, ok, type Result } from "../../src/astack/result.ts";
import { checkText, denied } from "../../src/astack/ste/check.ts";
import { glossaryOf, parseSteProfile } from "../../src/astack/ste/profile.ts";
import type { Finding, Glossary } from "../../src/astack/ste/types.ts";
import { stringValue, tryFrontmatter } from "../dist/frontmatter.ts";
import { projectNames, validateProjectConfig } from "./projects.ts";
import {
	type Artifact,
	type RuleSource,
	readRuleSources,
	renderWouldBeArtifacts,
} from "./render.ts";
import { exemptEntries, exemptPaths, STE_EXEMPT_DIR } from "./ste-exempt.ts";

export const OWN_TEXT_ROOTS: readonly string[] = [
	"marketplace/plugins/astack",
	"rules",
	"docs",
	"templates",
	"examples",
];
export const OWN_TEXT_FILES: readonly string[] = [
	"README.md",
	"AGENTS.md",
	"CONTRIBUTING.md",
	"SECURITY.md",
];
export const COMMENTS_RULE = "rules/comments.md";
const QUOTED_HEADINGS: readonly string[] = [
	"Keep clauses",
	"Suppressions",
	"Claims that a comment must stay",
	"Long justifications",
];
const COPIES: ReadonlySet<string> = new Set(["rules/astack.md"]);

export const EXEMPTIONS: readonly string[] = [
	`each file that a list file in ${STE_EXEMPT_DIR}/ names: moved upstream text with deny findings`,
	"the four sections of rules/comments.md that quote pstack's Comment Sicko verbatim",
	"rules/astack.md: a copy of skills/mode/references/card.md, which the gate checks",
	"the rule copies and the review copies that apply renders: the gate examines their text at the source",
];

export type OwnSource = { readonly path: string; readonly text: string };

export type OwnFinding = { readonly path: string; readonly finding: Finding };

export type OwnError = { readonly path: string; readonly message: string };

export type OwnReport = {
	readonly files: number;
	readonly descriptions: number;
	readonly findings: readonly OwnFinding[];
	readonly errors: readonly OwnError[];
};

type Section = {
	readonly heading: string;
	readonly from: number;
	readonly to: number;
};

function quotedRanges(
	lines: readonly string[],
): Result<readonly Section[], string> {
	const starts = lines.flatMap((line, index) =>
		line.startsWith("## ") ? [{ heading: line.slice(3), index }] : [],
	);
	const sections = starts.map(({ heading, index }, position) => ({
		heading,
		from: index + 1,
		to: starts[position + 1]?.index ?? lines.length,
	}));
	const broken = QUOTED_HEADINGS.find(
		(heading) =>
			sections.filter((section) => section.heading === heading).length !== 1,
	);
	return broken === undefined
		? ok(sections.filter(({ heading }) => QUOTED_HEADINGS.includes(heading)))
		: err(`${COMMENTS_RULE} must hold exactly one "## ${broken}" section.`);
}

export function quotedSections(
	text: string,
): Result<readonly string[], string> {
	const lines = text.split("\n");
	const ranges = quotedRanges(lines);
	return ranges.ok
		? ok(
				ranges.value.map(({ from, to }) =>
					lines.slice(from, to).join("\n").trim(),
				),
			)
		: ranges;
}

export function withoutQuotedSections(text: string): Result<string, string> {
	const lines = text.split("\n");
	const ranges = quotedRanges(lines);
	if (!ranges.ok) return ranges;
	return ok(
		lines
			.map((line, index) =>
				ranges.value.some(({ from, to }) => index >= from && index < to)
					? ""
					: line,
			)
			.join("\n"),
	);
}

function denyFindings(text: string, glossary: Glossary): readonly Finding[] {
	return denied(
		checkText(text, { surface: "doc", enforcement: "deny", glossary }),
	);
}

function descriptionFindings(
	source: OwnSource,
	glossary: Glossary,
): Result<readonly Finding[] | undefined, string> {
	const split = tryFrontmatter(source.text, source.path);
	if (typeof split === "string") return err(split);
	const description = stringValue(split.values, "description");
	if (description === undefined) return ok(undefined);
	const line =
		source.text.split("\n").findIndex((text) => /^description:/.test(text)) + 1;
	return ok(
		denyFindings(description, glossary).map((finding) => ({
			...finding,
			line: line + finding.line - 1,
		})),
	);
}

export function ownTextReport(
	sources: readonly OwnSource[],
	glossary: Glossary,
): OwnReport {
	const checked = sources.map((source) => ({
		source,
		body: denyFindings(source.text, glossary),
		description: descriptionFindings(source, glossary),
	}));
	return {
		files: sources.length,
		descriptions: checked.filter(
			({ description }) => description.ok && description.value !== undefined,
		).length,
		findings: checked.flatMap(({ source, body, description }) =>
			[...body, ...(description.ok ? (description.value ?? []) : [])].map(
				(finding) => ({ path: source.path, finding }),
			),
		),
		errors: checked.flatMap(({ source, description }) =>
			description.ok ? [] : [{ path: source.path, message: description.error }],
		),
	};
}

function markdownUnder(root: string, dir: string): readonly string[] {
	const absolute = join(root, dir);
	if (!existsSync(absolute)) return [];
	return readdirSync(absolute).flatMap((name) => {
		if (name === "node_modules") return [];
		const path = join(absolute, name);
		if (statSync(path).isDirectory())
			return markdownUnder(root, relative(root, path));
		return /\.md$/i.test(name) ? [relative(root, path)] : [];
	});
}

export function ownTextPaths(root: string): readonly string[] {
	const exempt = new Set(exemptPaths(root));
	return [
		...OWN_TEXT_FILES.filter((path) => existsSync(join(root, path))),
		...OWN_TEXT_ROOTS.flatMap((dir) => markdownUnder(root, dir)),
	]
		.filter((path) => !COPIES.has(path) && !exempt.has(path))
		.sort();
}

export function exemptProblems(
	root: string,
	glossary: Glossary,
	copiedFrom: (text: string) => readonly string[],
): readonly string[] {
	return exemptEntries(root).flatMap(({ list, path, origin }) => {
		const where = `${list}: ${path}`;
		if (!existsSync(join(root, path))) return [`${where} does not exist`];
		if (!origin.ok) return [`${where}: ${origin.error}`];
		const text = readFileSync(join(root, path), "utf8");
		if (ownTextReport([{ path, text }], glossary).findings.length === 0)
			return [`${where} has 0 deny findings, so it must leave the list`];
		const copied = copiedFrom(text);
		return origin.value.some((upstream) => copied.includes(upstream))
			? []
			: [
					`${where} shares no run of words with its item origin "${origin.value.join(" ")}"`,
				];
	});
}

function sourceAt(root: string, path: string): Result<OwnSource, OwnError> {
	const text = readFileSync(join(root, path), "utf8");
	if (path !== COMMENTS_RULE) return ok({ path, text });
	const frame = withoutQuotedSections(text);
	return frame.ok
		? ok({ path, text: frame.value })
		: err({ path, message: frame.error });
}

export function readOwnText(root: string): {
	readonly sources: readonly OwnSource[];
	readonly errors: readonly OwnError[];
} {
	const read = ownTextPaths(root).map((path) => sourceAt(root, path));
	return {
		sources: read.flatMap((entry) => (entry.ok ? [entry.value] : [])),
		errors: read.flatMap((entry) => (entry.ok ? [] : [entry.error])),
	};
}

export function astackWrittenText(
	artifact: Artifact,
	sources: readonly RuleSource[],
): Result<string | undefined, string> {
	switch (artifact.kind) {
		case "flow-config":
			return ok(artifact.content);
		case "rule": {
			const source = sources.find((rule) =>
				artifact.path.endsWith(`/${rule.name}`),
			);
			return source !== undefined && artifact.content.startsWith(source.content)
				? ok(
						`${source.content.replace(/[^\n]/g, "")}${artifact.content.slice(source.content.length)}`,
					)
				: err(
						`${artifact.path} does not start with a copy of a rule in rules/`,
					);
		}
		case "review-stub":
		case "review-profile":
		case "astack-profile":
		case "settings":
		case "notice":
			return ok(undefined);
	}
}

function renderedProjectReport(
	dir: string,
	name: string,
	rules: readonly RuleSource[],
): OwnReport {
	const project = validateProjectConfig(
		JSON.parse(readFileSync(join(dir, `${name}.json`), "utf8")),
		name,
	);
	const read = renderWouldBeArtifacts(project, rules, join(dir, name))
		.artifacts.filter((artifact) => /\.md$/i.test(artifact.path))
		.map((artifact) => ({
			path: `projects/${name}.json renders ${artifact.path}`,
			text: astackWrittenText(artifact, rules),
		}));
	const report = ownTextReport(
		read.flatMap(({ path, text }) =>
			text.ok && text.value !== undefined ? [{ path, text: text.value }] : [],
		),
		glossaryOf(parseSteProfile({ ste: project.ste }), undefined),
	);
	return {
		...report,
		errors: [
			...report.errors,
			...read.flatMap(({ path, text }) =>
				text.ok ? [] : [{ path, message: text.error }],
			),
		],
	};
}

export function renderedTextReport(
	root: string,
	companionProjects: string,
): OwnReport {
	const names = existsSync(companionProjects)
		? projectNames(companionProjects)
		: [];
	if (names.length === 0)
		return {
			files: 0,
			descriptions: 0,
			findings: [],
			errors: [
				{
					path: companionProjects,
					message:
						"holds 0 project configs, so the gate examines no text that apply renders",
				},
			],
		};
	const rules = readRuleSources(root);
	const reports = names.map((name) =>
		renderedProjectReport(companionProjects, name, rules),
	);
	return {
		files: reports.reduce((sum, report) => sum + report.files, 0),
		descriptions: 0,
		findings: reports.flatMap((report) => report.findings),
		errors: reports.flatMap((report) => report.errors),
	};
}
