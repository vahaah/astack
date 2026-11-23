import { createHash } from "node:crypto";

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
	return createHash("sha256").update(token).digest("hex");
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
