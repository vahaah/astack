export type LanguageId =
	| "ts"
	| "tsx"
	| "jsx"
	| "sql"
	| "swift"
	| "kotlin"
	| "go"
	| "rust"
	| "css"
	| "scss"
	| "python"
	| "shell";

export type CommentMarker = "//" | "/*" | "#" | "--";

export interface RawComment {
	start: number;
	end: number;
	marker: CommentMarker;
}

export interface LexResult {
	comments: RawComment[];
	complete: boolean;
}

export const EXTENSIONS: Readonly<Record<string, LanguageId>> = {
	".ts": "ts",
	".mts": "ts",
	".cts": "ts",
	".tsx": "tsx",
	".js": "jsx",
	".jsx": "jsx",
	".mjs": "jsx",
	".cjs": "jsx",
	".sql": "sql",
	".swift": "swift",
	".kt": "kotlin",
	".kts": "kotlin",
	".go": "go",
	".rs": "rust",
	".css": "css",
	".scss": "scss",
	".less": "scss",
	".py": "python",
	".sh": "shell",
	".bash": "shell",
	".zsh": "shell",
};

export function languageOf(path: string): LanguageId | undefined {
	const lower = path.toLowerCase();
	const slash = lower.lastIndexOf("/");
	const dot = lower.lastIndexOf(".");
	if (dot <= slash + 1) return undefined;
	return EXTENSIONS[lower.slice(dot)];
}

export function lex(source: string, language: LanguageId): LexResult {
	switch (language) {
		case "ts":
			return lexJs(source, false);
		case "tsx":
		case "jsx":
			return lexJs(source, true);
		case "sql":
			return lexSql(source, 0);
		case "python":
			return lexPython(source);
		case "shell":
			return lexShell(source);
		default:
			return lexCLike(source, C_LIKE[language]);
	}
}

const IDENT_START = /[A-Za-z_$\u0080-￿]/;
const IDENT_PART = /[\w$\u0080-￿]/;
const WHITESPACE = /\s/;

function lineEnd(src: string, from: number): number {
	const eol = src.indexOf("\n", from);
	return eol < 0 ? src.length : eol;
}

function skipShebang(src: string): number {
	return src.startsWith("#!") ? lineEnd(src, 0) : 0;
}

function quotedEnd(
	src: string,
	from: number,
	quote: string,
	multiline: boolean,
): number {
	let j = from + 1;
	while (j < src.length) {
		const ch = src[j];
		if (ch === "\\") {
			j += 2;
			continue;
		}
		if (ch === quote) return j + 1;
		if (ch === "\n" && !multiline) return -1;
		j++;
	}
	return -1;
}

type Prev = "start" | "punct" | "keyword" | "value";

type JsFrame =
	| { kind: "code"; depth: number; exit: "root" | "template" | "jsx" }
	| { kind: "template" }
	| { kind: "jsx"; open: number; inTag: boolean; typeArgs: number };

const EXPRESSION_KEYWORDS = new Set([
	"return",
	"typeof",
	"instanceof",
	"in",
	"of",
	"new",
	"delete",
	"void",
	"throw",
	"case",
	"do",
	"else",
	"yield",
	"await",
]);

function regexEnd(src: string, from: number): number {
	let j = from + 1;
	let inClass = false;
	while (j < src.length) {
		const ch = src[j];
		if (ch === "\n") return -1;
		if (ch === "\\") {
			j += 2;
			continue;
		}
		if (inClass) {
			if (ch === "]") inClass = false;
		} else if (ch === "[") {
			inClass = true;
		} else if (ch === "/") {
			j++;
			while (j < src.length && /[a-z]/i.test(src[j] ?? "")) j++;
			return j;
		}
		j++;
	}
	return -1;
}

