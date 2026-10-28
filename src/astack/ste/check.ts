import { foreignWords, nonLatin, otherLatinLanguage } from "./language.ts";
import { DEFAULT_TECHNICAL_VERBS } from "./lexicon.ts";
import { restore } from "./mask.ts";
import { paragraphLength, RULE_TIER, SENTENCE_RULES } from "./rules.ts";
import { type Scoped, scope } from "./scope.ts";
import { sentencesOf } from "./sentences.ts";
import type {
	Enforcement,
	Finding,
	FindingRule,
	Glossary,
	Hit,
	Report,
	RuleId,
	Sentence,
	Severity,
	Surface,
	Unit,
} from "./types.ts";

export type LineRange = { readonly start: number; readonly end: number };

export type CheckOptions = {
	readonly surface: Surface;
	readonly enforcement: Enforcement;
	readonly glossary: Glossary;
	readonly old?: string | undefined;
	readonly lines?: readonly LineRange[] | undefined;
	readonly oldLines?: readonly LineRange[] | undefined;
	readonly titleLines?: readonly number[] | undefined;
	readonly headerFields?: boolean | undefined;
};

export const DEFAULT_GLOSSARY: Glossary = {
	technicalNames: [],
	technicalVerbs: new Set(DEFAULT_TECHNICAL_VERBS),
};

const HEADING_RULES: ReadonlySet<RuleId> = new Set([
	"word-list",
	"word-broad",
	"contraction",
	"dash",
]);

const TITLE_RULES: ReadonlySet<RuleId> = new Set([
	"contraction",
	"semicolon",
	"dash",
	"latin",
	"and-or",
	"word-list",
	"word-broad",
]);

const COMMENT_DENY: ReadonlySet<RuleId> = new Set([
	"contraction",
	"latin",
	"and-or",
	"dash",
	"word-list",
]);

const QUOTE_SHARE = 0.4;
const QUOTE_MIN_CHARS = 400;

export const LANGUAGE_FIX =
	"The reply must be in ASD-STE100 English. Put text in another language in double quotes or backticks.";

function severityOf(rule: RuleId, unit: Unit, options: CheckOptions): Severity {
	if (unit.kind === "heading" || options.enforcement === "advise")
		return "advise";
	switch (options.surface) {
		case "comment":
			return COMMENT_DENY.has(rule) ? "deny" : "advise";
		case "doc":
		case "pr":
		case "ticket":
		case "commit":
		case "reply":
			return RULE_TIER[rule];
	}
}

function applies(rule: RuleId, unit: Unit, surface: Surface): boolean {
	if (unit.kind === "heading") return HEADING_RULES.has(rule);
	if (unit.kind === "title") return TITLE_RULES.has(rule);
	if (unit.kind === "field" && rule === "dash") return false;
	return !(surface === "comment" && rule === "paragraph-length");
}

function inLines(
	first: number,
	last: number,
	lines: readonly LineRange[] | undefined,
): boolean {
	return (
		lines === undefined ||
		lines.some((range) => first <= range.end && last >= range.start)
	);
}

export function regionLines(
	text: string,
	regions: readonly { readonly start: number; readonly end: number }[],
): readonly LineRange[] {
	const lineAt = (offset: number): number =>
		text.slice(0, Math.max(0, offset)).split("\n").length;
	return regions.map((region) => ({
		start: lineAt(region.start),
		end: lineAt(Math.max(region.start, region.end - 1)),
	}));
}

