import { withoutSessionTag } from "../commit-style.ts";
import { maskInline } from "./mask.ts";
import type { RawLine, Unit, UnitKind } from "./types.ts";

const FENCE = /^\s*(`{3,}|~{3,})/;
const HEADING = /^\s{0,3}#{1,6}(?:\s+|$)/;
const QUOTE = /^\s{0,3}>\s?/;
const TABLE_ROW = /^\s*\|/;
const TABLE_SEPARATOR =
	/^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)+\|?\s*$|^\s*\|\s*:?-{2,}:?\s*\|\s*$/;
const BULLET = /^\s*[-*+]\s+(?:\[[ xX]\]\s+)?/;
const ORDERED = /^\s*\d{1,9}[.)]\s+/;
const HTML_BLOCK = /^\s{0,3}<\/?[A-Za-z][\w-]*(?:\s[^>]*)?\/?>/;
const INDENTED = /^(?: {4}|\t)/;
const SETEXT = /^\s{0,3}(?:=+|-+)\s*$/;
const THEMATIC = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const FIELD_LABEL = /^[A-Z][A-Za-z-]*[.:](?=\s|$)\s*/;
const HEADER_FIELD = /^\*\*[A-Z][^*\n]*:\*\*(?=\s|$)/;
const SECTION = /^\s{0,3}#{2,6}(?:\s+|$)/;

export const PROSE_FENCE = /^(?:md|markdown|text|txt|plain|plaintext)$/i;

export type ScopeOptions = {
	readonly technicalNames: readonly string[];
	readonly quotesAsProse: boolean;
	readonly lines?:
		| readonly { readonly start: number; readonly end: number }[]
		| undefined;
	readonly titleLines?: readonly number[] | undefined;
	readonly lineBreaks?: boolean | undefined;
	readonly proseFences?: boolean | undefined;
	readonly headerFields?: boolean | undefined;
};

export type Scoped = {
	readonly units: readonly Unit[];
	readonly proseChars: number;
	readonly skippedChars: number;
	readonly quoteChars: number;
};

type Draft = {
	readonly kind: UnitKind;
	readonly lines: readonly RawLine[];
};

type State = {
	readonly units: readonly Unit[];
	readonly draft: Draft | undefined;
	readonly fence: string | undefined;
	readonly proseFence: string | undefined;
	readonly htmlComment: boolean;
	readonly table: boolean;
	readonly inList: boolean;
	readonly inHeader: boolean;
	readonly proseChars: number;
	readonly skippedChars: number;
	readonly quoteChars: number;
};

function unitOf(draft: Draft, options: ScopeOptions): Unit | undefined {
	const first = draft.lines[0];
	if (!first) return undefined;
	const joined = draft.lines.map((line) => line.text.trim()).join(" ");
	const labelled =
		draft.kind === "title"
			? withoutSessionTag(joined)
			: draft.kind === "heading"
				? joined
				: joined.replace(FIELD_LABEL, "");
	const masked = maskInline(labelled, options.technicalNames);
	if (masked.text === "") return undefined;
	return {
		kind: draft.kind,
		line: first.line,
		text: masked.text,
		spans: masked.spans,
		raw: draft.lines,
	};
}

function wanted(draft: Draft, options: ScopeOptions): boolean {
	const first = draft.lines[0]?.line ?? 0;
	const last = draft.lines[draft.lines.length - 1]?.line ?? first;
	return (
		options.lines === undefined ||
		options.lines.some((range) => first <= range.end && last >= range.start)
	);
}

function flush(state: State, options: ScopeOptions): State {
	if (!state.draft) return state;
	const unit = wanted(state.draft, options)
		? unitOf(state.draft, options)
		: undefined;
	return {
		...state,
		draft: undefined,
		units: unit ? [...state.units, unit] : state.units,
	};
}

function skip(state: State, line: string): State {
	return { ...state, skippedChars: state.skippedChars + line.length + 1 };
}

function open(
	state: State,
	options: ScopeOptions,
	kind: UnitKind,
	raw: RawLine,
): State {
	const flushed = flush(state, options);
	return {
		...flushed,
		draft: { kind, lines: [raw] },
		proseChars: flushed.proseChars + raw.text.length + 1,
	};
}

function append(state: State, raw: RawLine): State {
	if (!state.draft) return state;
	return {
		...state,
		draft: { ...state.draft, lines: [...state.draft.lines, raw] },
		proseChars: state.proseChars + raw.text.length + 1,
	};
}

function frontMatterEnd(lines: readonly string[]): number {
	if (lines[0]?.trim() !== "---") return 0;
	const close = lines.findIndex(
		(line, index) => index > 0 && /^(?:---|\.\.\.)\s*$/.test(line),
	);
	return close < 0 ? 0 : close + 1;
}

function closesFence(line: string, fence: string): boolean {
	const trimmed = line.trim();
	const marker = fence[0] ?? "`";
	return (
		trimmed.length >= fence.length &&
		[...trimmed].every((char) => char === marker)
	);
}

export function fenceInfo(line: string, marker: string): string {
	return line.trim().slice(marker.length).trim();
}