function jsxStarts(src: string, at: number): boolean {
	const ahead = src.slice(at, at + 80);
	if (/^<\s*[A-Za-z_$][\w$]*\s*(?:,|extends\b)/.test(ahead)) return false;
	if (/^<[A-Z][A-Za-z0-9]?>\s*\(/.test(ahead)) return false;
	return /^<(?:[A-Za-z_$]|>)/.test(ahead);
}

function lexJs(src: string, jsx: boolean): LexResult {
	const comments: RawComment[] = [];
	const stack: JsFrame[] = [{ kind: "code", depth: 0, exit: "root" }];
	const n = src.length;
	let complete = true;
	let prev: Prev = "start";
	let i = skipShebang(src);

	const blockComment = (at: number): number => {
		const close = src.indexOf("*/", at + 2);
		if (close < 0) {
			comments.push({ start: at, end: n, marker: "/*" });
			complete = false;
			return n;
		}
		comments.push({ start: at, end: close + 2, marker: "/*" });
		return close + 2;
	};

	while (i < n) {
		const frame = stack[stack.length - 1];
		const c = src[i] ?? "";
		const next = src[i + 1] ?? "";
		if (!frame) break;

		if (frame.kind === "template") {
			if (c === "\\") i += 2;
			else if (c === "`") {
				stack.pop();
				prev = "value";
				i++;
			} else if (c === "$" && next === "{") {
				stack.push({ kind: "code", depth: 0, exit: "template" });
				prev = "start";
				i += 2;
			} else i++;
			continue;
		}

		if (frame.kind === "jsx") {
			if (frame.inTag) {
				if (c === "/" && next === "*") {
					i = blockComment(i);
				} else if (c === "/" && next === "/") {
					const eol = lineEnd(src, i);
					comments.push({ start: i, end: eol, marker: "//" });
					i = eol;
				} else if (c === "<") {
					frame.typeArgs++;
					i++;
				} else if (c === ">" && frame.typeArgs > 0) {
					frame.typeArgs--;
					i++;
				} else if (c === '"' || c === "'") {
					const close = src.indexOf(c, i + 1);
					if (close < 0) {
						complete = false;
						i = n;
					} else i = close + 1;
				} else if (c === "{") {
					stack.push({ kind: "code", depth: 0, exit: "jsx" });
					prev = "start";
					i++;
				} else if (c === "/" && next === ">") {
					i += 2;
					frame.open--;
					if (frame.open === 0) {
						stack.pop();
						prev = "value";
					} else frame.inTag = false;
				} else if (c === ">") {
					frame.inTag = false;
					i++;
				} else i++;
				continue;
			}
			if (c === "{") {
				stack.push({ kind: "code", depth: 0, exit: "jsx" });
				prev = "start";
				i++;
			} else if (c === "<" && next === "/") {
				const close = src.indexOf(">", i);
				if (close < 0) {
					complete = false;
					i = n;
					continue;
				}
				i = close + 1;
				frame.open--;
				if (frame.open === 0) {
					stack.pop();
					prev = "value";
				}
			} else if (c === "<") {
				frame.open++;
				frame.inTag = true;
				i++;
			} else i++;
			continue;
		}

		if (c === "/" && next === "/") {
			const eol = lineEnd(src, i);
			comments.push({ start: i, end: eol, marker: "//" });
			i = eol;
			continue;
		}
		if (c === "/" && next === "*") {
			i = blockComment(i);
			continue;
		}
		if (c === "'" || c === '"') {
			const end = quotedEnd(src, i, c, false);
			if (end < 0) {
				complete = false;
				i = lineEnd(src, i);
			} else i = end;
			prev = "value";
			continue;
		}
		if (c === "`") {
			stack.push({ kind: "template" });
			i++;
			continue;
		}
		if (c === "/") {
			if (prev !== "value") {
				const end = regexEnd(src, i);
				if (end > 0) {
					i = end;
					prev = "value";
					continue;
				}
			}
			prev = "punct";
			i++;
			continue;
		}
		if (c === "<" && jsx && prev !== "value" && jsxStarts(src, i)) {
			stack.push({ kind: "jsx", open: 1, inTag: true, typeArgs: 0 });
			i++;
			continue;
		}
		if (c === "{") {
			frame.depth++;
			prev = "punct";
			i++;
			continue;
		}
		if (c === "}") {
			i++;
			if (frame.depth > 0) {
				frame.depth--;
				prev = "value";
			} else if (frame.exit === "root") {
				complete = false;
			} else {
				stack.pop();
			}
			continue;
		}
		if (c === ")" || c === "]") {
			prev = "value";
			i++;
			continue;
		}
		if (IDENT_START.test(c) || c === "#") {
			let j = i + 1;
			while (j < n && IDENT_PART.test(src[j] ?? "")) j++;
			prev = EXPRESSION_KEYWORDS.has(src.slice(i, j)) ? "keyword" : "value";
			i = j;
			continue;
		}
		if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(next))) {
			let j = i + 1;
			while (j < n && /[\w.]/.test(src[j] ?? "")) j++;
			prev = "value";
			i = j;
			continue;
		}
		if (!WHITESPACE.test(c)) prev = "punct";
		i++;
	}
	if (stack.length !== 1) complete = false;
	return { comments, complete };
}

