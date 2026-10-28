import type { CommentMarker, RawComment } from "./lexer.ts";

export interface CommentLine {
	line: number;
	text: string;
	raw: string;
}

export interface CommentUnit {
	start: number;
	end: number;
	startLine: number;
	endLine: number;
	marker: CommentMarker;
	doc: boolean;
	trailing: boolean;
	codeBefore: string;
	codeAfter: string;
	lines: CommentLine[];
}

export class LineIndex {
	readonly starts: number[] = [0];
	readonly lines: string[];

	constructor(readonly source: string) {
		for (let i = 0; i < source.length; i++)
			if (source[i] === "\n") this.starts.push(i + 1);
		this.lines = source.split("\n").map((line) => line.replace(/\r$/, ""));
	}

	lineOf(offset: number): number {
		let lo = 0;
		let hi = this.starts.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if ((this.starts[mid] ?? 0) <= offset) lo = mid;
			else hi = mid - 1;
		}
		return lo + 1;
	}

	text(line: number): string {
		return this.lines[line - 1] ?? "";
	}
}

function stripLineMarker(raw: string, marker: CommentMarker): string {
	if (marker === "//") return raw.replace(/^\/\/\/?!?/, "").trim();
	if (marker === "#") return raw.replace(/^#/, "").trim();
	return raw.replace(/^--/, "").trim();
}

function blockLines(raw: string, doc: boolean): string[] {
	const body = raw.slice(doc ? 3 : 2, raw.endsWith("*/") ? -2 : undefined);
	return body.split("\n").map((line) =>
		line
			.replace(/\r$/, "")
			.replace(/^\s*\*(?!\/)\s?/, "")
			.trim(),
	);
}

function isDocComment(raw: string, marker: CommentMarker): boolean {
	if (marker === "/*")
		return (
			raw.startsWith("/**") &&
			!raw.startsWith("/**/") &&
			!raw.startsWith("/***")
		);
	if (marker === "//")
		return /^\/\/\/(?!\/)/.test(raw) && !/^\/\/\/\s*</.test(raw);
	return false;
}

function toUnit(index: LineIndex, comment: RawComment): CommentUnit {
	const { source } = index;
	const raw = source.slice(comment.start, comment.end);
	const startLine = index.lineOf(comment.start);
	const endLine = index.lineOf(Math.max(comment.start, comment.end - 1));
	const lineStart = index.starts[startLine - 1] ?? 0;
	const codeBefore = source.slice(lineStart, comment.start).trim();
	const doc = isDocComment(raw, comment.marker);
	const lines: CommentLine[] =
		comment.marker === "/*"
			? blockLines(raw, doc).map((text, i) => ({
					line: startLine + i,
					text,
					raw: (raw.split("\n")[i] ?? "").trim(),
				}))
			: [
					{
						line: startLine,
						text: stripLineMarker(raw, comment.marker),
						raw: raw.trim(),
					},
				];
	return {
		start: comment.start,
		end: comment.end,
		startLine,
		endLine,
		marker: comment.marker,
		doc,
		trailing: /[\w$"'`)\]]/.test(codeBefore),
		codeBefore,
		codeAfter: "",
		lines,
	};
}

const ATTACHED_PREFIX = /^(?:@\w|#\[|#(?=[\s#]|$)|\/\/|\/\*|\*|--)/;

function codeAfter(index: LineIndex, unit: CommentUnit): string {
	const { source } = index;
	const eol = source.indexOf("\n", unit.end);
	const rest = source.slice(unit.end, eol < 0 ? source.length : eol).trim();
	if (rest) return rest;
	for (let line = unit.endLine + 1; line <= index.lines.length; line++) {
		const text = index.text(line).trim();
		if (!text) return "";
		if (!ATTACHED_PREFIX.test(text)) return text;
	}
	return "";
}

export function commentUnits(
	source: string,
	comments: RawComment[],
	standalone: (text: string) => boolean,
): CommentUnit[] {
	const index = new LineIndex(source);
	const units: CommentUnit[] = [];
	for (const comment of comments) {
		const unit = toUnit(index, comment);
		const last = units[units.length - 1];
		const lastLine = last?.lines[last.lines.length - 1];
		const unitLine = unit.lines[0];
		if (
			last &&
			lastLine &&
			unitLine &&
			last.marker !== "/*" &&
			unit.marker === last.marker &&
			!last.trailing &&
			!unit.trailing &&
			last.doc === unit.doc &&
			unit.startLine === last.endLine + 1 &&
			!standalone(lastLine.text) &&
			!standalone(unitLine.text)
		) {
			last.end = unit.end;
			last.endLine = unit.endLine;
			last.lines.push(unitLine);
			continue;
		}
		units.push(unit);
	}
	for (const unit of units) unit.codeAfter = codeAfter(index, unit);
	return units;
}

function blankBetween(index: LineIndex, from: number, to: number): boolean {
	for (let line = from; line < to; line++)
		if (index.text(line).trim()) return false;
	return true;
}

export function paragraphRuns(
	source: string,
	units: CommentUnit[],
): CommentUnit[][] {
	const index = new LineIndex(source);
	const runs: CommentUnit[][] = [];
	for (const unit of units) {
		const run = runs[runs.length - 1];
		const last = run?.[run.length - 1];
		if (
			run &&
			last &&
			last.marker !== "/*" &&
			unit.marker === last.marker &&
			!last.trailing &&
			!unit.trailing &&
			last.doc === unit.doc &&
			unit.startLine > last.endLine + 1 &&
			blankBetween(index, last.endLine + 1, unit.startLine)
		) {
			run.push(unit);
			continue;
		}
		runs.push([unit]);
	}
	return runs;
}

export function normalizeCommentText(text: string): string {
	return text.toLowerCase().replace(/\s+/g, " ").trim();
}
