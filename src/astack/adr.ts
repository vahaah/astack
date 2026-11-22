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
