function literal(char: string): string {
	return /[.+^${}()|[\]\\]/.test(char) ? `\\${char}` : char;
}

function globSource(pattern: string): string {
	let source = "";
	for (let index = 0; index < pattern.length; index++) {
		const char = pattern[index] ?? "";
		if (pattern.startsWith("**/", index)) {
			source += "(?:.*/)?";
			index += 2;
		} else if (
			pattern.startsWith("/**", index) &&
			index + 3 === pattern.length
		) {
			source += "(?:/.*)?";
			index += 2;
		} else if (pattern.startsWith("**", index)) {
			source += ".*";
			index += 1;
		} else if (char === "*") source += "[^/]*";
		else if (char === "?") source += "[^/]";
		else source += literal(char);
	}
	return source;
}

export function globToRegExp(glob: string): RegExp {
	const anchored = glob.includes("/")
		? glob.replace(/^\.\//, "")
		: `**/${glob}`;
	return new RegExp(`^${globSource(anchored)}$`);
}

export function globMatches(pattern: string, relPath: string): boolean {
	return globToRegExp(pattern).test(relPath.replace(/^\.\//, ""));
}

export function anyGlob(patterns: readonly string[], relPath: string): boolean {
	return patterns.some((pattern) => globMatches(pattern, relPath));
}
