import { err, ok, type Result } from "./result.ts";

export function adrProse(text: string): string {
	let closing: RegExp | undefined;
	return text
		.split("\n")
		.map((line) => {
			if (closing !== undefined) {
				if (closing.test(line)) closing = undefined;
				return line.replace(/[^\r]/g, " ");
			}
			const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
			if (marker === undefined) return line;
			const character = marker.startsWith("`") ? "`" : "~";
			closing = new RegExp(
				`^ {0,3}${character}{${marker.length},}[ \\t]*\\r?$`,
			);
			return line.replace(/[^\r]/g, " ");
		})
		.join("\n");
}

export function decisionHeading(
	text: string,
	decision: string,
): number | undefined {
	return new RegExp(
		`^###[ \\t]+${decision}(?:\\.[ \\t]+|[ \\t]+—[ \\t]+)\\S`,
		"m",
	).exec(adrProse(text))?.index;
}

const SPAN_END = /^(?:#{1,2}[ \t]|###[ \t]+D\d+(?:\.[ \t]+|[ \t]+—[ \t]+)\S)/m;

export function decisionSpan(
	text: string,
	decision: string,
): string | undefined {
	const start = decisionHeading(text, decision);
	if (start === undefined) return undefined;
	const prose = adrProse(text);
	const lineEnd = prose.indexOf("\n", start);
	if (lineEnd < 0) return "";
	const body = lineEnd + 1;
	const end = prose.slice(body).search(SPAN_END);
	return text.slice(body, end < 0 ? undefined : body + end);
}

export const PROOF_TITLES = [
	"Formal claim",
	"Category composition",
	"Implementation correspondence",
	"Verification",
] as const;

export type AdrLifecycle =
	| { readonly kind: "Proposed" }
	| { readonly kind: "Accepted" }
	| { readonly kind: "Superseded"; readonly by: string }
	| { readonly kind: "Deprecated" };

export type AdrStatus = {
	readonly lifecycle: AdrLifecycle;
	readonly text: string;
	readonly line: number;
};

export type StatusProblem =
	| { readonly kind: "missing" }
	| { readonly kind: "multiple"; readonly lines: readonly number[] }
	| { readonly kind: "unknown"; readonly text: string; readonly line: number };

export type AdrFile = { readonly path: string; readonly text: string };

export type AdrFolder = { readonly files: readonly AdrFile[] };

export type AdrProblem = {
	readonly file: string;
	readonly line: number;
	readonly message: string;
};

const STATUS_LINE = /^(?:Status:|-[ \t]+\*\*Status:\*\*)[ \t]*(.*?)[ \t]*$/;
const AMENDED_BY_LINE = /^(?:Amended by:|-[ \t]+\*\*Amended by:\*\*)/;
const DATE_LINE =
	/^(?:Date:|-[ \t]+\*\*Date:\*\*)[ \t]*(\d{4}-\d{2}-\d{2})[ \t]*\r?$/;
const LIFECYCLE =
	/^(?:(Proposed|Accepted|Deprecated)|Superseded by (\d{4}))(?:[ \t]+·[ \t]+\S(?:.*\S)?)?$/;
const DATED_START = /^> (?:Note|Amended) (\d{4}-\d{2}-\d{2}):/;
const HEADING = /^(#{1,6})[ \t]+(.*?)[ \t]*\r?$/;
const DECISION = /^###[ \t]+(D\d+)(?:\.[ \t]+|[ \t]+—[ \t]+)\S/;
const KEPT_PARTS = new Set(["Domain and effects", "Invariant audit"]);

function lifecycleOf(text: string): AdrLifecycle | undefined {
	const match = LIFECYCLE.exec(text);
	if (match === null) return undefined;
	const [, word, by] = match;
	if (by !== undefined) return { kind: "Superseded", by };
	switch (word) {
		case "Proposed":
		case "Accepted":
		case "Deprecated":
			return { kind: word };
		default:
			return undefined;
	}
}

export function adrStatus(text: string): Result<AdrStatus, StatusProblem> {
	const found = adrProse(text)
		.split("\n")
		.flatMap((line, index) => {
			const match = STATUS_LINE.exec(line);
			return match === null ? [] : [{ text: match[1] ?? "", line: index + 1 }];
		});
	const [status] = found;
	if (status === undefined) return err({ kind: "missing" });
	if (found.length !== 1)
		return err({ kind: "multiple", lines: found.map((one) => one.line) });
	const lifecycle = lifecycleOf(status.text);
	return lifecycle === undefined
		? err({ kind: "unknown", text: status.text, line: status.line })
		: ok({ lifecycle, text: status.text, line: status.line });
}

export function adrNumber(path: string): string | undefined {
	return /(?:^|\/)(\d{4})-[^/]*\.md$/.exec(path)?.[1];
}

type Span = {
	readonly key: string;
	readonly start: number;
	readonly end: number;
};

function proofSpans(text: string): readonly Span[] {
	const lines = adrProse(text).split("\n");
	const headings = lines.flatMap((line, index) => {
		const match = HEADING.exec(line);
		return match === null
			? []
			: [{ index, level: match[1]?.length ?? 0, title: match[2] ?? "", line }];
	});
	const spans: Span[] = [];
	let decision = "-";
	headings.forEach((heading, at) => {
		if (heading.level <= 3) decision = DECISION.exec(heading.line)?.[1] ?? "-";
		const until = (level: number) =>
			headings.slice(at + 1).find((next) => next.level <= level)?.index ??
			lines.length;
		if (
			heading.level === 4 &&
			PROOF_TITLES.some((title) => title === heading.title)
		)
			spans.push({
				key: `${decision} ${heading.title}`,
				start: heading.index,
				end: until(4),
			});
		if (heading.level === 2 && KEPT_PARTS.has(heading.title))
			spans.push({ key: heading.title, start: heading.index, end: until(2) });
	});
	return spans;
}

type Kept = { readonly line: number; readonly text: string };

function keptLines(text: string, drop: (span: Span) => boolean): Kept[] {
	const dropped = new Set(
		proofSpans(text)
			.filter(drop)
			.flatMap((span) =>
				Array.from(
					{ length: span.end - span.start },
					(_, index) => span.start + index,
				),
			),
	);
	return text
		.split("\n")
		.flatMap((line, index) =>
			dropped.has(index) ? [] : [{ line: index + 1, text: line }],
		);
}

type LineOp =
	| { readonly kind: "same"; readonly head: number }
	| { readonly kind: "removed"; readonly text: string }
	| { readonly kind: "added"; readonly head: number; readonly text: string };

function lineDiff(base: readonly Kept[], head: readonly Kept[]): LineOp[] {
	const width = head.length + 1;
	const common = new Int32Array((base.length + 1) * width);
	for (let i = base.length - 1; i >= 0; i--)
		for (let j = head.length - 1; j >= 0; j--)
			common[i * width + j] =
				base[i]?.text === head[j]?.text
					? (common[(i + 1) * width + j + 1] ?? 0) + 1
					: Math.max(
							common[(i + 1) * width + j] ?? 0,
							common[i * width + j + 1] ?? 0,
						);
	const ops: LineOp[] = [];
	let i = 0;
	let j = 0;
	while (i < base.length || j < head.length) {
		const from = base[i];
		const to = head[j];
		if (from !== undefined && to !== undefined && from.text === to.text) {
			ops.push({ kind: "same", head: to.line });
			i++;
			j++;
		} else if (
			from !== undefined &&
			(to === undefined ||
				(common[(i + 1) * width + j] ?? 0) >= (common[i * width + j + 1] ?? 0))
		) {
			ops.push({ kind: "removed", text: from.text });
			i++;
		} else if (to !== undefined) {
			ops.push({ kind: "added", head: to.line, text: to.text });
			j++;
		}
	}
	return ops;
}

function realDay(day: string): boolean {
	const at = new Date(`${day}T00:00:00Z`);
	return !Number.isNaN(at.getTime()) && at.toISOString().startsWith(day);
}

function datedLines(text: string, since: string | undefined): Set<number> {
	const lines = adrProse(text).split("\n");
	const dated = new Set<number>();
	let open = false;
	lines.forEach((line, index) => {
		const day = DATED_START.exec(line)?.[1];
		if (day !== undefined)
			open = realDay(day) && (since === undefined || day >= since);
		else if (!line.startsWith(">")) open = false;
		if (open) dated.add(index + 1);
	});
	return dated;
}

function adrDate(text: string): string | undefined {
	for (const line of adrProse(text).split("\n")) {
		const day = DATE_LINE.exec(line)?.[1];
		if (day !== undefined) return day;
	}
	return undefined;
}

function addedPasses(text: string, line: number, dated: Set<number>): boolean {
	if (text.trim() === "" || AMENDED_BY_LINE.test(text) || dated.has(line))
		return true;
	const status = STATUS_LINE.exec(text)?.[1];
	if (status === undefined) return false;
	const lifecycle = lifecycleOf(status);
	return lifecycle?.kind === "Superseded" || lifecycle?.kind === "Deprecated";
}

function byNumber(folder: AdrFolder): Map<string, AdrFile[]> {
	const files = new Map<string, AdrFile[]>();
	for (const file of folder.files) {
		const number = adrNumber(file.path);
		if (number !== undefined)
			files.set(number, [...(files.get(number) ?? []), file]);
	}
	return files;
}

export function amendProblems(
	base: AdrFolder,
	head: AdrFolder,
): readonly AdrProblem[] {
	const heads = byNumber(head);
	const problems: AdrProblem[] = [];
	for (const [number, [before]] of byNumber(base)) {
		if (before === undefined) continue;
		const status = adrStatus(before.text);
		if (status.ok && status.value.lifecycle.kind === "Proposed") continue;
		const label = status.ok ? status.value.lifecycle.kind : "not Proposed";
		const candidates = heads.get(number) ?? [];
		const after =
			candidates.find((file) => file.path === before.path) ?? candidates[0];
		if (after === undefined) {
			problems.push({
				file: before.path,
				line: 1,
				message: `ADR ${number} is ${label} at the base, so it stays in the folder; only a Proposed ADR can go`,
			});
			continue;
		}
		const baseKeys = new Set(proofSpans(before.text).map((span) => span.key));
		const dated = datedLines(after.text, adrDate(before.text));
		const lines = new Set<number>();
		let last = 0;
		for (const op of lineDiff(
			keptLines(before.text, () => true),
			keptLines(after.text, (span) => baseKeys.has(span.key)),
		))
			switch (op.kind) {
				case "same":
					last = op.head;
					break;
				case "removed":
					if (!STATUS_LINE.test(op.text) && !AMENDED_BY_LINE.test(op.text))
						lines.add(last + 1);
					break;
				case "added":
					last = op.head;
					if (!addedPasses(op.text, op.head, dated)) lines.add(op.head);
					break;
				default: {
					const unreachable: never = op;
					return unreachable;
				}
			}
		for (const line of [...lines].sort((a, b) => a - b))
			problems.push({
				file: after.path,
				line,
				message: `ADR ${number} is ${label} at the base, so it changes only by a dated > Note or > Amended block, a status line or its Amended by: line`,
			});
	}
	return problems;
}
