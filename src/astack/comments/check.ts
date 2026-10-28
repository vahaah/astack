import { addedUnits, type ChangeScope, unitsOf } from "./added.ts";
import {
	type Classification,
	type ClassifyContext,
	type CommentPolicy,
	classify,
} from "./classify.ts";
import { languageOf } from "./lexer.ts";
import { type CommentSize, rewriteLines } from "./limits.ts";
import { type CommentUnit, paragraphRuns } from "./units.ts";

export interface Finding {
	path: string;
	line: number;
	verdict: "deny" | "judge";
	rule: string;
	quote: string[];
	size?: CommentSize;
}

export interface SourceChange extends ChangeScope {
	relPath: string;
	before: string | undefined;
	after: string;
}

const SKIPPED_PATHS: RegExp[] = [
	/(?:^|\/)node_modules\//,
	/\.mdx?$/i,
	/(?:^|\/)(?:fixtures|__fixtures__|vendor|generated)\//,
	/\.generated\./,
];

export function isCheckedPath(relPath: string): boolean {
	return (
		languageOf(relPath) !== undefined &&
		!SKIPPED_PATHS.some((pattern) => pattern.test(relPath))
	);
}

function deniedHere(
	result: Exclude<Classification, { verdict: "keep" }>,
	newLines: number[],
): number[] {
	if (result.verdict !== "deny") return [];
	const hits = result.lines.filter((index) => newLines.includes(index));
	const linesBefore = result.size ? result.size.lines - hits.length : 0;
	return result.size && linesBefore > result.size.limit ? [] : hits;
}

function textLines(unit: CommentUnit): number {
	return unit.lines.filter((line) => line.text).length;
}

function unproven(result: Classification): boolean {
	return result.verdict === "judge" && result.rule === "judge" && !result.size;
}

function paragraphLengths(
	after: string,
	ctx: ClassifyContext,
): Map<number, number> {
	const lengths = new Map<number, number>();
	const units = unitsOf(after, ctx.language);
	if (!units) return lengths;
	for (const run of paragraphRuns(after, units)) {
		if (run.length < 2) continue;
		const judged = run.filter((unit) => unproven(classify(unit, ctx)));
		if (judged.length < 2) continue;
		const total = judged.reduce((sum, unit) => sum + textLines(unit), 0);
		for (const unit of judged) lengths.set(unit.start, total);
	}
	return lengths;
}

function withParagraphLength(
	result: Exclude<Classification, { verdict: "keep" }>,
	unit: CommentUnit,
	lengths: Map<number, number>,
	ctx: ClassifyContext,
): Exclude<Classification, { verdict: "keep" }> {
	const total = lengths.get(unit.start);
	const limit = ctx.limits.block;
	if (!unproven(result) || total === undefined || total <= limit.max)
		return result;
	return {
		verdict: limit.over,
		rule: "long-comment",
		lines: unit.lines.flatMap((line, index) => (line.text ? [index] : [])),
		size: { kind: "block", lines: total, limit: limit.max },
	};
}

export function checkChange(
	change: SourceChange,
	policy: CommentPolicy,
	typeHook = false,
): Finding[] | undefined {
	const language = languageOf(change.relPath);
	if (!language || !isCheckedPath(change.relPath)) return [];
	const added = addedUnits(change.before, change.after, language, change);
	if (!added) return undefined;
	const ctx: ClassifyContext = {
		language,
		relPath: change.relPath,
		...policy,
		typeHook,
	};
	const lengths = paragraphLengths(change.after, ctx);
	const findings: Finding[] = [];
	for (const { unit, newLines } of added) {
		const classified = classify(unit, ctx);
		if (classified.verdict === "keep") continue;
		const result = withParagraphLength(classified, unit, lengths, ctx);
		const size = result.size ? { size: result.size } : {};
		const hits = deniedHere(result, newLines);
		if (hits.length > 0) {
			const first = unit.lines[hits[0] ?? 0];
			findings.push({
				path: change.relPath,
				line: first?.line ?? unit.startLine,
				verdict: "deny",
				rule: result.rule,
				quote: hits.map((index) => unit.lines[index]?.raw ?? ""),
				...size,
			});
			continue;
		}
		const first = unit.lines[newLines[0] ?? 0];
		findings.push({
			path: change.relPath,
			line: first?.line ?? unit.startLine,
			verdict: "judge",
			rule: result.verdict === "judge" || result.size ? result.rule : "judge",
			quote: newLines.map((index) => unit.lines[index]?.raw ?? ""),
			...size,
		});
	}
	return findings;
}

