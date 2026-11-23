import type { ModelRegistry } from "./change-proof/rung.ts";
import { parseDomainBlock } from "./domain/notation.ts";
import { type ContextsCard, recordFindings } from "./domain/rules.ts";
import { domainFences } from "./plan/domain.ts";
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

export type AdrFolder = {
	readonly files: readonly AdrFile[];
	readonly index: AdrFile | undefined;
};

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

export type TemplateFacts = {
	readonly card: ContextsCard | undefined;
	readonly registry: ModelRegistry | undefined;
	readonly glossary:
		| { readonly path: string; readonly terms: ReadonlySet<string> }
		| undefined;
	readonly controls: ReadonlySet<string>;
};

type Relation = {
	readonly number: string;
	readonly decisions: readonly string[];
};

type RelationLine = {
	readonly line: number;
	readonly groups: readonly Relation[];
};

type AdrRecord = {
	readonly file: AdrFile;
	readonly number: string;
	readonly status: Result<AdrStatus, StatusProblem>;
	readonly supersedes: RelationLine | undefined;
	readonly amends: RelationLine | undefined;
	readonly amendedBy: RelationLine | undefined;
};

function headerLine(text: string, key: string): RelationLine | undefined {
	const pattern = new RegExp(
		`^(?:${key}:|-[ \\t]+\\*\\*${key}:\\*\\*)[ \\t]*(.*)$`,
	);
	const lines = adrProse(text).split("\n");
	for (const [index, line] of lines.entries()) {
		const value = pattern.exec(line)?.[1];
		if (value === undefined) continue;
		const groups: { number: string; decisions: string[] }[] = [];
		for (const token of value.matchAll(/\b(\d{4})\b|\b(D\d+)\b/g)) {
			const [, number, decision] = token;
			if (number !== undefined) groups.push({ number, decisions: [] });
			else if (decision !== undefined) groups.at(-1)?.decisions.push(decision);
		}
		return { line: index + 1, groups };
	}
	return undefined;
}

function adrRecordOf(file: AdrFile, number: string): AdrRecord {
	return {
		file,
		number,
		status: adrStatus(file.text),
		supersedes: headerLine(file.text, "Supersedes"),
		amends: headerLine(file.text, "Amends"),
		amendedBy: headerLine(file.text, "Amended by"),
	};
}

function sortProblems(problems: AdrProblem[]): AdrProblem[] {
	return problems.sort((a, b) =>
		a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1,
	);
}

function basename(path: string): string {
	return path.slice(path.lastIndexOf("/") + 1);
}

function h1Title(text: string, number: string): string | undefined {
	for (const line of adrProse(text).split("\n")) {
		const match = /^#[ \t]+(\d{4})\.[ \t]+(.*?)[ \t]*\r?$/.exec(line);
		if (match !== null) return match[1] === number ? match[2] : undefined;
		if (/^#[ \t]/.test(line)) return undefined;
	}
	return undefined;
}

function indexProblems(
	folder: AdrFolder,
	records: ReadonlyMap<string, AdrRecord>,
): AdrProblem[] {
	const problems: AdrProblem[] = [];
	const seen = new Map<string, AdrFile>();
	for (const file of folder.files) {
		const number = adrNumber(file.path);
		if (number === undefined) continue;
		const first = seen.get(number);
		if (first === undefined) seen.set(number, file);
		else
			problems.push({
				file: file.path,
				line: 1,
				message: `ADR ${number} has two files, ${first.path} and ${file.path}`,
			});
		if (h1Title(file.text, number) === undefined)
			problems.push({
				file: file.path,
				line: 1,
				message: `${file.path} needs an H1 "# ${number}. <title>"`,
			});
	}
	const { index } = folder;
	if (index === undefined) {
		const [file] = folder.files;
		return file === undefined
			? problems
			: [
					...problems,
					{
						file: file.path,
						line: 1,
						message: "the ADR folder has no README.md index",
					},
				];
	}
	const rows = new Map<string, number>();
	for (const [at, line] of index.text.split("\n").entries()) {
		const row =
			/^\|[ \t]*\[(\d{4})\]\(([^)]+)\)[ \t]*\|[ \t]*(.*?)[ \t]*\|[ \t]*(.*?)[ \t]*\|[ \t]*\r?$/.exec(
				line,
			);
		if (row === null) continue;
		const [, number = "", link = "", title = "", status = ""] = row;
		const problem = (message: string) =>
			problems.push({ file: index.path, line: at + 1, message });
		if (rows.has(number)) {
			problem(`ADR ${number} has a second row`);
			continue;
		}
		rows.set(number, at + 1);
		const file = folder.files.find(
			(one) => basename(one.path) === basename(link),
		);
		const record = records.get(number);
		if (file === undefined || adrNumber(file.path) !== number) {
			problem(
				`the row of ADR ${number} links ${link}, and no ADR file has that name`,
			);
			continue;
		}
		const h1 = h1Title(file.text, number);
		if (h1 !== undefined && h1 !== title)
			problem(
				`the row of ADR ${number} gives the title "${title}", and the H1 of ${file.path} gives "${h1}"`,
			);
		const own = record?.status;
		if (
			own?.ok &&
			JSON.stringify(lifecycleOf(status)) !==
				JSON.stringify(own.value.lifecycle)
		)
			problem(
				`the row of ADR ${number} gives the status "${status}", and ${file.path} has "${own.value.text}"`,
			);
	}
	for (const [number, record] of records)
		if (!rows.has(number))
			problems.push({
				file: record.file.path,
				line: 1,
				message: `ADR ${number} has no row in ${index.path}`,
			});
	return problems;
}

