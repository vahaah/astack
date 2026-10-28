import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { anyGlob } from "../glob.ts";
import { readOptional } from "../paths.ts";
import { PROFILE_PATH, readProfileJson } from "../profile.ts";
import { DEFAULT_TECHNICAL_VERBS } from "./lexicon.ts";
import type { Enforcement, Glossary } from "./types.ts";

export type SteProfile = {
	readonly mode: Enforcement;
	readonly technicalNouns: readonly string[];
	readonly technicalVerbs: readonly string[];
	readonly exclude: readonly string[];
	readonly headerFields: readonly string[];
	readonly glossary: string | undefined;
};

export type SteSettings = {
	readonly root: string;
	readonly profile: SteProfile;
	readonly glossary: Glossary;
};

const DEFAULT_EXCLUDES: readonly string[] = [
	"LICENSE*",
	"NOTICE*",
	"**/content/**",
	"apps/**/*.mdx",
	"app/**/*.mdx",
	"**/public/**",
	"**/locales/**",
];

const ALWAYS_SKIPPED: readonly string[] = [
	"**/upstream/**",
	"**/node_modules/**",
	"**/vendor/**",
	"**/fixtures/**",
	"**/__fixtures__/**",
	"CHANGELOG*",
	"**/*.generated.*",
	"**/port/*/overlays/**",
	"**/port/*/patches/**",
];

export const PROSE_FILE = /\.(?:md|mdx|markdown)$/i;

const DEFAULT_GLOSSARY_FILE = "CONTEXT.md";
const MAX_GLOSSARY_TERMS = 500;

export const DEFAULT_STE_PROFILE: SteProfile = {
	mode: "advise",
	technicalNouns: [],
	technicalVerbs: [],
	exclude: [],
	headerFields: [],
	glossary: undefined,
};

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function strings(value: unknown): readonly string[] {
	return Array.isArray(value)
		? value.filter(
				(item): item is string =>
					typeof item === "string" && item.trim() !== "",
			)
		: [];
}

function relativeFile(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const path = value.trim();
	if (path === "" || isAbsolute(path) || path.split(/[\\/]/).includes(".."))
		return undefined;
	return path;
}

function steSection(parsed: unknown): unknown {
	if (!isRecord(parsed)) return undefined;
	if (isRecord(parsed.ste)) return parsed.ste;
	return "mode" in parsed || "technicalNouns" in parsed ? parsed : undefined;
}

function planGlossary(parsed: unknown): string | undefined {
	return isRecord(parsed) && isRecord(parsed.plan)
		? relativeFile(parsed.plan.glossary)
		: undefined;
}

export function parseSteProfile(parsed: unknown): SteProfile {
	const section = steSection(parsed);
	if (!isRecord(section))
		return { ...DEFAULT_STE_PROFILE, glossary: planGlossary(parsed) };
	return {
		mode: section.mode === "deny" ? "deny" : "advise",
		technicalNouns: strings(section.technicalNouns),
		technicalVerbs: strings(section.technicalVerbs).map((verb) =>
			verb.toLowerCase(),
		),
		exclude: strings(section.exclude),
		headerFields: strings(section.headerFields),
		glossary: relativeFile(section.glossary) ?? planGlossary(parsed),
	};
}

export function glossaryTerms(markdown: string): readonly string[] {
	const terms = [...markdown.matchAll(/\*\*([^*\n]{2,60})\*\*/g)]
		.map((match) => (match[1] ?? "").trim().replace(/[.:]+$/, ""))
		.filter((term) => /[A-Za-z]/.test(term) && term.split(/\s+/).length <= 5);
	return [...new Set(terms)].slice(0, MAX_GLOSSARY_TERMS);
}

export function glossaryOf(
	profile: SteProfile,
	glossaryText: string | undefined,
): Glossary {
	return {
		technicalNames: [
			...profile.technicalNouns,
			...glossaryTerms(glossaryText ?? ""),
		],
		technicalVerbs: new Set([
			...DEFAULT_TECHNICAL_VERBS,
			...profile.technicalVerbs,
		]),
	};
}

export function settingsFor(root: string, parsed: unknown): SteSettings {
	const profile = parseSteProfile(parsed);
	const glossaryText = readOptional(
		join(root, profile.glossary ?? DEFAULT_GLOSSARY_FILE),
	);
	return { root, profile, glossary: glossaryOf(profile, glossaryText) };
}

export function loadSettings(root: string): SteSettings {
	return settingsFor(root, readProfileJson(root));
}

export function settingsRoot(path: string, fallback: string): string {
	return settingsRootFrom(dirname(resolve(path)), fallback);
}

export function settingsRootFrom(start: string, fallback: string): string {
	let dir = resolve(start);
	for (;;) {
		if (existsSync(join(dir, PROFILE_PATH)) || existsSync(join(dir, ".git")))
			return dir;
		const parent = dirname(dir);
		if (parent === dir) return fallback;
		dir = parent;
	}
}

export function hasHeaderFields(relPath: string, profile: SteProfile): boolean {
	return anyGlob(profile.headerFields, relPath);
}

export function isExcluded(relPath: string, profile: SteProfile): boolean {
	return (
		anyGlob(ALWAYS_SKIPPED, relPath) ||
		anyGlob(DEFAULT_EXCLUDES, relPath) ||
		anyGlob(profile.exclude, relPath)
	);
}