const RULE_LABELS: Record<string, string> = {
	narration: "narrates a change or an earlier version",
	provenance: "carries a ticket, plan, PR, review or date tag",
	"file-line": "points at a file:line that moves on the next edit",
	"own-path": "repeats the file's own path",
	banner: "is a section banner",
	"commented-out-code": "is commented-out code",
	restating: "only restates the code it sits on",
	suppression:
		"suppresses a correctness or safety check; fix the cause instead",
};

const MAX_LISTED = 12;
const MAX_QUOTE = 160;

function quoteOf(finding: Finding): string {
	const text = finding.quote.join(" ").replace(/\s+/g, " ").trim();
	return text.length > MAX_QUOTE ? `${text.slice(0, MAX_QUOTE - 1)}…` : text;
}

function sizeLabel(size: CommentSize): string {
	const what = size.kind === "export-doc" ? "is a doc comment" : "is a comment";
	return `${what} of ${size.lines} lines, over the ${size.limit}-line limit`;
}

function listFindings(findings: Finding[], withRule: boolean): string {
	const shown = findings.slice(0, MAX_LISTED).map((finding) => {
		const rule = finding.size
			? sizeLabel(finding.size)
			: withRule
				? (RULE_LABELS[finding.rule] ?? finding.rule)
				: undefined;
		const label = rule ? ` ${rule}:` : "";
		return `- ${finding.path}:${finding.line}${label} ${quoteOf(finding)}`;
	});
	if (findings.length > MAX_LISTED)
		shown.push(`- and ${findings.length - MAX_LISTED} more`);
	return shown.join("\n");
}

export const KEEP_LIST =
	"A comment survives only as one of these: a license or SPDX header; non-obvious behaviour forced by an external dependency, platform, vendor or protocol we cannot reshape; prettier-ignore, or a lint suppression whose rule is faulty, pedantic or style-only; a doc comment that defines a public API contract; an issue or RFC link for a constraint the code cannot express.";

const SICKO_ON_LENGTH =
	'comment-sicko: "A long justification without a proven keep-list exception is a confession. Kill it. Never polish meat into a shorter alibi."';

function longDenial(sizes: CommentSize[]): string {
	const max = rewriteLines(sizes);
	return `Delete the comment unless a keep rule covers it, and never shorten an uncovered comment to pass. ${SICKO_ON_LENGTH} A comment that a keep rule covers fits in ${max === 1 ? "1 line" : `${max} lines`}. Keep the lines that state its constraint, and move the rest into a name, a type, a test or an ADR.`;
}

function sizesOf(findings: Finding[]): CommentSize[] {
	return findings.flatMap((finding) => (finding.size ? [finding.size] : []));
}

export function denyMessage(subject: string, findings: Finding[]): string {
	const sizes = sizesOf(findings);
	const junk = findings.length > sizes.length;
	const what = [
		junk ? "comments that no keep rule covers" : "",
		sizes.length > 0 ? "comments over the line limit" : "",
	]
		.filter(Boolean)
		.join(" and ");
	return [
		`astack blocked ${subject}: it adds ${what}.`,
		listFindings(findings, true),
		junk
			? `Delete them, or move the intent into a name, a type, a test or the commit message. ${KEEP_LIST} /astack:no-comments judges the rest before a PR. A repo can allow its own comment forms with commentKeep patterns in .astack/profile.json.`
			: "",
		sizes.length > 0 ? longDenial(sizes) : "",
	]
		.filter(Boolean)
		.join("\n");
}

export function adviceMessage(findings: Finding[]): string {
	const sizes = sizesOf(findings);
	const unproven = findings.length > sizes.length;
	return [
		unproven
			? "astack: this change adds comments that need a reason to exist."
			: "astack: this change adds comments over the line limit.",
		listFindings(findings, false),
		unproven
			? "Keep one only if it states a constraint the code cannot show, forced by an external dependency, platform, vendor or protocol we cannot reshape. Otherwise delete it or move the intent into a name, type or test. /astack:no-comments judges these before the PR."
			: "",
		sizes.length > 0
			? `Keep a long comment only if it is a doc comment that defines a public API contract, and cut it to the contract. A public API is an export that other packages import from its package's entry point, or an HTTP or RPC route that clients call. Move the rest into names, types, tests or an ADR. ${SICKO_ON_LENGTH}`
			: "",
	]
		.filter(Boolean)
		.join("\n");
}
