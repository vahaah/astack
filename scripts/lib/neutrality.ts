import type { HashMatcher } from "../../src/astack/deny-list.ts";

export type Finding = {
	file: string;
	line?: number;
	rule: string;
	detail: string;
};

export type TextFile = { path: string; content: string };

export type FileScan = (file: TextFile) => Finding[];

export const HASH_RULES = ["denied-name", "denied-name-in-path"] as const;

type HashRule = (typeof HASH_RULES)[number];

export function scanHashes(file: TextFile, matcher: HashMatcher): Finding[] {
	const findings: Finding[] = matcher
		.pathCarriesListedToken(file.path)
		.map((prefix) => ({
			file: file.path,
			rule: "denied-name-in-path" satisfies HashRule,
			detail: `hash ${prefix}`,
		}));
	file.content.split("\n").forEach((line, index) => {
		for (const prefix of matcher.listedPrefixes(line)) {
			findings.push({
				file: file.path,
				line: index + 1,
				rule: "denied-name" satisfies HashRule,
				detail: `hash ${prefix}`,
			});
		}
	});
	return findings;
}

const conflictMarker = /^(<{7}|\|{7}|>{7}|={7})(\s|$)/;

export function scanConflictMarkers(file: TextFile): Finding[] {
	const findings: Finding[] = [];
	file.content.split("\n").forEach((line, index) => {
		if (conflictMarker.test(line)) {
			findings.push({
				file: file.path,
				line: index + 1,
				rule: "conflict-marker",
				detail: `line starts with ${line.slice(0, 7)}`,
			});
		}
	});
	return findings;
}

const adrCitation = /\bADR[ -]?\d{4}\s+D\d+\b/g;

export function scanAdrCitations(file: TextFile): Finding[] {
	const findings: Finding[] = [];
	file.content.split("\n").forEach((line, index) => {
		for (const match of line.matchAll(adrCitation)) {
			findings.push({
				file: file.path,
				line: index + 1,
				rule: "adr-citation",
				detail: match[0],
			});
		}
	});
	return findings;
}

export function scanSubstrings(
	file: TextFile,
	substrings: readonly string[],
): Finding[] {
	const needles = substrings.map((substring) => substring.toLowerCase());
	const findings: Finding[] = [];
	const check = (text: string, line?: number) => {
		const lower = text.toLowerCase();
		for (const needle of needles) {
			if (lower.includes(needle)) {
				findings.push({
					file: file.path,
					...(line === undefined ? {} : { line }),
					rule:
						line === undefined
							? "denied-substring-in-path"
							: "denied-substring",
					detail: needle,
				});
			}
		}
	};
	check(file.path);
	file.content.split("\n").forEach((line, index) => {
		check(line, index + 1);
	});
	return findings;
}

export function coversPath(entries: readonly string[], path: string): boolean {
	return entries.some((entry) =>
		entry.endsWith("/") ? path.startsWith(entry) : path === entry,
	);
}

export type TargetLint = {
	matcher: HashMatcher;
	adrCitation: boolean;
	conflictMarkers: boolean;
	denySubstrings: readonly string[];
	denySubstringsExempt: readonly string[];
	leaks?: FileScan;
};

export function lintFiles(
	files: readonly TextFile[],
	lint: TargetLint,
): Finding[] {
	return files.flatMap((file) => [
		...scanHashes(file, lint.matcher),
		...(lint.leaks?.(file) ?? []),
		...(lint.conflictMarkers ? scanConflictMarkers(file) : []),
		...(lint.adrCitation ? scanAdrCitations(file) : []),
		...(lint.denySubstrings.length > 0 &&
		!coversPath(lint.denySubstringsExempt, file.path)
			? scanSubstrings(file, lint.denySubstrings)
			: []),
	]);
}

export function formatFinding(finding: Finding): string {
	const where =
		finding.line === undefined
			? finding.file
			: `${finding.file}:${finding.line}`;
	return `${where}: ${finding.rule}: ${finding.detail}`;
}
