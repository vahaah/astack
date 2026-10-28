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

export const MAX_NAME_WORDS = 4;

const nonAlphanumeric = /[^a-z0-9]+/;
const camelBoundary = /(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/g;

export function wordTokens(text: string): string[] {
	return text
		.replace(camelBoundary, " ")
		.toLowerCase()
		.split(nonAlphanumeric)
		.filter((token) => token !== "");
}

export function sha256(token: string): string {
	return Bun.SHA256.hash(token, "hex");
}

export function nameHash(name: string): string {
	return sha256(wordTokens(name).join(""));
}

export function parseHashList(text: string): {
	hashes: Set<string>;
	errors: string[];
} {
	const lines = text.split("\n");
	if (lines.at(-1) === "") lines.pop();
	const hashes = new Set<string>();
	const errors: string[] = [];
	lines.forEach((line, index) => {
		if (/^[0-9a-f]{64}$/.test(line)) hashes.add(line);
		else errors.push(`line ${index + 1} is not 64 lowercase hex characters`);
	});
	return { hashes, errors };
}

export class HashMatcher {
	readonly #hashes: ReadonlySet<string>;

	constructor(hashes: ReadonlySet<string>) {
		this.#hashes = hashes;
	}

	#listedPrefix(text: string): string | undefined {
		const hash = sha256(text);
		return this.#hashes.has(hash) ? hash.slice(0, 8) : undefined;
	}

	listedPrefixes(text: string): string[] {
		const tokens = wordTokens(text);
		const found = new Set<string>();
		tokens.forEach((_, start) => {
			let joined = "";
			for (const token of tokens.slice(start, start + MAX_NAME_WORDS)) {
				joined += token;
				const prefix = this.#listedPrefix(joined);
				if (prefix !== undefined) found.add(prefix);
			}
		});
		return [...found];
	}

	pathCarriesListedToken(path: string): string[] {
		const found = new Set(this.listedPrefixes(path));
		for (const word of path.toLowerCase().split(nonAlphanumeric)) {
			for (let start = 0; start < word.length; start++) {
				for (let end = start + 1; end <= word.length; end++) {
					const prefix = this.#listedPrefix(word.slice(start, end));
					if (prefix !== undefined) found.add(prefix);
				}
			}
		}
		return [...found];
	}
}

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
