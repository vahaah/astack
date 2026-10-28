import { globToRegExp } from "../glob.ts";
import { profileSection } from "../profile.ts";
import type { HatchKind } from "./syntax.ts";

export type TypeAllow = {
	readonly paths: readonly RegExp[];
	readonly kinds: readonly HatchKind[];
	readonly reason: string;
};

export type TypePolicy = {
	readonly skip: readonly RegExp[];
	readonly allow: readonly TypeAllow[];
	readonly extendsAllow: readonly RegExp[];
};

export const HATCH_KINDS: readonly HatchKind[] = [
	"any",
	"cast",
	"non-null",
	"ts-ignore",
	"ts-nocheck",
	"ts-expect-error",
	"banned-type",
	"enum",
	"extends",
];

export const EMPTY_POLICY: TypePolicy = {
	skip: [],
	allow: [],
	extendsAllow: [],
};

const TYPE_SOURCE = /\.(?:ts|tsx|mts|cts)$/;
const DECLARATION = /\.d\.[cm]?ts$/;
const SKIPPED_PATHS: readonly RegExp[] = [
	/(?:^|\/)node_modules\//,
	/(?:^|\/)(?:fixtures|__fixtures__|vendor|generated)\//,
	/\.generated\./,
	/\.gen\.[cm]?tsx?$/,
];
const GENERATED_MARK = /@generated\b|\bDO NOT EDIT\b|\bauto-?generated\b/i;
const SUPABASE_TYPES = /^export type Json =/;
const TYPE_TEST = /\.test-d\.[cm]?tsx?$/;

export const DEFAULT_EXTENDS_ALLOW: readonly RegExp[] = [
	/^(?:[\w$]+\.)*[\w$]*Error$/,
	/^(?:React\.)?(?:Pure)?Component$/,
	/^(?:Data|Schema)\.Tagged(?:Error|Class|Request)$/,
	/^(?:Data|Schema)\.Class$/,
	/^(?:Context|Effect)\.Tag$/,
	/^Effect\.Service$/,
];

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function strings(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

function hatchKinds(value: unknown): HatchKind[] {
	return strings(value).flatMap((name) =>
		HATCH_KINDS.filter((kind) => kind === name),
	);
}

function allowEntries(value: unknown): TypeAllow[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((entry): TypeAllow[] => {
		if (!isRecord(entry)) return [];
		const reason = typeof entry.reason === "string" ? entry.reason.trim() : "";
		const paths = strings(entry.paths).map(globToRegExp);
		const kinds = hatchKinds(entry.kinds);
		return reason && paths.length > 0 && kinds.length > 0
			? [{ paths, kinds, reason }]
			: [];
	});
}

function patterns(value: unknown): RegExp[] {
	return strings(value).flatMap((pattern) => {
		try {
			return [new RegExp(pattern)];
		} catch {
			return [];
		}
	});
}

export function parseTypePolicy(raw: unknown): TypePolicy {
	if (!isRecord(raw)) return EMPTY_POLICY;
	return {
		skip: strings(raw.skip).map(globToRegExp),
		allow: allowEntries(raw.allow),
		extendsAllow: patterns(raw.extendsAllow),
	};
}

export function typePolicy(projectDir: string): TypePolicy {
	return parseTypePolicy(profileSection(projectDir, "types"));
}

export function isGeneratedText(text: string): boolean {
	const head = text.split("\n", 5).join("\n");
	return GENERATED_MARK.test(head) || SUPABASE_TYPES.test(text.trimStart());
}

export function isTypeSourcePath(relPath: string, policy: TypePolicy): boolean {
	return (
		TYPE_SOURCE.test(relPath) &&
		!DECLARATION.test(relPath) &&
		!SKIPPED_PATHS.some((pattern) => pattern.test(relPath)) &&
		!policy.skip.some((pattern) => pattern.test(relPath))
	);
}

export function isTypeTest(relPath: string): boolean {
	return TYPE_TEST.test(relPath);
}

export function allowedKinds(
	relPath: string,
	policy: TypePolicy,
): ReadonlySet<HatchKind> {
	return new Set(
		policy.allow.flatMap((entry) =>
			entry.paths.some((pattern) => pattern.test(relPath)) ? entry.kinds : [],
		),
	);
}

export function extendsAllowed(base: string, policy: TypePolicy): boolean {
	return [...DEFAULT_EXTENDS_ALLOW, ...policy.extendsAllow].some((pattern) =>
		pattern.test(base),
	);
}
