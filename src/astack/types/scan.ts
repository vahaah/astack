export type TokenKind =
	| "word"
	| "punct"
	| "string"
	| "number"
	| "regex"
	| "template"
	| "template-head"
	| "template-middle"
	| "template-tail"
	| "jsx";

export type Token = {
	readonly kind: TokenKind;
	readonly text: string;
	readonly start: number;
	readonly end: number;
	readonly line: number;
	readonly newlineBefore: boolean;
};

export type SourceComment = {
	readonly text: string;
	readonly line: number;
	readonly block: boolean;
};

export type Scan = {
	readonly tokens: readonly Token[];
	readonly comments: readonly SourceComment[];
};

type Draft = { kind: TokenKind; start: number; end: number };

type Frame =
	| { kind: "code"; depth: number; exit: "root" | "template" | "jsx" }
	| {
			kind: "jsx";
			open: number;
			inTag: boolean;
			typeArgs: number;
			from: number;
	  };

const PUNCTUATORS = [
	">>>=",
	"...",
	"===",
	"!==",
	"**=",
	"&&=",
	"||=",
	"??=",
	"<<=",
	"=>",
	"==",
	"!=",
	"&&",
	"||",
	"??",
	"?.",
	"++",
	"--",
	"+=",
	"-=",
	"*=",
	"/=",
	"%=",
	"&=",
	"|=",
	"^=",
	"**",
] as const;

export const EXPRESSION_KEYWORDS: ReadonlySet<string> = new Set([
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
	"extends",
	"as",
	"satisfies",
	"keyof",
	"export",
	"import",
	"default",
	"const",
	"let",
	"var",
]);

function isIdentStart(code: number): boolean {
	return (
		(code >= 97 && code <= 122) ||
		(code >= 65 && code <= 90) ||
		code === 95 ||
		code === 36 ||
		code >= 128
	);
}

function isDigit(code: number): boolean {
	return code >= 48 && code <= 57;
}

function isIdentPart(code: number): boolean {
	return isIdentStart(code) || isDigit(code);
}

function isWhitespace(code: number): boolean {
	if (code === 32 || (code >= 9 && code <= 13)) return true;
	return code >= 128 && /\s/.test(String.fromCharCode(code));
}

function lineEnd(src: string, from: number): number {
	const eol = src.indexOf("\n", from);
	return eol < 0 ? src.length : eol;
}

function quotedEnd(src: string, from: number, quote: string): number {
	let j = from + 1;
	while (j < src.length) {
		const ch = src[j];
		if (ch === "\\") {
			j += 2;
			continue;
		}
		if (ch === quote) return j + 1;
		if (ch === "\n") return -1;
		j++;
	}
	return -1;
}

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

function templateEnd(
	src: string,
	from: number,
): { end: number; closed: "backtick" | "substitution" } | undefined {
	let j = from;
	while (j < src.length) {
		const ch = src[j];
		if (ch === "\\") {
			j += 2;
			continue;
		}
		if (ch === "`") return { end: j + 1, closed: "backtick" };
		if (ch === "$" && src[j + 1] === "{")
			return { end: j + 2, closed: "substitution" };
		j++;
	}
	return undefined;
}