function isLive(record: AdrRecord): boolean {
	return (
		record.status.ok &&
		(record.status.value.lifecycle.kind === "Accepted" ||
			record.status.value.lifecycle.kind === "Proposed")
	);
}

function cites(record: AdrRecord, target: AdrRecord): boolean {
	return (
		(record.amends?.groups.some((group) => group.number === target.number) ??
			false) ||
		new RegExp(`\\bADR[ -]${target.number}\\b`).test(record.file.text) ||
		record.file.text.includes(basename(target.file.path))
	);
}

function relationProblems(
	records: ReadonlyMap<string, AdrRecord>,
): AdrProblem[] {
	const problems: AdrProblem[] = [];
	const unresolved = (
		record: AdrRecord,
		at: RelationLine,
		group: Relation,
		target: AdrRecord,
	) => {
		for (const decision of group.decisions)
			if (decisionHeading(target.file.text, decision) === undefined)
				problems.push({
					file: record.file.path,
					line: at.line,
					message: `ADR ${target.number} has no ### ${decision}. heading`,
				});
	};
	for (const record of records.values()) {
		const { file, number } = record;
		const missing = (line: number, relation: string, other: string) =>
			problems.push({
				file: file.path,
				line,
				message: `ADR ${number} ${relation} ${other}, and no ADR file holds ${other}`,
			});
		const { supersedes, amends, amendedBy, status } = record;
		for (const group of supersedes?.groups ?? []) {
			if (supersedes === undefined) break;
			const target = records.get(group.number);
			if (target === undefined) {
				missing(supersedes.line, "supersedes", group.number);
				continue;
			}
			const lifecycle = target.status.ok
				? target.status.value.lifecycle
				: undefined;
			if (lifecycle?.kind !== "Superseded" || lifecycle.by !== number)
				problems.push({
					file: file.path,
					line: supersedes.line,
					message: `ADR ${number} supersedes ${group.number}, and ${target.file.path} has the status "${target.status.ok ? target.status.value.text : "unreadable"}", not "Superseded by ${number}"`,
				});
		}
		if (status.ok && status.value.lifecycle.kind === "Superseded") {
			const { by } = status.value.lifecycle;
			const newer = records.get(by);
			if (newer === undefined)
				missing(status.value.line, "is superseded by", by);
			else if (
				!(newer.supersedes?.groups ?? []).some(
					(group) => group.number === number,
				)
			)
				problems.push({
					file: file.path,
					line: status.value.line,
					message: `ADR ${number} has the status Superseded by ${by}, and ${newer.file.path} has no Supersedes: line that names ${number}`,
				});
		}
		for (const group of amends?.groups ?? []) {
			if (amends === undefined) break;
			const target = records.get(group.number);
			if (target === undefined) {
				missing(amends.line, "amends", group.number);
				continue;
			}
			unresolved(record, amends, group, target);
			if (
				isLive(record) &&
				!(target.amendedBy?.groups ?? []).some(
					(entry) => entry.number === number,
				)
			)
				problems.push({
					file: file.path,
					line: amends.line,
					message: `ADR ${number} amends ${group.number}, and ${target.file.path} names no ${number} in its Amended by: line`,
				});
		}
		for (const group of amendedBy?.groups ?? []) {
			if (amendedBy === undefined) break;
			const source = records.get(group.number);
			if (source === undefined) {
				missing(amendedBy.line, "is amended by", group.number);
				continue;
			}
			unresolved(record, amendedBy, group, source);
			if (!cites(source, record))
				problems.push({
					file: file.path,
					line: amendedBy.line,
					message: `ADR ${number} names ${group.number} in its Amended by: line, and ${source.file.path} has no Amends line, text "ADR ${number}" or link for it`,
				});
		}
	}
	return problems;
}

