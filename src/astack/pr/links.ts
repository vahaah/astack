const CLOSING_WORD =
	"close[sd]?|closing|fix(?:e[sd])?|fixing|resolve[sd]?|resolving|complete[sd]?|completing";

const TICKET_REF = [
	"https?://github\\.com/[\\w.-]+/[\\w.-]+/(?:issues|pull)/\\d+",
	"https?://linear\\.app/\\S*?/issue/[A-Z][A-Z0-9]*-\\d+\\S*",
	"[\\w.-]+/[\\w.-]+#\\d+",
	"#\\d+",
	"[A-Z][A-Z0-9]*-\\d+",
].join("|");

const CLOSING = new RegExp(
	`\\b(${CLOSING_WORD})\\b:?\\s+(${TICKET_REF})(?![\\w-])`,
	"gi",
);

const NOT_TICKET_PREFIXES = new Set([
	"AES",
	"CVE",
	"ES",
	"HTTP",
	"ISO",
	"MD",
	"RFC",
	"SHA",
	"SSL",
	"TLS",
	"UTF",
	"WCAG",
]);

const REF_ONLY = new RegExp(`^(?:${TICKET_REF})$`, "i");

export type ClosingRef = {
	readonly line: number;
	readonly phrase: string;
	readonly ref: string;
};

export type PartOf =
	| { readonly kind: "missing"; readonly firstLine: string | undefined }
	| { readonly kind: "malformed"; readonly firstLine: string }
	| { readonly kind: "found"; readonly refs: readonly string[] };

function maskCode(text: string): string {
	const lines = text.split("\n");
	let fence: string | undefined;
	return lines
		.map((line) => {
			const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
			if (fence !== undefined) {
				if (marker?.startsWith(fence)) fence = undefined;
				return "";
			}
			if (marker !== undefined) {
				fence = marker;
				return "";
			}
			return line.replace(/(`+)[^`]*?\1/g, (span) => " ".repeat(span.length));
		})
		.join("\n");
}

function isTicketRef(ref: string): boolean {
	const key = /^([A-Za-z][A-Za-z0-9]*)-\d+$/.exec(ref);
	if (!key) return true;
	const prefix = key[1] ?? "";
	return prefix === prefix.toUpperCase() && !NOT_TICKET_PREFIXES.has(prefix);
}

export function closingRefs(text: string): readonly ClosingRef[] {
	const refs: ClosingRef[] = [];
	maskCode(text)
		.split("\n")
		.forEach((line, index) => {
			for (const match of line.matchAll(CLOSING)) {
				const ref = match[2] ?? "";
				if (!isTicketRef(ref)) continue;
				refs.push({ line: index + 1, phrase: match[0], ref });
			}
		});
	return refs;
}

export function partOf(body: string): PartOf {
	const firstLine = body
		.split("\n")
		.map((line) => line.trim())
		.find((line) => line !== "");
	if (firstLine === undefined || !/^part of\b/i.test(firstLine))
		return { kind: "missing", firstLine };
	const list = firstLine
		.replace(/^part of\s*/i, "")
		.replace(/\.$/, "")
		.trim();
	const refs = list.split(/\s*(?:,|\band\b|&)\s*/i).filter((ref) => ref !== "");
	const valid =
		refs.length > 0 &&
		refs.every((ref) => REF_ONLY.test(ref) && isTicketRef(ref));
	return valid ? { kind: "found", refs } : { kind: "malformed", firstLine };
}

export type LinkRules = { readonly requirePartOf: boolean };

export function linkFindings(
	text: {
		readonly title: string | undefined;
		readonly body: string | undefined;
	},
	rules: LinkRules,
): readonly string[] {
	const findings: string[] = [];
	if (text.body !== undefined && rules.requirePartOf) {
		const first = partOf(text.body);
		if (first.kind !== "found")
			findings.push(
				`The first line of the body must be "Part of <key>", as in "Part of ABC-123" or "Part of ABC-123, ABC-124". This repo sets tracker.requirePartOf in .astack/profile.json.${first.firstLine === undefined ? "" : ` The first line is "${first.firstLine.slice(0, 80)}".`}`,
			);
	}
	const sources = [
		{ where: "title", text: text.title },
		{ where: "body", text: text.body },
	];
	for (const source of sources) {
		if (source.text === undefined) continue;
		for (const ref of closingRefs(source.text))
			findings.push(
				`${source.where === "title" ? "The title" : `Body line ${ref.line}`} has "${ref.phrase}". The tracker closes ${ref.ref} when the PR merges. Write "Part of ${ref.ref}" instead. A closing word is allowed only when no ticket key or #n follows it.`,
			);
	}
	return findings;
}
