import {
	allowedKinds,
	extendsAllowed,
	HATCH_KINDS,
	isGeneratedText,
	isTypeSourcePath,
	isTypeTest,
	type TypePolicy,
} from "./policy.ts";
import { findHatches, type Hatch, type HatchKind } from "./syntax.ts";

export type Severity = "deny" | "advise";

export type Occurrence = {
	readonly line: number;
	readonly quote: string;
	readonly detail: string;
};

export type Rise = {
	readonly kind: HatchKind;
	readonly severity: Severity;
	readonly before: number;
	readonly after: number;
	readonly found: readonly Occurrence[];
};

export type FileReport = {
	readonly relPath: string;
	readonly rises: readonly Rise[];
};

export type TypeChange = {
	readonly relPath: string;
	readonly before: string | undefined;
	readonly after: string;
};

export const SEVERITY: Readonly<Record<HatchKind, Severity>> = {
	any: "deny",
	cast: "deny",
	"non-null": "deny",
	"ts-ignore": "deny",
	"ts-nocheck": "deny",
	"ts-expect-error": "deny",
	"banned-type": "advise",
	enum: "advise",
	extends: "advise",
};

const MAX_QUOTE = 140;

export function isTypeSource(change: TypeChange, policy: TypePolicy): boolean {
	return (
		isTypeSourcePath(change.relPath, policy) &&
		!isGeneratedText(change.after) &&
		(change.before === undefined || !isGeneratedText(change.before))
	);
}

function hatchesOf(
	text: string,
	relPath: string,
): readonly Hatch[] | undefined {
	const jsx = relPath.endsWith(".tsx");
	return findHatches(text, { jsx, angleCasts: !jsx });
}

function counted(
	hatches: readonly Hatch[],
	relPath: string,
	policy: TypePolicy,
): Hatch[] {
	const allowed = allowedKinds(relPath, policy);
	const typeTest = isTypeTest(relPath);
	return hatches.filter((hatch) => {
		if (allowed.has(hatch.kind)) return false;
		if (hatch.kind === "ts-expect-error" && typeTest) return false;
		if (hatch.kind === "extends") return !extendsAllowed(hatch.detail, policy);
		return true;
	});
}

function quoteOf(lines: readonly string[], line: number): string {
	const text = (lines[line - 1] ?? "").trim().replace(/\s+/g, " ");
	return text.length > MAX_QUOTE ? `${text.slice(0, MAX_QUOTE - 1)}…` : text;
}

function newOccurrences(
	before: readonly Hatch[],
	after: readonly Hatch[],
	beforeLines: readonly string[],
	afterLines: readonly string[],
): Occurrence[] {
	const seen = new Map<string, number>();
	for (const hatch of before) {
		const key = `${hatch.detail}\u0000${quoteOf(beforeLines, hatch.line)}`;
		seen.set(key, (seen.get(key) ?? 0) + 1);
	}
	const fresh: Occurrence[] = [];
	for (const hatch of after) {
		const quote = quoteOf(afterLines, hatch.line);
		const key = `${hatch.detail}\u0000${quote}`;
		const left = seen.get(key) ?? 0;
		if (left > 0) seen.set(key, left - 1);
		else fresh.push({ line: hatch.line, quote, detail: hatch.detail });
	}
	return fresh.length > 0
		? fresh
		: after.map((hatch) => ({
				line: hatch.line,
				quote: quoteOf(afterLines, hatch.line),
				detail: hatch.detail,
			}));
}

export function checkTypes(
	change: TypeChange,
	policy: TypePolicy,
): FileReport | undefined {
	const afterAll = hatchesOf(change.after, change.relPath);
	const beforeAll =
		change.before === undefined ? [] : hatchesOf(change.before, change.relPath);
	if (!afterAll || !beforeAll) return undefined;
	const after = counted(afterAll, change.relPath, policy);
	const before = counted(beforeAll, change.relPath, policy);
	const afterLines = change.after.split("\n");
	const beforeLines = (change.before ?? "").split("\n");
	const rises = HATCH_KINDS.flatMap((kind): Rise[] => {
		const now = after.filter((hatch) => hatch.kind === kind);
		const was = before.filter((hatch) => hatch.kind === kind);
		if (now.length <= was.length) return [];
		return [
			{
				kind,
				severity: SEVERITY[kind],
				before: was.length,
				after: now.length,
				found: newOccurrences(was, now, beforeLines, afterLines),
			},
		];
	});
	return { relPath: change.relPath, rises };
}

export function denies(report: FileReport): boolean {
	return report.rises.some((rise) => rise.severity === "deny");
}