function records(folder: AdrFolder): Map<string, AdrRecord> {
	const found = new Map<string, AdrRecord>();
	for (const [number, [file]] of byNumber(folder))
		if (file !== undefined) found.set(number, adrRecordOf(file, number));
	return found;
}

export function treeProblems(folder: AdrFolder): readonly AdrProblem[] {
	const found = records(folder);
	return sortProblems([
		...indexProblems(folder, found),
		...relationProblems(found),
	]);
}

const PARTS: readonly string[] = [
	"Context",
	"Decisions",
	"Domain and effects",
	"Consequences",
	"Alternatives considered",
];

const HEADER_KEYS = ["Date", "Supersedes", "Amends"] as const;

type Part = {
	readonly title: string;
	readonly line: number;
	readonly end: number;
};

function parts(text: string): readonly Part[] {
	const lines = adrProse(text).split("\n");
	const starts = lines.flatMap((line, index) => {
		const match = /^##[ \t]+(.*?)[ \t]*\r?$/.exec(line);
		return match === null || /^#[ \t]/.test(line)
			? /^#[ \t]/.test(line)
				? [{ title: "", line: index + 1 }]
				: []
			: [{ title: match[1] ?? "", line: index + 1 }];
	});
	return starts.map((start, at) => ({
		...start,
		end: starts[at + 1]?.line ?? lines.length + 1,
	}));
}

function domainPart(text: string): Part | undefined {
	return parts(text).find((part) => part.title === "Domain and effects");
}

function partText(text: string, part: Part | undefined): string | undefined {
	return part === undefined
		? undefined
		: text
				.split("\n")
				.slice(part.line - 1, part.end - 1)
				.join("\n");
}

function blockProblems(
	file: AdrFile,
	part: Part,
	facts: TemplateFacts,
): AdrProblem[] {
	const problems: AdrProblem[] = [];
	const problem = (line: number, message: string) =>
		problems.push({ file: file.path, line, message });
	const raw = file.text.split("\n");
	const body = raw
		.slice(part.line, part.end - 1)
		.map((text, index) => ({ n: part.line + index + 1, text }));
	const prose = adrProse(file.text).split("\n");
	const terms = body.find(({ n }) =>
		/^Terms\.(?:[ \t]|$)/.test(prose[n - 1] ?? ""),
	);
	if (terms === undefined)
		problem(
			part.line,
			`## ${part.title} needs a Terms. line with glossary terms or none`,
		);
	else {
		const names = terms.text
			.replace(/^Terms\.[ \t]*/, "")
			.replace(/\.[ \t]*$/, "")
			.split(",")
			.map((name) => name.trim())
			.filter((name) => name !== "");
		if (names.length === 0)
			problem(terms.n, "Terms. names glossary terms, or none");
		if (!(names.length === 1 && names[0]?.toLowerCase() === "none"))
			for (const name of names)
				if (facts.glossary === undefined)
					problem(
						terms.n,
						`Terms. names "${name}", but the repo has no glossary`,
					);
				else if (!facts.glossary.terms.has(name))
					problem(
						terms.n,
						`Terms. names "${name}", which ${facts.glossary.path} does not define`,
					);
	}
	const [fence, ...extra] = domainFences(body);
	for (const other of extra)
		problem(
			other.line,
			`## ${part.title} holds one domain fence, and this is a second`,
		);
	if (fence === undefined) {
		if (!body.some(({ n }) => /^None\.[ \t]+\S/.test(prose[n - 1] ?? "")))
			problem(
				part.line,
				`## ${part.title} needs one domain fence, or None. and a reason`,
			);
		return problems;
	}
	const parsed = parseDomainBlock(fence.lines);
	if (!parsed.ok) {
		for (const one of parsed.error) problem(one.line, one.message);
		return problems;
	}
	const block = parsed.value;
	if (facts.card !== undefined)
		for (const one of recordFindings(block, facts.card, facts.registry))
			problem(one.line, one.message);
	for (const law of block.laws)
		if (law.check?.kind === "prop" && !facts.controls.has(law.check.control))
			problem(
				law.line,
				`law ${law.id} cites control:${law.check.control}, which no test under tests/ declares`,
			);
	return problems;
}