function lexSql(src: string, offset: number): LexResult {
	const comments: RawComment[] = [];
	const n = src.length;
	let complete = true;
	let i = 0;
	while (i < n) {
		const c = src[i] ?? "";
		const next = src[i + 1] ?? "";
		if (c === "-" && next === "-") {
			const eol = lineEnd(src, i);
			comments.push({ start: i + offset, end: eol + offset, marker: "--" });
			i = eol;
			continue;
		}
		if (c === "/" && next === "*") {
			let depth = 1;
			let j = i + 2;
			while (j < n && depth > 0) {
				if (src.startsWith("/*", j)) {
					depth++;
					j += 2;
				} else if (src.startsWith("*/", j)) {
					depth--;
					j += 2;
				} else j++;
			}
			if (depth > 0) complete = false;
			comments.push({ start: i + offset, end: j + offset, marker: "/*" });
			i = j;
			continue;
		}
		if (c === "'") {
			const backslashes =
				/[eE]/.test(src[i - 1] ?? "") && !IDENT_PART.test(src[i - 2] ?? "");
			let j = i + 1;
			let closed = false;
			while (j < n) {
				const ch = src[j];
				if (backslashes && ch === "\\") {
					j += 2;
				} else if (ch === "'" && src[j + 1] === "'") {
					j += 2;
				} else if (ch === "'") {
					j++;
					closed = true;
					break;
				} else j++;
			}
			if (!closed) complete = false;
			i = j;
			continue;
		}
		if (c === '"') {
			const close = src.indexOf('"', i + 1);
			if (close < 0) {
				complete = false;
				i = n;
			} else i = close + 1;
			continue;
		}
		if (c === "$" && !IDENT_PART.test(src[i - 1] ?? "")) {
			const tag = /^\$(?:[A-Za-z_]\w*)?\$/.exec(src.slice(i, i + 64))?.[0];
			if (tag) {
				const bodyStart = i + tag.length;
				const close = src.indexOf(tag, bodyStart);
				if (close < 0) {
					complete = false;
					i = n;
					continue;
				}
				if (/\b(?:as|do)\s*$/i.test(src.slice(Math.max(0, i - 24), i))) {
					const inner = lexSql(src.slice(bodyStart, close), offset + bodyStart);
					comments.push(...inner.comments);
					if (!inner.complete) complete = false;
				}
				i = close + tag.length;
				continue;
			}
		}
		i++;
	}
	return { comments, complete };
}

function lexPython(src: string): LexResult {
	const comments: RawComment[] = [];
	const n = src.length;
	let complete = true;
	let i = skipShebang(src);
	while (i < n) {
		const c = src[i] ?? "";
		if (c === "#") {
			const eol = lineEnd(src, i);
			comments.push({ start: i, end: eol, marker: "#" });
			i = eol;
			continue;
		}
		if (c === "'" || c === '"') {
			let p = i - 1;
			while (p >= 0 && /[rRbBuUfF]/.test(src[p] ?? "")) p--;
			const raw = /[rR]/.test(src.slice(p + 1, i));
			const triple = src.startsWith(c.repeat(3), i);
			if (triple) {
				let j = i + 3;
				let end = -1;
				while (j < n) {
					if (!raw && src[j] === "\\") {
						j += 2;
						continue;
					}
					if (src.startsWith(c.repeat(3), j)) {
						end = j + 3;
						break;
					}
					j++;
				}
				if (end < 0) {
					complete = false;
					i = n;
				} else i = end;
				continue;
			}
			const end = quotedEnd(src, i, c, false);
			if (end < 0) {
				complete = false;
				i = lineEnd(src, i);
			} else i = end;
			continue;
		}
		i++;
	}
	return { comments, complete };
}

