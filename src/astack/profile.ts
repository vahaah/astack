import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CommentPolicy } from "./comments/classify.ts";
import { limitsFor } from "./comments/limits.ts";
import { parseHookConfig } from "./hook-profile.ts";

export type PlanProfile = {
	readonly dir: string;
	readonly glossary: string | undefined;
	readonly adr: string;
};

export type Profile = {
	readonly commentKeep: readonly RegExp[];
	readonly maxCommentLines: number | undefined;
	readonly plan: PlanProfile;
};

export const PROFILE_PATH = ".astack/profile.json";

export const DEFAULT_PLAN_PROFILE: PlanProfile = {
	dir: "docs/plans",
	glossary: undefined,
	adr: "docs/adr",
};

const DEFAULT_PROFILE: Profile = {
	commentKeep: [],
	maxCommentLines: undefined,
	plan: DEFAULT_PLAN_PROFILE,
};

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function field(parsed: unknown, key: string): unknown {
	return isRecord(parsed) ? parsed[key] : undefined;
}

export function readProfileJson(projectDir: string): unknown {
	try {
		return JSON.parse(readFileSync(join(projectDir, PROFILE_PATH), "utf8"));
	} catch {
		return undefined;
	}
}

export function profileSection(projectDir: string, key: string): unknown {
	return field(readProfileJson(projectDir), key);
}

function repoRelative(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const path = value.trim().replace(/\/+$/, "");
	if (path === "" || path.startsWith("/") || path.split(/[\\/]/).includes(".."))
		return undefined;
	return path;
}

function planProfile(parsed: unknown): PlanProfile {
	const block = field(parsed, "plan");
	return {
		dir: repoRelative(field(block, "dir")) ?? DEFAULT_PLAN_PROFILE.dir,
		glossary: repoRelative(field(block, "glossary")),
		adr: repoRelative(field(block, "adr")) ?? DEFAULT_PLAN_PROFILE.adr,
	};
}

function keepPatterns(value: unknown): RegExp[] {
	const patterns: RegExp[] = [];
	for (const pattern of Array.isArray(value) ? value : []) {
		if (typeof pattern !== "string") continue;
		try {
			patterns.push(new RegExp(pattern));
		} catch {}
	}
	return patterns;
}

function lineLimit(value: unknown): number | undefined {
	return typeof value === "number" && Number.isInteger(value) && value >= 1
		? value
		: undefined;
}

export function parseProfile(parsed: unknown): Profile {
	if (!isRecord(parsed)) return DEFAULT_PROFILE;
	return {
		commentKeep: keepPatterns(parsed.commentKeep),
		maxCommentLines: lineLimit(parsed.maxCommentLines),
		plan: planProfile(parsed),
	};
}

function isStringList(value: unknown): value is readonly string[] {
	return (
		Array.isArray(value) && value.every((item) => typeof item === "string")
	);
}

function unknownKeys(
	block: Readonly<Record<string, unknown>>,
	at: string,
	known: readonly string[],
): string[] {
	return Object.keys(block)
		.filter((key) => !known.includes(key))
		.map((key) => `${at}.${key} is not a known key`);
}

function optional(
	block: Readonly<Record<string, unknown>>,
	at: string,
	key: string,
	check: (value: unknown) => boolean,
	need: string,
): string[] {
	const value = block[key];
	return value === undefined || check(value)
		? []
		: [`${at}.${key} must be ${need}`];
}

