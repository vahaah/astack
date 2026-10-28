import { checkText, DEFAULT_GLOSSARY } from "../ste/check.ts";
import type { Finding } from "../ste/types.ts";
import type { Line, Severity } from "./types.ts";

export type ProseFinding = {
	readonly line: number;
	readonly severity: Severity;
	readonly group: "prose" | "ste";
	readonly message: string;
};

const EMOJI = /\p{Extended_Pictographic}/u;
const LONG_DASH = /—/;
const EN_DASH = /(?<!\d)–|–(?!\d)/;
const CURLY_QUOTE = /[‘’“”]/;
const TABLE_ROW = /^\s*\|/;

function plain(text: string): string {
	return text
		.replace(/`[^`]*`/g, "x")
		.replace(/!\[[^\]]*\]\([^)]*\)/g, "")
		.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/https?:\/\/\S+/g, "x");
}

function lineFindings(line: Line): ProseFinding[] {
	const text = plain(line.text);
	const found: ProseFinding[] = [];
	const add = (severity: Severity, message: string): void => {
		found.push({ line: line.n, severity, group: "prose", message });
	};
	if (TABLE_ROW.test(line.text)) {
		if (LONG_DASH.test(text))
			add("error", "long dash; use a period or a comma");
		if (EN_DASH.test(text)) add("error", "en dash outside a number range");
	}
	if (CURLY_QUOTE.test(text)) add("error", "curly quote; use a straight quote");
	if (EMOJI.test(text)) add("error", "emoji");
	if (TABLE_ROW.test(line.text) || /^\s*#/.test(line.text)) return found;
	if (/: \S/.test(text.replace(/^\s*[-*]\s+/, "")))
		add("warning", "mid-sentence colon; end the sentence instead");
	return found;
}

function textOf(lines: readonly Line[]): string {
	const rows: string[] = [];
	for (const line of lines) rows[line.n - 1] = line.text;
	return Array.from(rows, (row) => row ?? "").join("\n");
}

function steFinding(finding: Finding): ProseFinding | undefined {
	if (finding.rule === "dash")
		return {
			line: finding.line,
			severity: "error",
			group: "ste",
			message: `STE dash: ${finding.fix}`,
		};
	if (finding.severity !== "deny") return undefined;
	return {
		line: finding.line,
		severity: "warning",
		group: "ste",
		message: `STE ${finding.rule}: ${finding.fix}`,
	};
}

export function steFindings(lines: readonly Line[]): ProseFinding[] {
	return checkText(textOf(lines), {
		surface: "doc",
		enforcement: "deny",
		glossary: DEFAULT_GLOSSARY,
	}).findings.flatMap((finding) => steFinding(finding) ?? []);
}

export function proseFindings(lines: readonly Line[]): ProseFinding[] {
	return [
		...lines.filter((line) => !line.code).flatMap(lineFindings),
		...steFindings(lines),
	].sort((a, b) => a.line - b.line);
}