function openFence(
	state: State,
	options: ScopeOptions,
	line: string,
	marker: string,
): State {
	const skipped = skip(flush(state, options), line);
	const prose =
		options.proseFences === true &&
		state.proseFence === undefined &&
		PROSE_FENCE.test(fenceInfo(line, marker));
	return prose
		? { ...skipped, proseFence: marker }
		: { ...skipped, fence: marker };
}

function proseLine(
	state: State,
	options: ScopeOptions,
	raw: RawLine,
	text: string,
): State {
	if (HEADING.test(text)) {
		const inHeader = state.inHeader && !SECTION.test(text);
		const heading = text.replace(HEADING, "").replace(/\s+#+\s*$/, "");
		const flushed = flush(state, options);
		const withHeading = flush(
			{
				...flushed,
				draft: { kind: "heading", lines: [{ line: raw.line, text: heading }] },
			},
			options,
		);
		return { ...withHeading, inList: false, inHeader };
	}
	const marker = ORDERED.exec(text) ?? BULLET.exec(text);
	if (marker) {
		const item = text.slice(marker[0].length);
		const field =
			options.headerFields === true &&
			state.inHeader &&
			HEADER_FIELD.test(item);
		const opened = open(state, options, field ? "field" : "item", {
			line: raw.line,
			text: item,
		});
		return { ...opened, inList: true };
	}
	const continues =
		state.draft !== undefined &&
		(options.lineBreaks !== true || INDENTED.test(text));
	if (continues) return append(state, { line: raw.line, text });
	if (INDENTED.test(text) && !state.inList) return skip(state, text);
	const opened = open(state, options, "paragraph", {
		line: raw.line,
		text,
	});
	return { ...opened, inList: state.inList && INDENTED.test(text) };
}

function titleLine(state: State, options: ScopeOptions, raw: RawLine): State {
	const flushed = flush(state, options);
	return flush(
		{
			...flushed,
			draft: { kind: "title", lines: [raw] },
			proseChars: flushed.proseChars + raw.text.length + 1,
		},
		options,
	);
}

function step(state: State, options: ScopeOptions, raw: RawLine): State {
	const line = raw.text;
	if (
		state.fence === undefined &&
		line.trim() !== "" &&
		options.titleLines?.includes(raw.line) === true
	)
		return titleLine(state, options, raw);
	if (state.fence !== undefined) {
		const skipped = skip(state, line);
		return closesFence(line, state.fence)
			? { ...skipped, fence: undefined }
			: skipped;
	}
	if (state.htmlComment) {
		const skipped = skip(state, line);
		return line.includes("-->") ? { ...skipped, htmlComment: false } : skipped;
	}
	if (state.proseFence !== undefined && closesFence(line, state.proseFence))
		return {
			...skip(flush(state, options), line),
			proseFence: undefined,
			table: false,
			inList: false,
		};
	const fence = FENCE.exec(line)?.[1];
	if (fence) return openFence(state, options, line, fence);
	if (line.trimStart().startsWith("<!--"))
		return {
			...skip(flush(state, options), line),
			htmlComment: !line.includes("-->"),
		};
	if (line.trim() === "") return { ...flush(state, options), table: false };
	if (state.table && line.includes("|")) return skip(state, line);
	if (TABLE_SEPARATOR.test(line)) {
		const header = state.draft?.lines.length === 1 && line.includes("|");
		const dropped =
			header && state.draft?.lines[0]?.text.includes("|")
				? { ...state, draft: undefined }
				: flush(state, options);
		return { ...skip(dropped, line), table: true };
	}
	if (TABLE_ROW.test(line)) return skip(flush(state, options), line);
	if (
		SETEXT.test(line) &&
		state.draft?.kind === "paragraph" &&
		state.draft.lines.length === 1
	)
		return flush(
			{ ...state, draft: { ...state.draft, kind: "heading" } },
			options,
		);
	if (THEMATIC.test(line)) return skip(flush(state, options), line);
	if (QUOTE.test(line)) {
		const inner = line.replace(/^(?:\s{0,3}>\s?)+/, "");
		if (!options.quotesAsProse)
			return {
				...skip(flush(state, options), line),
				quoteChars: state.quoteChars + line.length + 1,
			};
		return proseLine(state, options, raw, inner);
	}
	if (HTML_BLOCK.test(line)) return skip(flush(state, options), line);
	return proseLine(state, options, raw, line);
}

export function scope(markdown: string, options: ScopeOptions): Scoped {
	const lines = markdown.split(/\r?\n/);
	const start = frontMatterEnd(lines);
	const initial: State = {
		units: [],
		draft: undefined,
		fence: undefined,
		proseFence: undefined,
		htmlComment: false,
		table: false,
		inList: false,
		inHeader: true,
		proseChars: 0,
		skippedChars: lines
			.slice(0, start)
			.reduce((sum, line) => sum + line.length + 1, 0),
		quoteChars: 0,
	};
	const final = lines
		.slice(start)
		.reduce(
			(state, text, index) =>
				step(state, options, { line: start + index + 1, text }),
			initial,
		);
	const done = flush(final, options);
	return {
		units: done.units,
		proseChars: done.proseChars,
		skippedChars: done.skippedChars,
		quoteChars: done.quoteChars,
	};
}