function lexShell(src: string): LexResult {
	const comments: RawComment[] = [];
	const n = src.length;
	let complete = true;
	let heredocs: { tag: string; strip: boolean }[] = [];
	let i = skipShebang(src);
	while (i < n) {
		const c = src[i] ?? "";
		if (c === "\n") {
			i++;
			for (const doc of heredocs) {
				let found = false;
				while (i < n) {
					const eol = lineEnd(src, i);
					const line = src.slice(i, eol);
					i = eol + 1;
					if ((doc.strip ? line.replace(/^\t+/, "") : line) === doc.tag) {
						found = true;
						break;
					}
				}
				if (!found) complete = false;
			}
			heredocs = [];
			continue;
		}
		if (c === "#" && (i === 0 || /[\s;|&()]/.test(src[i - 1] ?? ""))) {
			const eol = lineEnd(src, i);
			comments.push({ start: i, end: eol, marker: "#" });
			i = eol;
			continue;
		}
		if (c === "\\") {
			i += 2;
			continue;
		}
		if (c === "'") {
			const close = src.indexOf("'", i + 1);
			if (close < 0) {
				complete = false;
				i = n;
			} else i = close + 1;
			continue;
		}
		if (c === '"' || (c === "$" && src[i + 1] === "'")) {
			const at = c === "$" ? i + 1 : i;
			const end = quotedEnd(src, at, src[at] ?? '"', true);
			if (end < 0) {
				complete = false;
				i = n;
			} else i = end;
			continue;
		}
		if (c === "<" && src.startsWith("<<", i) && src[i + 2] !== "<") {
			const match = /^<<(-?)\s*(['"]?)([A-Za-z_][\w.-]*)\2/.exec(
				src.slice(i, i + 80),
			);
			if (match) {
				heredocs.push({ tag: match[3] ?? "", strip: match[1] === "-" });
				i += match[0].length;
				continue;
			}
		}
		i++;
	}
	return { comments, complete };
}

interface CLikeOptions {
	lineComments: boolean;
	nestedBlocks: boolean;
	tripleQuote: boolean;
	backtickRaw: boolean;
	rustRaw: boolean;
	swiftRaw: boolean;
	charLiterals: boolean;
	singleQuoteStrings: boolean;
	multilineStrings: boolean;
	interpolation: "swift" | "kotlin" | null;
	cssUrl: boolean;
}

const C_DEFAULTS: CLikeOptions = {
	lineComments: true,
	nestedBlocks: false,
	tripleQuote: false,
	backtickRaw: false,
	rustRaw: false,
	swiftRaw: false,
	charLiterals: false,
	singleQuoteStrings: false,
	multilineStrings: false,
	interpolation: null,
	cssUrl: false,
};

const C_LIKE: Record<
	"swift" | "kotlin" | "go" | "rust" | "css" | "scss",
	CLikeOptions
> = {
	swift: {
		...C_DEFAULTS,
		nestedBlocks: true,
		tripleQuote: true,
		swiftRaw: true,
		interpolation: "swift",
	},
	kotlin: {
		...C_DEFAULTS,
		nestedBlocks: true,
		tripleQuote: true,
		charLiterals: true,
		interpolation: "kotlin",
	},
	go: { ...C_DEFAULTS, backtickRaw: true, charLiterals: true },
	rust: {
		...C_DEFAULTS,
		nestedBlocks: true,
		rustRaw: true,
		charLiterals: true,
		multilineStrings: true,
	},
	css: { ...C_DEFAULTS, lineComments: false, singleQuoteStrings: true },
	scss: { ...C_DEFAULTS, singleQuoteStrings: true, cssUrl: true },
};

function balancedEnd(
	src: string,
	from: number,
	open: string,
	close: string,
): number {
	let depth = 1;
	let j = from;
	while (j < src.length && depth > 0) {
		const ch = src[j];
		if (ch === '"') {
			const end = quotedEnd(src, j, '"', false);
			j = end < 0 ? lineEnd(src, j) : end;
			continue;
		}
		if (ch === open) depth++;
		else if (ch === close) depth--;
		j++;
	}
	return j;
}

function cStringEnd(src: string, from: number, options: CLikeOptions): number {
	let j = from + 1;
	while (j < src.length) {
		const ch = src[j];
		if (ch === "\\") {
			if (options.interpolation === "swift" && src[j + 1] === "(") {
				j = balancedEnd(src, j + 2, "(", ")");
				continue;
			}
			j += 2;
			continue;
		}
		if (
			options.interpolation === "kotlin" &&
			ch === "$" &&
			src[j + 1] === "{"
		) {
			j = balancedEnd(src, j + 2, "{", "}");
			continue;
		}
		if (ch === '"') return j + 1;
		if (ch === "\n" && !options.multilineStrings) return -1;
		j++;
	}
	return -1;
}

function lexCLike(src: string, options: CLikeOptions): LexResult {
	const comments: RawComment[] = [];
	const n = src.length;
	let complete = true;
	let i = 0;
	const skipTo = (end: number): void => {
		if (end < 0) {
			complete = false;
			i = n;
		} else i = end;
	};
	while (i < n) {
		const c = src[i] ?? "";
		const next = src[i + 1] ?? "";
		const identBefore = IDENT_PART.test(src[i - 1] ?? "");
		if (options.lineComments && c === "/" && next === "/") {
			const eol = lineEnd(src, i);
			comments.push({ start: i, end: eol, marker: "//" });
			i = eol;
			continue;
		}
		if (c === "/" && next === "*") {
			let depth = 1;
			let j = i + 2;
			while (j < n && depth > 0) {
				if (options.nestedBlocks && src.startsWith("/*", j)) {
					depth++;
					j += 2;
				} else if (src.startsWith("*/", j)) {
					depth--;
					j += 2;
				} else j++;
			}
			if (depth > 0) complete = false;
			comments.push({ start: i, end: j, marker: "/*" });
			i = j;
			continue;
		}
		if (options.cssUrl && !identBefore && /^url\(/i.test(src.slice(i, i + 4))) {
			const close = src.indexOf(")", i);
			skipTo(close < 0 ? -1 : close + 1);
			continue;
		}
		if (options.swiftRaw && c === "#" && !identBefore) {
			const match = /^(#+)("""|")/.exec(src.slice(i, i + 16));
			if (match) {
				const closer = (match[2] ?? "") + (match[1] ?? "");
				const close = src.indexOf(closer, i + match[0].length);
				skipTo(close < 0 ? -1 : close + closer.length);
				continue;
			}
		}
		if (options.rustRaw && (c === "r" || c === "b") && !identBefore) {
			const match = /^b?r(#*)"/.exec(src.slice(i, i + 16));
			if (match) {
				const closer = `"${match[1] ?? ""}`;
				const close = src.indexOf(closer, i + match[0].length);
				skipTo(close < 0 ? -1 : close + closer.length);
				continue;
			}
		}
		if (options.tripleQuote && src.startsWith('"""', i)) {
			let j = i + 3;
			let end = -1;
			while (j < n) {
				if (options.interpolation === "swift" && src[j] === "\\") {
					j += 2;
					continue;
				}
				if (src.startsWith('"""', j)) {
					end = j + 3;
					break;
				}
				j++;
			}
			skipTo(end);
			continue;
		}
		if (c === '"') {
			const end = cStringEnd(src, i, options);
			if (end < 0) {
				complete = false;
				i = lineEnd(src, i);
			} else i = end;
			continue;
		}
		if (c === "'") {
			if (options.singleQuoteStrings) {
				const end = quotedEnd(src, i, "'", false);
				if (end < 0) {
					complete = false;
					i = lineEnd(src, i);
				} else i = end;
				continue;
			}
			if (options.charLiterals) {
				const match = /^'(?:\\[^']{1,10}|[^\\'\n]{1,2})'/.exec(
					src.slice(i, i + 16),
				);
				i += match ? match[0].length : 1;
				continue;
			}
		}
		if (options.backtickRaw && c === "`") {
			const close = src.indexOf("`", i + 1);
			skipTo(close < 0 ? -1 : close + 1);
			continue;
		}
		if (IDENT_START.test(c)) {
			let j = i + 1;
			while (j < n && IDENT_PART.test(src[j] ?? "")) j++;
			i = j;
			continue;
		}
		i++;
	}
	return { comments, complete };
}
