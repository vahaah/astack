import { DETERMINERS, IMPERATIVES } from "./lexicon.ts";
import { isPlaceholder, PLACEHOLDER_SOURCE, restore } from "./mask.ts";
import type { Sentence, TextKind, Unit } from "./types.ts";

const ABBREVIATION =
	/\b(?:e\.g|i\.e|etc|vs|cf|approx|viz|al|No|Fig|Dr|Mr|Mrs|Ms|St|Inc|Ltd|Co|Jr|Sr)\./g;
const LEADER = "\u2024";
const BOUNDARY = new RegExp(
	`[.!?…]+["')\\]’”]*\\s+(?=[“"'(\\[‘]?(?:[A-Za-z0-9]|${PLACEHOLDER_SOURCE}))`,
	"g",
);
const TOKEN = new RegExp(
	`${PLACEHOLDER_SOURCE}|\\d+(?:[:,]\\d+)+|[A-Za-z0-9\\u00C0-\\u024F][A-Za-z0-9\\u00C0-\\u024F'’-]*`,
	"g",
);
const LIST_END = /\betc\.(?=\s+[A-Z])/g;
const LEAD_CLAUSE =
	/^(?:if|when|before|after|to|once|unless|while|for each|for every)\b[^,]{0,80},\s*([A-Za-z]+)/i;
const SEQUENCE = /^(?:then|next|first|finally|now|also),?\s+([A-Za-z]+)/i;

export function tokens(text: string): readonly string[] {
	return text.match(TOKEN) ?? [];
}

function splitSentences(text: string): readonly string[] {
	const guarded = text
		.replace(LIST_END, "etc\u0000")
		.replace(ABBREVIATION, (match) => match.replaceAll(".", LEADER))
		.replaceAll("etc\u0000", "etc.");
	const parts: string[] = [];
	let start = 0;
	for (const match of guarded.matchAll(BOUNDARY)) {
		const end = (match.index ?? 0) + match[0].trimEnd().length;
		parts.push(guarded.slice(start, end));
		start = (match.index ?? 0) + match[0].length;
	}
	parts.push(guarded.slice(start));
	return parts
		.map((part) => part.replaceAll(LEADER, ".").trim())
		.filter((part) => part.length > 0);
}

function capitalized(word: string): boolean {
	return /^[A-Z]/.test(word);
}

function command(word: string | undefined, next: string | undefined): boolean {
	const lower = (word ?? "").toLowerCase();
	if (!IMPERATIVES.has(lower)) return false;
	if (next === undefined) return true;
	return (
		(lower === "make" && next.toLowerCase() === "sure") ||
		isPlaceholder(next) ||
		DETERMINERS.has(next.toLowerCase()) ||
		/^[a-z]+ly$/.test(next)
	);
}

function textKind(words: readonly string[], text: string): TextKind {
	const [first, second] = words;
	const lower = (first ?? "").toLowerCase();
	const procedural =
		(lower === "do" && second?.toLowerCase() === "not") ||
		/^don['’]t$/i.test(first ?? "") ||
		((lower === "never" || lower === "always" || lower === "please") &&
			IMPERATIVES.has((second ?? "").toLowerCase())) ||
		(capitalized(first ?? "") && command(first, second)) ||
		IMPERATIVES.has((LEAD_CLAUSE.exec(text)?.[1] ?? "").toLowerCase()) ||
		IMPERATIVES.has((SEQUENCE.exec(text)?.[1] ?? "").toLowerCase());
	return procedural ? "procedural" : "descriptive";
}

function sentenceKey(text: string): string {
	return text
		.toLowerCase()
		.replace(/[*_`~]/g, "")
		.replace(/\s+/g, " ")
		.replace(/^["'“‘(]+|[.!?:;,"'”’)]+$/g, "")
		.trim();
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type Cursor = { readonly offset: number; readonly line: number };

function locate(unit: Unit, words: readonly string[], cursor: Cursor): Cursor {
	const raw = unit.raw.map((line) => line.text).join("\n");
	const plain = words.filter((word) => !isPlaceholder(word));
	for (const probe of [plain.slice(0, 2), plain.slice(0, 1)]) {
		if (probe.length === 0) continue;
		const pattern = new RegExp(
			probe.map(escapeRegExp).join("[^A-Za-z0-9]+"),
			"g",
		);
		pattern.lastIndex = cursor.offset;
		const match = pattern.exec(raw);
		if (!match) continue;
		const index = raw.slice(0, match.index).split("\n").length - 1;
		return {
			offset: match.index + match[0].length,
			line: unit.raw[index]?.line ?? cursor.line,
		};
	}
	return cursor;
}

function fieldEntries(text: string): readonly string[] {
	return text
		.split(/;\s+/)
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
}

export function sentencesOf(unit: Unit): readonly Sentence[] {
	let cursor: Cursor = { offset: 0, line: unit.line };
	const parts = splitSentences(unit.text).flatMap((text) =>
		unit.kind === "field" ? fieldEntries(text) : [text],
	);
	return parts.map((text) => {
		const words = tokens(text);
		cursor = locate(unit, words, cursor);
		return {
			unit,
			line: cursor.line,
			text,
			words,
			kind: textKind(words, text),
			key: sentenceKey(restore(text, unit.spans)),
		};
	});
}