export function fingerprint(rule: FindingRule, key: string): string {
	let hash = 0x811c9dc5;
	for (const char of `${rule}\u0000${key}`) {
		hash ^= char.codePointAt(0) ?? 0;
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return `${rule}:${hash.toString(16).padStart(8, "0")}`;
}

function languageReport(units: readonly Unit[], options: CheckOptions): Report {
	const unit =
		units.find((candidate) => nonLatin([candidate])) ??
		units.find((candidate) => foreignWords([candidate]) > 0) ??
		units[0];
	const sentence = unit ? restore(unit.text, unit.spans) : "";
	return {
		findings: [
			{
				rule: "language",
				severity: options.enforcement === "advise" ? "advise" : "deny",
				line: unit?.line ?? 1,
				sentence,
				excerpt: sentence,
				fix: LANGUAGE_FIX,
				fingerprint: fingerprint("language", sentence.toLowerCase()),
			},
		],
		sentences: units.flatMap(sentencesOf).length,
		skipped: "none",
	};
}

function scoped(text: string, options: CheckOptions): Scoped {
	const base = {
		technicalNames: options.glossary.technicalNames,
		lines: options.lines,
		titleLines: options.titleLines,
		lineBreaks: options.surface === "reply",
		proseFences: options.surface === "reply",
		headerFields: options.headerFields,
	};
	const plain = scope(text, { ...base, quotesAsProse: false });
	const total = plain.proseChars + plain.quoteChars;
	const share = plain.quoteChars / Math.max(1, total);
	if (
		options.surface === "reply" ||
		total < QUOTE_MIN_CHARS ||
		share <= QUOTE_SHARE
	)
		return plain;
	return scope(text, { ...base, quotesAsProse: true });
}

function sentenceKeys(
	text: string,
	options: CheckOptions,
): ReadonlySet<string> {
	const units = scope(text, {
		technicalNames: options.glossary.technicalNames,
		quotesAsProse: true,
		lines: options.oldLines,
		headerFields: options.headerFields,
	}).units;
	return new Set(units.flatMap(sentencesOf).map((sentence) => sentence.key));
}

function unitHits(
	unit: Unit,
	sentences: readonly Sentence[],
	options: CheckOptions,
	old: ReadonlySet<string>,
): readonly Hit[] {
	const fresh = sentences.filter(
		(sentence) =>
			inLines(sentence.line, sentence.line, options.lines) &&
			!old.has(sentence.key),
	);
	const sentenceHits = fresh.flatMap((sentence) =>
		SENTENCE_RULES.flatMap((rule) => rule(sentence, options.glossary)),
	);
	const wholeNew = fresh.length === sentences.length;
	const paragraphHits =
		wholeNew && unit.kind !== "heading" && unit.kind !== "title"
			? paragraphLength(sentences)
			: [];
	return [...sentenceHits, ...paragraphHits].filter((hit) =>
		applies(hit.rule, unit, options.surface),
	);
}

function toFinding(hit: Hit, options: CheckOptions): Finding {
	return {
		rule: hit.rule,
		severity: severityOf(hit.rule, hit.sentence.unit, options),
		line: hit.sentence.line,
		sentence: restore(hit.sentence.text, hit.sentence.unit.spans),
		excerpt: hit.excerpt,
		fix: hit.fix,
		fingerprint: fingerprint(hit.rule, hit.sentence.key),
	};
}

export function checkText(text: string, options: CheckOptions): Report {
	const { units } = scoped(text, options);
	const reply = options.surface === "reply";
	if (nonLatin(units))
		return reply
			? languageReport(units, options)
			: { findings: [], sentences: 0, skipped: "language" };
	if (reply && otherLatinLanguage(units)) return languageReport(units, options);
	const old =
		options.old === undefined
			? new Set<string>()
			: sentenceKeys(options.old, options);
	const perUnit = units.map((unit) => ({ unit, sentences: sentencesOf(unit) }));
	const findings = perUnit
		.flatMap(({ unit, sentences }) => unitHits(unit, sentences, options, old))
		.map((hit) => toFinding(hit, options))
		.sort((a, b) => a.line - b.line);
	return {
		findings,
		sentences: perUnit.reduce(
			(sum, { sentences }) => sum + sentences.length,
			0,
		),
		skipped: "none",
	};
}

export function denied(report: Report): readonly Finding[] {
	return report.findings.filter((finding) => finding.severity === "deny");
}

export function advised(report: Report): readonly Finding[] {
	return report.findings.filter((finding) => finding.severity === "advise");
}