function jsxStarts(src: string, at: number): boolean {
	const ahead = src.slice(at, at + 80);
	if (/^<\s*[A-Za-z_$][\w$]*\s*(?:,|extends\b)/.test(ahead)) return false;
	if (/^<[A-Z][A-Za-z0-9]?>\s*\(/.test(ahead)) return false;
	return /^<(?:[A-Za-z_$]|>)/.test(ahead);
}

function endsValue(draft: Draft | undefined, src: string): boolean {
	if (!draft) return false;
	switch (draft.kind) {
		case "word":
			return !EXPRESSION_KEYWORDS.has(src.slice(draft.start, draft.end));
		case "punct": {
			const text = src.slice(draft.start, draft.end);
			return text === ")" || text === "]" || text === "}";
		}
		case "template-head":
		case "template-middle":
			return false;
		default:
			return true;
	}
}

function lineStarts(src: string): number[] {
	const starts = [0];
	for (let i = 0; i < src.length; i++) if (src[i] === "\n") starts.push(i + 1);
	return starts;
}

function lineCursor(starts: readonly number[]): (offset: number) => number {
	let index = 0;
	return (offset) => {
		while (
			index + 1 < starts.length &&
			(starts[index + 1] ?? offset + 1) <= offset
		)
			index++;
		return index + 1;
	};
}

const PUNCTUATORS_BY_FIRST: ReadonlyMap<string, readonly string[]> = new Map(
	[...new Set(PUNCTUATORS.map((candidate) => candidate[0] ?? ""))].map(
		(first) => [
			first,
			PUNCTUATORS.filter((candidate) => candidate[0] === first),
		],
	),
);

function punctuatorAt(src: string, at: number): string {
	const first = src[at] ?? "";
	for (const candidate of PUNCTUATORS_BY_FIRST.get(first) ?? [])
		if (src.startsWith(candidate, at)) {
			if (candidate === "?." && isDigit(src.charCodeAt(at + 2))) continue;
			return candidate;
		}
	return first;
}

export function scan(source: string, jsx: boolean): Scan | undefined {
	const drafts: Draft[] = [];
	const rawComments: { start: number; end: number; block: boolean }[] = [];
	const stack: Frame[] = [{ kind: "code", depth: 0, exit: "root" }];
	const n = source.length;
	let i = source.startsWith("#!") ? lineEnd(source, 0) : 0;

	const push = (kind: TokenKind, start: number, end: number): void => {
		drafts.push({ kind, start, end });
	};
	const last = (): Draft | undefined => drafts[drafts.length - 1];
	const blockComment = (at: number): number => {
		const close = source.indexOf("*/", at + 2);
		if (close < 0) return -1;
		rawComments.push({ start: at, end: close + 2, block: true });
		return close + 2;
	};
	const template = (from: number, opening: TokenKind): boolean => {
		const part = templateEnd(source, from + 1);
		if (!part) return false;
		if (part.closed === "backtick") {
			push(
				opening === "template-head" ? "template" : "template-tail",
				from,
				part.end,
			);
		} else {
			push(opening, from, part.end);
			stack.push({ kind: "code", depth: 0, exit: "template" });
		}
		i = part.end;
		return true;
	};

	while (i < n) {
		const frame = stack[stack.length - 1];
		const c = source[i] ?? "";
		const next = source[i + 1] ?? "";
		const code = source.charCodeAt(i);
		if (!frame) return undefined;

		if (frame.kind === "jsx") {
			if (frame.inTag) {
				if (c === "/" && next === "*") {
					const end = blockComment(i);
					if (end < 0) return undefined;
					i = end;
				} else if (c === "/" && next === "/") {
					const eol = lineEnd(source, i);
					rawComments.push({ start: i, end: eol, block: false });
					i = eol;
				} else if (c === "<") {
					frame.typeArgs++;
					i++;
				} else if (c === ">" && frame.typeArgs > 0) {
					frame.typeArgs--;
					i++;
				} else if (c === '"' || c === "'") {
					const close = source.indexOf(c, i + 1);
					if (close < 0) return undefined;
					i = close + 1;
				} else if (c === "{") {
					push("jsx", frame.from, i);
					push("punct", i, i + 1);
					stack.push({ kind: "code", depth: 0, exit: "jsx" });
					i++;
				} else if (c === "/" && next === ">") {
					i += 2;
					frame.open--;
					if (frame.open === 0) {
						push("jsx", frame.from, i);
						stack.pop();
					} else frame.inTag = false;
				} else if (c === ">") {
					frame.inTag = false;
					i++;
				} else i++;
				continue;
			}
			if (c === "{") {
				push("jsx", frame.from, i);
				push("punct", i, i + 1);
				stack.push({ kind: "code", depth: 0, exit: "jsx" });
				i++;
			} else if (c === "<" && next === "/") {
				const close = source.indexOf(">", i);
				if (close < 0) return undefined;
				i = close + 1;
				frame.open--;
				if (frame.open === 0) {
					push("jsx", frame.from, i);
					stack.pop();
				}
			} else if (c === "<") {
				frame.open++;
				frame.inTag = true;
				i++;
			} else i++;
			continue;
		}

		if (isWhitespace(code)) {
			i++;
			continue;
		}
		if (c === "/" && next === "/") {
			const eol = lineEnd(source, i);
			rawComments.push({ start: i, end: eol, block: false });
			i = eol;
			continue;
		}
		if (c === "/" && next === "*") {
			const end = blockComment(i);
			if (end < 0) return undefined;
			i = end;
			continue;
		}
		if (c === "'" || c === '"') {
			const end = quotedEnd(source, i, c);
			if (end < 0) return undefined;
			push("string", i, end);
			i = end;
			continue;
		}
		if (c === "`") {
			if (!template(i, "template-head")) return undefined;
			continue;
		}
		if (c === "/" && !endsValue(last(), source)) {
			const end = regexEnd(source, i);
			if (end > 0) {
				push("regex", i, end);
				i = end;
				continue;
			}
		}
		if (
			c === "<" &&
			jsx &&
			!endsValue(last(), source) &&
			jsxStarts(source, i)
		) {
			stack.push({ kind: "jsx", open: 1, inTag: true, typeArgs: 0, from: i });
			i++;
			continue;
		}
		if (c === "{") {
			frame.depth++;
			push("punct", i, i + 1);
			i++;
			continue;
		}
		if (c === "}") {
			if (frame.depth > 0) {
				frame.depth--;
				push("punct", i, i + 1);
				i++;
			} else if (frame.exit === "root") {
				return undefined;
			} else if (frame.exit === "template") {
				stack.pop();
				if (!template(i, "template-middle")) return undefined;
			} else {
				stack.pop();
				push("punct", i, i + 1);
				i++;
				const outer = stack[stack.length - 1];
				if (outer?.kind === "jsx") outer.from = i;
			}
			continue;
		}
		if (
			isIdentStart(code) ||
			(code === 35 && isIdentStart(source.charCodeAt(i + 1)))
		) {
			let j = i + 1;
			while (j < n && isIdentPart(source.charCodeAt(j))) j++;
			push("word", i, j);
			i = j;
			continue;
		}
		if (isDigit(code) || (code === 46 && isDigit(source.charCodeAt(i + 1)))) {
			const hex = code === 48 && (source.charCodeAt(i + 1) | 32) === 120;
			let j = i + 1;
			while (j < n) {
				const ch = source.charCodeAt(j);
				if (isIdentPart(ch) || ch === 46) j++;
				else if (
					!hex &&
					(ch === 43 || ch === 45) &&
					(source.charCodeAt(j - 1) | 32) === 101
				)
					j++;
				else break;
			}
			push("number", i, j);
			i = j;
			continue;
		}
		const text = punctuatorAt(source, i);
		push("punct", i, i + text.length);
		i += text.length;
	}
	if (stack.length !== 1) return undefined;

	const starts = lineStarts(source);
	const startLine = lineCursor(starts);
	const endLine = lineCursor(starts);
	const commentLine = lineCursor(starts);
	let previousEndLine = 0;
	const tokens = drafts.map((draft, index): Token => {
		const line = startLine(draft.start);
		const newlineBefore = index > 0 && line > previousEndLine;
		previousEndLine = endLine(Math.max(draft.start, draft.end - 1));
		return {
			kind: draft.kind,
			text: source.slice(draft.start, draft.end),
			start: draft.start,
			end: draft.end,
			line,
			newlineBefore,
		};
	});
	const comments = rawComments.map(
		(comment): SourceComment => ({
			text: source.slice(comment.start, comment.end),
			line: commentLine(comment.start),
			block: comment.block,
		}),
	);
	return { tokens, comments };
}