function isPositiveInteger(value: unknown): boolean {
	return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function isRepoPath(value: unknown): boolean {
	return typeof value === "string" && repoRelative(value) === value.trim();
}

function trackerProblems(value: unknown): string[] {
	if (!isRecord(value)) return ["tracker must be an object"];
	const base = [
		...unknownKeys(value, "tracker", ["kind", "team", "requirePartOf"]),
		...optional(
			value,
			"tracker",
			"requirePartOf",
			(flag) => typeof flag === "boolean",
			"true or false",
		),
	];
	switch (value.kind) {
		case "linear":
			return typeof value.team === "string" &&
				/^[A-Z][A-Z0-9]*$/.test(value.team)
				? base
				: [...base, "tracker.team must be a Linear team key such as ABC"];
		case "github":
			return base;
		case "none":
			return value.requirePartOf === true
				? [...base, "tracker.requirePartOf needs a tracker"]
				: base;
		default:
			return [...base, 'tracker.kind must be "linear", "github" or "none"'];
	}
}

export function standingBaseProblems(
	merge: Readonly<Record<string, unknown>>,
): string[] {
	const bases = merge.standingBases;
	if (bases === undefined) return [];
	if (merge.authority === "standing")
		return [
			'merge.standingBases needs merge.authority "turn", because "standing" already covers each base',
		];
	if (!isStringList(bases) || bases.some((base) => base.trim() === ""))
		return [
			"merge.standingBases must be a list of branch names that are not empty",
		];
	const repeated = bases.filter((base, index) => bases.indexOf(base) !== index);
	return [...new Set(repeated)].map(
		(base) => `merge.standingBases names ${base} more than one time`,
	);
}

function mergeProblems(value: unknown): string[] {
	if (!isRecord(value)) return ["merge must be an object"];
	return [
		...unknownKeys(value, "merge", [
			"authority",
			"requireChecks",
			"standingBases",
		]),
		...(value.authority === "standing" || value.authority === "turn"
			? []
			: ['merge.authority must be "standing" or "turn"']),
		...optional(
			value,
			"merge",
			"requireChecks",
			(flag) => typeof flag === "boolean",
			"true or false",
		),
		...standingBaseProblems(value),
	];
}

function steProblems(value: unknown): string[] {
	if (!isRecord(value)) return ["ste must be an object"];
	return [
		...unknownKeys(value, "ste", [
			"mode",
			"technicalNouns",
			"technicalVerbs",
			"exclude",
			"headerFields",
			"glossary",
		]),
		...(value.mode === "deny" || value.mode === "advise"
			? []
			: ['ste.mode must be "deny" or "advise"']),
		...optional(value, "ste", "technicalNouns", isStringList, "a string list"),
		...optional(value, "ste", "technicalVerbs", isStringList, "a string list"),
		...optional(value, "ste", "exclude", isStringList, "a string list"),
		...optional(value, "ste", "headerFields", isStringList, "a string list"),
		...optional(value, "ste", "glossary", isRepoPath, "a path in the repo"),
	];
}

function planProblems(value: unknown): string[] {
	if (!isRecord(value)) return ["plan must be an object"];
	return [
		...unknownKeys(value, "plan", [
			"dir",
			"glossary",
			"adr",
			"branchPrefix",
			"wip",
			"team",
		]),
		...["dir", "glossary", "adr"].flatMap((key) =>
			optional(value, "plan", key, isRepoPath, "a path in the repo"),
		),
		...["branchPrefix", "team"].flatMap((key) =>
			optional(
				value,
				"plan",
				key,
				(text) => typeof text === "string" && text !== "",
				"a string",
			),
		),
		...optional(value, "plan", "wip", isPositiveInteger, "a positive integer"),
	];
}

function patternProblems(value: unknown): string[] {
	if (!isStringList(value)) return ["commentKeep must be a string list"];
	return value.flatMap((pattern) => {
		try {
			new RegExp(pattern);
			return [];
		} catch {
			return [`commentKeep: "${pattern}" is not a valid RegExp`];
		}
	});
}

function sectionProblems(key: string, value: unknown): string[] {
	switch (key) {
		case "tracker":
			return trackerProblems(value);
		case "merge":
			return mergeProblems(value);
		case "ste":
			return steProblems(value);
		case "plan":
			return planProblems(value);
		case "hooks": {
			const hooks = parseHookConfig(value);
			return hooks.ok ? [] : [...hooks.error];
		}
		case "types":
			return isRecord(value) ? [] : ["types must be an object"];
		case "commentKeep":
			return patternProblems(value);
		case "managed":
			return isStringList(value) && value.every(isRepoPath)
				? []
				: ["managed must be a list of paths in the repo"];
		case "neutral":
			return isRecord(value) && isStringList(value.deny)
				? unknownKeys(value, "neutral", ["deny"])
				: ["neutral must be an object with a deny string list"];
		case "maxCommentLines":
			return isPositiveInteger(value)
				? []
				: ["maxCommentLines must be a positive integer"];
		default:
			return [`${key} is not a known profile section`];
	}
}

export function profileProblems(parsed: unknown): readonly string[] {
	if (!isRecord(parsed)) return ["the profile must be a JSON object"];
	return Object.entries(parsed).flatMap(([key, value]) =>
		sectionProblems(key, value),
	);
}

export function loadProfile(projectDir: string): Profile {
	return parseProfile(readProfileJson(projectDir));
}

export function commentPolicy(...dirs: string[]): CommentPolicy {
	const profiles = [...new Set(dirs)].map(loadProfile);
	return {
		keep: profiles.flatMap((profile) => profile.commentKeep),
		limits: limitsFor(
			profiles.find((profile) => profile.maxCommentLines !== undefined)
				?.maxCommentLines,
		),
	};
}
