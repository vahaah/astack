import type { Finding } from "./types.ts";

export const DENY_BUDGET = 2000;
const REPLY_FINDINGS = 8;
const NOTE_FINDINGS = 8;
export const REWRITE_TAIL =
	"Send the full reply again in ASD-STE100. Keep every fact, number, path, link and command. Keep quote blocks and code as they are. Do not call tools.";

const QUOTE_LIMIT = 160;

function clip(text: string, limit = QUOTE_LIMIT): string {
	const flat = text.replace(/\s+/g, " ").trim();
	return flat.length > limit ? `${flat.slice(0, limit - 3)}...` : flat;
}

function plural(count: number, one: string, many: string): string {
	return `${count} ${count === 1 ? one : many}`;
}

export function findingLine(finding: Finding): string {
	return `L${finding.line} ${finding.rule}: ${finding.fix} Sentence: "${clip(finding.sentence)}"`;
}

function withinBudget(lines: readonly string[], budget: number): string[] {
	const kept: string[] = [];
	let used = 0;
	for (const line of lines) {
		if (used + line.length + 1 > budget) break;
		kept.push(line);
		used += line.length + 1;
	}
	return kept;
}

export function denyMessage(
	subject: string,
	findings: readonly Finding[],
): string {
	const lines = withinBudget(findings.map(findingLine), DENY_BUDGET);
	const rest = findings.length - lines.length;
	return [
		`astack STE blocked ${subject}: ${plural(findings.length, "finding", "findings")} from the ASD-STE100 deny rules.`,
		...lines,
		...(rest > 0 ? [`There are ${rest} more findings.`] : []),
		"Fix each sentence and send the text again. Only new sentences count. To examine a draft first, run `astack check-ste -`.",
	].join("\n");
}

export function adviceMessage(
	subject: string,
	findings: readonly Finding[],
): string {
	const shown = findings.slice(0, NOTE_FINDINGS).map(findingLine);
	const rest = findings.length - shown.length;
	return [
		`astack STE advice for ${subject}: ${plural(findings.length, "finding", "findings")} from the ASD-STE100 rules.`,
		...shown,
		...(rest > 0 ? [`There are ${rest} more findings.`] : []),
		"Fix them where the fix keeps the meaning.",
	].join("\n");
}

export function rewriteReason(findings: readonly Finding[]): string {
	const shown = findings
		.slice(0, REPLY_FINDINGS)
		.map(
			(finding, index) =>
				`${index + 1}. ${finding.rule}: "${clip(finding.sentence)}" Fix: ${finding.fix}`,
		);
	const rest = findings.length - shown.length;
	return [
		`astack STE: the reply has ${plural(findings.length, "finding", "findings")} from the ASD-STE100 deny rules.`,
		...shown,
		...(rest > 0 ? [`There are ${rest} more findings.`] : []),
		REWRITE_TAIL,
	].join("\n");
}

export function pendingNote(count: number): string {
	return `astack STE: the last reply still had ${plural(count, "finding", "findings")} after one rewrite. Write this reply in ASD-STE100.`;
}