function newAdrProblems(file: AdrFile, facts: TemplateFacts): AdrProblem[] {
	const problems: AdrProblem[] = [];
	const problem = (line: number, message: string) =>
		problems.push({ file: file.path, line, message });
	const status = adrStatus(file.text);
	if (!status.ok) problem(1, "a new ADR needs one Status line");
	else if (
		status.value.lifecycle.kind !== "Proposed" &&
		status.value.lifecycle.kind !== "Accepted"
	)
		problem(
			status.value.line,
			`a new ADR has the status Proposed or Accepted, not "${status.value.text}"`,
		);
	const lines = adrProse(file.text).split("\n");
	const firstPart = parts(file.text).find((part) => part.title !== "");
	const header = lines.slice(0, (firstPart?.line ?? lines.length + 1) - 1);
	if (!header.some((line) => DATE_LINE.test(line)))
		problem(1, "a new ADR needs the header line Date:");
	for (const key of HEADER_KEYS.slice(1))
		if (
			!header.some((line) =>
				new RegExp(`^(?:${key}:|-[ \\t]+\\*\\*${key}:\\*\\*)`).test(line),
			)
		)
			problem(1, `a new ADR needs the header line ${key}:`);
	const found = parts(file.text);
	let last = -1;
	let ordered = true;
	for (const part of found) {
		const at = PARTS.indexOf(part.title);
		if (at < 0) continue;
		if (at < last && ordered) {
			ordered = false;
			problem(
				part.line,
				`## ${part.title} comes after ## ${PARTS[last]}; keep the order of the template`,
			);
		}
		last = Math.max(last, at);
	}
	for (const title of PARTS)
		if (!found.some((part) => part.title === title))
			problem(1, `a new ADR needs the part ## ${title}`);
	const decisions = found.find((part) => part.title === "Decisions");
	const d1 = decisionHeading(file.text, "D1");
	if (decisions !== undefined) {
		const d1Line =
			d1 === undefined ? undefined : file.text.slice(0, d1).split("\n").length;
		if (
			d1Line === undefined ||
			d1Line < decisions.line ||
			d1Line >= decisions.end
		)
			problem(decisions.line, "## Decisions needs a ### D1. heading");
	}
	const domain = domainPart(file.text);
	if (domain !== undefined)
		problems.push(...blockProblems(file, domain, facts));
	return problems;
}

export function templateProblems(
	base: AdrFolder,
	head: AdrFolder,
	facts: TemplateFacts,
): readonly AdrProblem[] {
	const before = byNumber(base);
	const problems: AdrProblem[] = [];
	for (const [number, files] of byNumber(head))
		for (const file of files) {
			const old = before.get(number)?.[0];
			if (old === undefined) {
				problems.push(...newAdrProblems(file, facts));
				continue;
			}
			const part = domainPart(file.text);
			if (
				part !== undefined &&
				partText(file.text, part) !== partText(old.text, domainPart(old.text))
			)
				problems.push(...blockProblems(file, part, facts));
		}
	return sortProblems(problems);
}
