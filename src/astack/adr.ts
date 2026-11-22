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
