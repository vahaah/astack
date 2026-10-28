import {
	EXPRESSION_KEYWORDS,
	type SourceComment,
	scan,
	type Token,
} from "./scan.ts";

export type HatchKind =
	| "any"
	| "cast"
	| "non-null"
	| "ts-ignore"
	| "ts-nocheck"
	| "ts-expect-error"
	| "banned-type"
	| "enum"
	| "extends";

export type CastShape =
	| "as-any"
	| "double"
	| "json-parse"
	| "response-json"
	| "angle"
	| "plain";

export type Hatch = {
	readonly kind: HatchKind;
	readonly line: number;
	readonly detail: string;
};

export type SyntaxOptions = {
	readonly jsx: boolean;
	readonly angleCasts: boolean;
};

type Hit = {
	readonly kind: HatchKind;
	readonly token: number;
	readonly detail: string;
};

type Role = "block" | "object" | "class" | "params" | "expr" | "enum";

type Frame = {
	readonly role: Role;
	readonly close: number;
	state: "none" | "binding" | "default" | "member" | "init";
	decl: "none" | "binding" | "init";
	ternary: number;
	colon: "none" | "value" | "label";
	pendingClass: boolean;
};

type Ctx = {
	readonly tokens: readonly Token[];
	readonly match: readonly number[];
	readonly hits: Hit[];
	readonly paramOpens: Set<number>;
	readonly annotations: Set<number>;
	readonly angleCasts: boolean;
};

const NOT_A_TYPE: ReadonlySet<string> = new Set([
	"return",
	"if",
	"else",
	"for",
	"while",
	"do",
	"switch",
	"case",
	"default",
	"break",
	"continue",
	"function",
	"class",
	"const",
	"let",
	"var",
	"delete",
	"throw",
	"try",
	"catch",
	"finally",
	"in",
	"of",
	"instanceof",
	"extends",
	"implements",
	"interface",
	"enum",
	"export",
	"yield",
	"await",
	"with",
	"debugger",
	"as",
	"satisfies",
]);

const MEMBER_MODIFIERS: ReadonlySet<string> = new Set([
	"static",
	"public",
	"private",
	"protected",
	"readonly",
	"abstract",
	"override",
	"declare",
	"accessor",
	"async",
	"get",
	"set",
]);

const STATEMENT_WORDS: ReadonlySet<string> = new Set([
	"if",
	"for",
	"while",
	"return",
	"switch",
	"throw",
	"try",
	"do",
	"break",
	"continue",
	"function",
	"class",
	"import",
	"export",
]);

const EXPRESSION_START_PUNCT: ReadonlySet<string> = new Set([
	"=",
	"(",
	"[",
	"{",
	",",
	":",
	"?",
	"=>",
	";",
	"!",
	"~",
	"...",
	"&&",
	"||",
	"??",
	"+",
	"-",
	"*",
	"/",
	"%",
	"**",
	"|",
	"&",
	"^",
	"<",
	">",
	"==",
	"===",
	"!=",
	"!==",
	"+=",
	"-=",
	"*=",
	"/=",
	"%=",
	"&&=",
	"||=",
	"??=",
]);

function at(ctx: Ctx, i: number): Token | undefined {
	return ctx.tokens[i];
}

function is(token: Token | undefined, text: string): boolean {
	return (
		token !== undefined &&
		(token.kind === "word" || token.kind === "punct") &&
		token.text === text
	);
}

function isWord(token: Token | undefined): boolean {
	return token?.kind === "word";
}

function closeOf(ctx: Ctx, i: number): number {
	return ctx.match[i] ?? -1;
}

function endsValue(token: Token | undefined): boolean {
	if (!token) return false;
	switch (token.kind) {
		case "word":
			return !EXPRESSION_KEYWORDS.has(token.text);
		case "punct":
			return token.text === ")" || token.text === "]" || token.text === "}";
		case "template-head":
		case "template-middle":
		case "jsx":
			return false;
		default:
			return true;
	}
}

function isPropertyName(ctx: Ctx, i: number): boolean {
	return (
		isWord(at(ctx, i)) && (is(at(ctx, i - 1), ".") || is(at(ctx, i - 1), "?."))
	);
}

function endsExpression(ctx: Ctx, i: number): boolean {
	const token = at(ctx, i);
	if (isPropertyName(ctx, i)) return true;
	if (is(token, "!") && !token?.newlineBefore)
		return endsExpression(ctx, i - 1);
	return endsValue(token);
}

function startsExpression(token: Token | undefined): boolean {
	if (!token) return true;
	switch (token.kind) {
		case "word":
			return EXPRESSION_KEYWORDS.has(token.text);
		case "punct":
			return EXPRESSION_START_PUNCT.has(token.text);
		case "template-head":
		case "template-middle":
		case "jsx":
			return true;
		default:
			return false;
	}
}

function record(ctx: Ctx, kind: HatchKind, token: number, detail = ""): void {
	ctx.hits.push({ kind, token, detail });
}

function speculate(ctx: Ctx, attempt: () => number): number {
	const saved = ctx.hits.length;
	const end = attempt();
	if (end < 0) ctx.hits.length = saved;
	return end;
}

function matchBrackets(tokens: readonly Token[]): number[] | undefined {
	const match = tokens.map(() => -1);
	const open: number[] = [];
	const pairs: Readonly<Record<string, string>> = {
		")": "(",
		"]": "[",
		"}": "{",
	};
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		if (token?.kind !== "punct") continue;
		if (token.text === "(" || token.text === "[" || token.text === "{") {
			open.push(i);
			continue;
		}
		const opener = pairs[token.text];
		if (opener === undefined) continue;
		const from = open.pop();
		if (from === undefined || tokens[from]?.text !== opener) return undefined;
		match[from] = i;
		match[i] = from;
	}
	return open.length === 0 ? match : undefined;
}

function parseTypeArgs(ctx: Ctx, i: number): number {
	if (!is(at(ctx, i), "<") || is(at(ctx, i + 1), ">")) return -1;
	let j = i + 1;
	for (;;) {
		const end = parseType(ctx, j, false);
		if (end < 0) return -1;
		if (is(at(ctx, end), ">")) return end + 1;
		if (!is(at(ctx, end), ",")) return -1;
		j = end + 1;
		if (is(at(ctx, j), ">")) return j + 1;
	}
}

function parseTypeParams(ctx: Ctx, i: number): number {
	if (!is(at(ctx, i), "<")) return -1;
	let j = i + 1;
	for (;;) {
		while (
			isWord(at(ctx, j)) &&
			["const", "in", "out"].includes(at(ctx, j)?.text ?? "") &&
			isWord(at(ctx, j + 1)) &&
			!is(at(ctx, j + 1), "extends")
		)
			j++;
		if (!isWord(at(ctx, j))) return -1;
		j++;
		if (is(at(ctx, j), "extends")) {
			j = parseType(ctx, j + 1, false);
			if (j < 0) return -1;
		}
		if (is(at(ctx, j), "=")) {
			j = parseType(ctx, j + 1, false);
			if (j < 0) return -1;
		}
		if (is(at(ctx, j), ">")) return j + 1;
		if (!is(at(ctx, j), ",")) return -1;
		j++;
		if (is(at(ctx, j), ">")) return j + 1;
	}
}

function skipToSeparator(ctx: Ctx, from: number, close: number): number {
	let j = from;
	while (j < close) {
		const token = at(ctx, j);
		if (is(token, ";") || is(token, ",")) return j;
		if (j > from && token?.newlineBefore) return j;
		const end = closeOf(ctx, j);
		j = end > j ? end + 1 : j + 1;
	}
	return close;
}

function parseParams(ctx: Ctx, i: number): number {
	const close = closeOf(ctx, i);
	if (close < 0) return -1;
	let j = i + 1;
	while (j < close) {
		while (
			isWord(at(ctx, j)) &&
			MEMBER_MODIFIERS.has(at(ctx, j)?.text ?? "") &&
			!is(at(ctx, j + 1), ":") &&
			!is(at(ctx, j + 1), ",") &&
			!is(at(ctx, j + 1), ")") &&
			!is(at(ctx, j + 1), "?")
		)
			j++;
		if (is(at(ctx, j), "...")) j++;
		const name = at(ctx, j);
		if (isWord(name)) j++;
		else if (is(name, "{") || is(name, "[")) j = closeOf(ctx, j) + 1;
		else return close + 1;
		if (is(at(ctx, j), "?")) j++;
		if (is(at(ctx, j), ":")) {
			const end = parseType(ctx, j + 1, false);
			if (end < 0) return close + 1;
			j = end;
		}
		if (is(at(ctx, j), "=")) j = skipToSeparator(ctx, j, close);
		if (is(at(ctx, j), ",")) j++;
		else if (j !== close) return close + 1;
	}
	return close + 1;
}

function parseFunctionType(ctx: Ctx, i: number): number {
	let j = i;
	if (is(at(ctx, j), "<")) {
		j = parseTypeParams(ctx, j);
		if (j < 0) return -1;
	}
	if (!is(at(ctx, j), "(")) return -1;
	j = parseParams(ctx, j);
	if (j < 0 || !is(at(ctx, j), "=>")) return -1;
	return parseReturnType(ctx, j + 1);
}

function isFunctionTypeParen(ctx: Ctx, i: number): boolean {
	const close = closeOf(ctx, i);
	return close > i && is(at(ctx, close + 1), "=>");
}

function parseReturnType(ctx: Ctx, i: number): number {
	const first = at(ctx, i);
	if (
		is(first, "asserts") &&
		isWord(at(ctx, i + 1)) &&
		!is(at(ctx, i + 1), "is")
	) {
		const j = i + 2;
		return is(at(ctx, j), "is") ? parseType(ctx, j + 1, false) : j;
	}
	if (
		isWord(first) &&
		is(at(ctx, i + 1), "is") &&
		!at(ctx, i + 1)?.newlineBefore
	)
		return parseType(ctx, i + 2, false);
	return parseType(ctx, i, false);
}

function parseType(ctx: Ctx, i: number, noConditional: boolean): number {
	const first = at(ctx, i);
	if (!first) return -1;
	if (is(first, "<")) return parseFunctionType(ctx, i);
	if (
		is(first, "new") ||
		(is(first, "abstract") && is(at(ctx, i + 1), "new"))
	) {
		const j = is(first, "new") ? i + 1 : i + 2;
		return parseFunctionType(ctx, j);
	}
	if (is(first, "(") && isFunctionTypeParen(ctx, i))
		return parseFunctionType(ctx, i);
	const checked = parseUnion(ctx, i);
	if (checked < 0) return -1;
	const extendsToken = at(ctx, checked);
	if (
		noConditional ||
		!is(extendsToken, "extends") ||
		extendsToken?.newlineBefore
	)
		return checked;
	const conditional = speculate(ctx, () => {
		const constraint = parseUnion(ctx, checked + 1);
		if (constraint < 0 || !is(at(ctx, constraint), "?")) return -1;
		const whenTrue = parseType(ctx, constraint + 1, false);
		if (whenTrue < 0 || !is(at(ctx, whenTrue), ":")) return -1;
		return parseType(ctx, whenTrue + 1, false);
	});
	return conditional < 0 ? checked : conditional;
}

function parseUnion(ctx: Ctx, i: number): number {
	let j = is(at(ctx, i), "|") ? i + 1 : i;
	j = parseIntersection(ctx, j);
	while (j >= 0 && is(at(ctx, j), "|")) j = parseIntersection(ctx, j + 1);
	return j;
}

function parseIntersection(ctx: Ctx, i: number): number {
	const operands: number[] = [];
	let j = is(at(ctx, i), "&") ? i + 1 : i;
	operands.push(j);
	j = parseOperator(ctx, j);
	while (j >= 0 && is(at(ctx, j), "&")) {
		operands.push(j + 1);
		j = parseOperator(ctx, j + 1);
	}
	if (j >= 0 && operands.length > 1) {
		const kept = ctx.hits.filter(
			(hit) =>
				!(
					hit.kind === "banned-type" &&
					hit.detail === "{}" &&
					operands.includes(hit.token)
				),
		);
		ctx.hits.length = 0;
		ctx.hits.push(...kept);
	}
	return j;
}

function parseOperator(ctx: Ctx, i: number): number {
	const token = at(ctx, i);
	const next = at(ctx, i + 1);
	const operand =
		next !== undefined &&
		!is(next, ":") &&
		!is(next, "?") &&
		!is(next, ",") &&
		!is(next, ")") &&
		!is(next, ">") &&
		!is(next, "]") &&
		!is(next, "=") &&
		!is(next, ";");
	if (
		(is(token, "keyof") || is(token, "unique") || is(token, "readonly")) &&
		operand
	)
		return parseOperator(ctx, i + 1);
	if (is(token, "infer") && isWord(next)) return i + 2;
	return parsePostfix(ctx, i);
}

function parsePostfix(ctx: Ctx, i: number): number {
	let j = parsePrimary(ctx, i);
	while (j >= 0 && is(at(ctx, j), "[") && !at(ctx, j)?.newlineBefore) {
		if (is(at(ctx, j + 1), "]")) {
			j += 2;
			continue;
		}
		const end = parseType(ctx, j + 1, false);
		if (end < 0 || !is(at(ctx, end), "]")) return -1;
		j = end + 1;
	}
	return j;
}

function parseEntity(ctx: Ctx, i: number): number {
	let j = i + 1;
	while (is(at(ctx, j), ".") && isWord(at(ctx, j + 1))) j += 2;
	if (is(at(ctx, j), "<") && !at(ctx, j)?.newlineBefore) {
		const end = parseTypeArgs(ctx, j);
		if (end < 0) return -1;
		j = end;
	}
	return j;
}

function parsePrimary(ctx: Ctx, i: number): number {
	const token = at(ctx, i);
	if (!token) return -1;
	switch (token.kind) {
		case "string":
		case "number":
		case "template":
			return i + 1;
		case "template-head":
			return parseTemplateType(ctx, i + 1);
		case "word":
			return parseNamedType(ctx, i, token);
		case "punct":
			return parsePunctType(ctx, i, token);
		default:
			return -1;
	}
}

function parseTemplateType(ctx: Ctx, i: number): number {
	let j = i;
	for (;;) {
		const end = parseType(ctx, j, false);
		if (end < 0) return -1;
		const part = at(ctx, end);
		if (part?.kind === "template-tail") return end + 1;
		if (part?.kind !== "template-middle") return -1;
		j = end + 1;
	}
}

function parseNamedType(ctx: Ctx, i: number, token: Token): number {
	if (NOT_A_TYPE.has(token.text)) return -1;
	if (token.text === "typeof") {
		const target = at(ctx, i + 1);
		if (is(target, "import")) return parseImportType(ctx, i + 1);
		return isWord(target) ? parseEntity(ctx, i + 1) : -1;
	}
	if (token.text === "import") return parseImportType(ctx, i);
	const dotted = is(at(ctx, i + 1), ".");
	if (token.text === "any" && !dotted) record(ctx, "any", i);
	if ((token.text === "Function" || token.text === "Object") && !dotted)
		record(ctx, "banned-type", i, token.text);
	return parseEntity(ctx, i);
}

function parseImportType(ctx: Ctx, i: number): number {
	if (!is(at(ctx, i + 1), "(")) return -1;
	let j = closeOf(ctx, i + 1) + 1;
	if (j <= 0) return -1;
	while (is(at(ctx, j), ".") && isWord(at(ctx, j + 1))) j += 2;
	if (is(at(ctx, j), "<")) {
		const end = parseTypeArgs(ctx, j);
		if (end < 0) return -1;
		j = end;
	}
	return j;
}

function parsePunctType(ctx: Ctx, i: number, token: Token): number {
	switch (token.text) {
		case "-":
			return at(ctx, i + 1)?.kind === "number" ? i + 2 : -1;
		case "{":
			return parseObjectType(ctx, i);
		case "[":
			return parseTuple(ctx, i);
		case "(": {
			const inner = parseType(ctx, i + 1, false);
			return inner >= 0 && is(at(ctx, inner), ")") ? inner + 1 : -1;
		}
		default:
			return -1;
	}
}

function parseTuple(ctx: Ctx, i: number): number {
	const close = closeOf(ctx, i);
	if (close < 0) return -1;
	let j = i + 1;
	while (j < close) {
		if (is(at(ctx, j), "...")) j++;
		if (
			isWord(at(ctx, j)) &&
			(is(at(ctx, j + 1), ":") ||
				(is(at(ctx, j + 1), "?") && is(at(ctx, j + 2), ":")))
		)
			j = is(at(ctx, j + 1), "?") ? j + 3 : j + 2;
		const end = parseType(ctx, j, false);
		if (end < 0) return close + 1;
		j = end;
		if (is(at(ctx, j), "?")) j++;
		if (is(at(ctx, j), ",")) j++;
		else if (j !== close) return close + 1;
	}
	return close + 1;
}

function isMappedType(ctx: Ctx, i: number): boolean {
	let j = i + 1;
	if (is(at(ctx, j), "+") || is(at(ctx, j), "-")) j++;
	if (is(at(ctx, j), "readonly")) j++;
	return (
		is(at(ctx, j), "[") && isWord(at(ctx, j + 1)) && is(at(ctx, j + 2), "in")
	);
}

function parseObjectType(ctx: Ctx, i: number, body = false): number {
	const close = closeOf(ctx, i);
	if (close < 0) return -1;
	if (close === i + 1) {
		if (!body) record(ctx, "banned-type", i, "{}");
		return close + 1;
	}
	if (isMappedType(ctx, i)) {
		parseMapped(ctx, i, close);
		return close + 1;
	}
	let j = i + 1;
	while (j < close) {
		if (is(at(ctx, j), ";") || is(at(ctx, j), ",")) {
			j++;
			continue;
		}
		const end = parseMember(ctx, j, close);
		j = end > j ? end : skipToSeparator(ctx, j, close);
		if (
			j === end &&
			end < close &&
			!is(at(ctx, j), ";") &&
			!is(at(ctx, j), ",") &&
			!at(ctx, j)?.newlineBefore
		)
			j = skipToSeparator(ctx, j, close);
	}
	return close + 1;
}

function parseMapped(ctx: Ctx, i: number, close: number): void {
	let j = i + 1;
	while (!is(at(ctx, j), "[") && j < close) j++;
	const bracket = j;
	const constraint = parseType(ctx, bracket + 3, false);
	if (constraint < 0) return;
	j = constraint;
	if (is(at(ctx, j), "as")) {
		j = parseType(ctx, j + 1, false);
		if (j < 0) return;
	}
	if (!is(at(ctx, j), "]")) return;
	j++;
	if (is(at(ctx, j), "+") || is(at(ctx, j), "-")) j++;
	if (is(at(ctx, j), "?")) j++;
	if (is(at(ctx, j), ":")) parseType(ctx, j + 1, false);
}

function parseSignature(ctx: Ctx, i: number): number {
	let j = i;
	if (is(at(ctx, j), "<")) {
		j = parseTypeParams(ctx, j);
		if (j < 0) return -1;
	}
	if (!is(at(ctx, j), "(")) return -1;
	j = parseParams(ctx, j);
	if (j < 0) return -1;
	return is(at(ctx, j), ":") ? parseReturnType(ctx, j + 1) : j;
}

function parseMember(ctx: Ctx, i: number, close: number): number {
	let j = i;
	if (is(at(ctx, j), "(") || is(at(ctx, j), "<")) return parseSignature(ctx, j);
	if (
		is(at(ctx, j), "new") &&
		(is(at(ctx, j + 1), "(") || is(at(ctx, j + 1), "<"))
	)
		return parseSignature(ctx, j + 1);
	while (
		isWord(at(ctx, j)) &&
		["readonly", "get", "set"].includes(at(ctx, j)?.text ?? "") &&
		!is(at(ctx, j + 1), ":") &&
		!is(at(ctx, j + 1), "?") &&
		!is(at(ctx, j + 1), "(") &&
		!is(at(ctx, j + 1), ";") &&
		!is(at(ctx, j + 1), ",")
	)
		j++;
	const name = at(ctx, j);
	if (is(name, "[")) {
		const bracketClose = closeOf(ctx, j);
		if (bracketClose < 0 || bracketClose > close) return -1;
		if (isWord(at(ctx, j + 1)) && is(at(ctx, j + 2), ":"))
			parseType(ctx, j + 3, false);
		j = bracketClose + 1;
	} else if (
		name &&
		(name.kind === "word" || name.kind === "string" || name.kind === "number")
	) {
		j++;
	} else return -1;
	if (is(at(ctx, j), "?")) j++;
	if (is(at(ctx, j), "(") || is(at(ctx, j), "<")) return parseSignature(ctx, j);
	if (is(at(ctx, j), ":")) return parseType(ctx, j + 1, false);
	return j;
}

function castShape(ctx: Ctx, asIndex: number): CastShape {
	const target = at(ctx, asIndex + 1);
	if (is(target, "any")) return "as-any";
	if (is(target, "unknown") && is(at(ctx, asIndex + 2), "as")) return "double";
	const before = at(ctx, asIndex - 1);
	if (is(before, "unknown") && is(at(ctx, asIndex - 2), "as")) return "double";
	if (!is(before, ")")) return "plain";
	const open = closeOf(ctx, asIndex - 1);
	if (
		is(at(ctx, open - 1), "parse") &&
		is(at(ctx, open - 2), ".") &&
		is(at(ctx, open - 3), "JSON")
	)
		return "json-parse";
	if (is(at(ctx, open - 1), "json") && is(at(ctx, open - 2), "."))
		return "response-json";
	const inner = at(ctx, asIndex - 2);
	if (is(inner, ")")) {
		const call = closeOf(ctx, asIndex - 2);
		if (is(at(ctx, call - 1), "json") && is(at(ctx, call - 2), "."))
			return "response-json";
		if (
			is(at(ctx, call - 1), "parse") &&
			is(at(ctx, call - 2), ".") &&
			is(at(ctx, call - 3), "JSON")
		)
			return "json-parse";
	}
	return "plain";
}

function startsType(token: Token | undefined): boolean {
	if (!token) return false;
	switch (token.kind) {
		case "word":
			return !NOT_A_TYPE.has(token.text) || token.text === "const";
		case "string":
		case "number":
		case "template":
		case "template-head":
			return true;
		case "punct":
			return ["(", "{", "[", "|", "&", "-"].includes(token.text);
		default:
			return false;
	}
}

function isStatementStart(ctx: Ctx, i: number): boolean {
	const before = at(ctx, i - 1);
	if (!before) return true;
	if (at(ctx, i)?.newlineBefore) return true;
	return (
		is(before, ";") ||
		is(before, "{") ||
		is(before, "}") ||
		is(before, "export") ||
		is(before, "declare") ||
		is(before, "default")
	);
}

function skipModule(ctx: Ctx, i: number): number {
	let j = i + 1;
	if (at(ctx, j)?.kind === "string") return j + 1;
	while (j < ctx.tokens.length) {
		const token = at(ctx, j);
		if (is(token, "{")) {
			j = closeOf(ctx, j) + 1;
			continue;
		}
		if (is(token, "from")) return j + 2;
		if (is(token, "}") || is(token, ")") || is(token, "]")) return j;
		if (
			is(token, ";") ||
			is(token, "=") ||
			(j > i + 1 && token?.newlineBefore && !is(token, "as"))
		)
			return j;
		j++;
	}
	return j;
}

function arrowParams(ctx: Ctx, open: number): boolean {
	const close = closeOf(ctx, open);
	if (close < 0) return false;
	const after = at(ctx, close + 1);
	if (is(after, "=>")) return true;
	if (!is(after, ":")) return false;
	const saved = ctx.hits.length;
	const end = parseReturnType(ctx, close + 2);
	ctx.hits.length = saved;
	return end >= 0 && is(at(ctx, end), "=>");
}

function nameIndexBefore(ctx: Ctx, i: number): number {
	let j = i - 1;
	if (is(at(ctx, j), "?")) j--;
	if (is(at(ctx, j), "]")) return closeOf(ctx, j);
	const token = at(ctx, j);
	return token &&
		(token.kind === "word" ||
			token.kind === "string" ||
			token.kind === "number")
		? j
		: -1;
}

function isMemberStart(ctx: Ctx, nameIndex: number, frame: Frame): boolean {
	if (nameIndex < 0) return false;
	const before = at(ctx, nameIndex - 1);
	if (!before) return false;
	if (isWord(before) && MEMBER_MODIFIERS.has(before.text)) return true;
	if (is(before, "*")) return true;
	if (frame.role === "object") return is(before, "{") || is(before, ",");
	if (frame.role === "class")
		return (
			is(before, "{") ||
			is(before, ";") ||
			is(before, "}") ||
			is(before, ")") ||
			at(ctx, nameIndex)?.newlineBefore === true
		);
	return false;
}

function newFrame(role: Role, close: number): Frame {
	return {
		role,
		close,
		state: role === "params" ? "binding" : role === "class" ? "member" : "none",
		decl: "none",
		ternary: 0,
		colon: "none",
		pendingClass: false,
	};
}

function parenRole(ctx: Ctx, i: number, frame: Frame): Role {
	if (ctx.paramOpens.has(i)) return "params";
	const before = at(ctx, i - 1);
	if (
		is(before, "function") ||
		is(before, "catch") ||
		is(before, "constructor")
	)
		return "params";
	if (
		isWord(before) &&
		(is(at(ctx, i - 2), "function") ||
			(is(at(ctx, i - 2), "*") && is(at(ctx, i - 3), "function")))
	)
		return "params";
	if (
		(frame.role === "class" || frame.role === "object") &&
		isMemberStart(ctx, nameIndexBefore(ctx, i), frame)
	)
		return "params";
	return arrowParams(ctx, i) ? "params" : "expr";
}

function braceRole(ctx: Ctx, i: number, frame: Frame): Role {
	const before = at(ctx, i - 1);
	if (frame.pendingClass) return "class";
	if (before?.kind === "jsx") return "expr";
	if (is(before, "=>")) return "block";
	if (["else", "do", "try", "finally"].some((word) => is(before, word)))
		return "block";
	if (frame.decl === "binding") return "object";
	if (is(before, ":")) return frame.colon === "label" ? "block" : "object";
	if (is(before, ";") || is(before, "{") || is(before, "}") || is(before, ")"))
		return "block";
	return startsExpression(before) ? "object" : "block";
}

function walkWord(ctx: Ctx, i: number, frame: Frame): number {
	const token = at(ctx, i);
	const next = at(ctx, i + 1);
	if (!token || isPropertyName(ctx, i)) return i + 1;
	switch (token.text) {
		case "as": {
			if (!endsExpression(ctx, i - 1) || !startsType(next)) return i + 1;
			if (is(next, "const")) return i + 2;
			const bareUnknown =
				is(next, "unknown") &&
				!is(at(ctx, i + 2), "as") &&
				!is(at(ctx, i + 2), "[");
			if (!bareUnknown) record(ctx, "cast", i, castShape(ctx, i));
			const end = parseType(ctx, i + 1, false);
			return end > i ? end : i + 1;
		}
		case "satisfies": {
			if (!endsExpression(ctx, i - 1)) return i + 1;
			const end = parseType(ctx, i + 1, false);
			return end > i ? end : i + 1;
		}
		case "type": {
			if (!isStatementStart(ctx, i) || !isWord(next)) return i + 1;
			let j = i + 2;
			if (is(at(ctx, j), "<")) j = parseTypeParams(ctx, j);
			if (j < 0 || !is(at(ctx, j), "=")) return i + 1;
			const end = parseType(ctx, j + 1, false);
			return end > i ? end : j + 1;
		}
		case "interface": {
			if (!isStatementStart(ctx, i) || !isWord(next)) return i + 1;
			let j = i + 2;
			if (is(at(ctx, j), "<")) j = parseTypeParams(ctx, j);
			if (j < 0) return i + 1;
			if (is(at(ctx, j), "extends")) {
				j = parseType(ctx, j + 1, true);
				while (j >= 0 && is(at(ctx, j), ",")) j = parseType(ctx, j + 1, true);
			}
			if (j < 0 || !is(at(ctx, j), "{")) return i + 1;
			return parseObjectType(ctx, j, true);
		}
		case "implements": {
			let j = parseType(ctx, i + 1, true);
			while (j >= 0 && is(at(ctx, j), ",")) j = parseType(ctx, j + 1, true);
			return j > i ? j : i + 1;
		}
		case "enum": {
			const start = isStatementStart(ctx, i) || is(at(ctx, i - 1), "const");
			if (start && isWord(next) && is(at(ctx, i + 2), "{")) {
				record(ctx, "enum", i, next?.text ?? "");
				return i + 2;
			}
			return i + 1;
		}
		case "class":
			return walkClass(ctx, i, frame);
		case "function": {
			let j = i + 1;
			if (is(at(ctx, j), "*")) j++;
			if (isWord(at(ctx, j))) j++;
			if (is(at(ctx, j), "<")) {
				const end = parseTypeParams(ctx, j);
				if (end > j) j = end;
			}
			if (is(at(ctx, j), "(")) ctx.paramOpens.add(j);
			return j;
		}
		case "let":
		case "const":
		case "var":
		case "using": {
			if (is(next, "enum")) return i + 1;
			if (isWord(next) || is(next, "{") || is(next, "["))
				frame.decl = "binding";
			return i + 1;
		}
		case "of":
		case "in":
			if (frame.decl === "binding") frame.decl = "none";
			return i + 1;
		case "import":
		case "export": {
			const statement =
				isWord(next) ||
				is(next, "{") ||
				is(next, "*") ||
				next?.kind === "string";
			if (token.text === "import" && !statement) return i + 1;
			const reexport =
				token.text === "export" &&
				(is(next, "{") ||
					is(next, "*") ||
					(is(next, "type") &&
						(is(at(ctx, i + 2), "{") || is(at(ctx, i + 2), "*"))));
			if (token.text === "import" || reexport) return skipModule(ctx, i);
			return i + 1;
		}
		default:
			if (STATEMENT_WORDS.has(token.text)) frame.decl = "none";
			return i + 1;
	}
}

const CLASS_BASE_STOP: ReadonlySet<string> = new Set([
	"(",
	"<",
	"{",
	"implements",
]);

function walkClass(ctx: Ctx, i: number, frame: Frame): number {
	const next = at(ctx, i + 1);
	const header = isWord(next) || is(next, "{") || is(next, "<");
	if (is(at(ctx, i - 1), ".") || !header) return i + 1;
	let j = i + 1;
	if (
		isWord(at(ctx, j)) &&
		!is(at(ctx, j), "extends") &&
		!is(at(ctx, j), "implements")
	)
		j++;
	if (is(at(ctx, j), "<")) {
		const end = parseTypeParams(ctx, j);
		if (end > j) j = end;
	}
	frame.pendingClass = true;
	if (!is(at(ctx, j), "extends")) return j;
	const parts: string[] = [];
	let k = j + 1;
	while (
		k < ctx.tokens.length &&
		!CLASS_BASE_STOP.has(at(ctx, k)?.text ?? "{")
	) {
		const part = at(ctx, k);
		if (!part || (part.kind !== "word" && !is(part, "."))) break;
		parts.push(part.text);
		k++;
	}
	record(ctx, "extends", j, parts.join(""));
	return j + 1;
}

function walkAngle(ctx: Ctx, i: number, frame: Frame): number {
	const before = at(ctx, i - 1);
	const saved = ctx.hits.length;
	const rollback = (): void => {
		ctx.hits.length = saved;
	};
	const member =
		(frame.role === "class" || frame.role === "object") &&
		isWord(before) &&
		isMemberStart(ctx, i - 1, frame);
	if (member) {
		const params = parseTypeParams(ctx, i);
		if (params > i && is(at(ctx, params), "(")) {
			ctx.paramOpens.add(params);
			return params;
		}
		rollback();
	}
	if (endsExpression(ctx, i - 1) && !is(before, "}")) {
		const end = parseTypeArgs(ctx, i);
		if (end < 0 || !typeArgsMayEnd(at(ctx, end), frame)) {
			rollback();
			return i + 1;
		}
		return end;
	}
	if (!startsExpression(before)) return i + 1;
	const params = parseTypeParams(ctx, i);
	if (params > i && is(at(ctx, params), "(") && arrowParams(ctx, params)) {
		ctx.paramOpens.add(params);
		return params;
	}
	rollback();
	if (!ctx.angleCasts) return i + 1;
	if (is(at(ctx, i + 1), "const") && is(at(ctx, i + 2), ">")) return i + 3;
	const end = parseType(ctx, i + 1, false);
	if (end < 0 || !is(at(ctx, end), ">")) {
		rollback();
		return i + 1;
	}
	ctx.hits.splice(saved, 0, { kind: "cast", token: i, detail: "angle" });
	return end + 1;
}

function typeArgsMayEnd(follower: Token | undefined, frame: Frame): boolean {
	if (!follower || follower.newlineBefore) return true;
	switch (follower.kind) {
		case "template":
		case "template-head":
			return true;
		case "punct":
			if (follower.text === "{") return frame.pendingClass;
			return !["<", ">", "+", "-", "[", "!", "~", "..."].includes(
				follower.text,
			);
		case "word":
			return [
				"as",
				"satisfies",
				"in",
				"instanceof",
				"implements",
				"extends",
			].includes(follower.text);
		default:
			return false;
	}
}

function walkColon(ctx: Ctx, i: number, frame: Frame): number {
	const annotation =
		ctx.annotations.has(i) ||
		(frame.role === "params" && frame.state === "binding") ||
		(frame.role === "class" &&
			frame.state === "member" &&
			frame.ternary === 0) ||
		frame.decl === "binding";
	if (annotation) {
		const end = ctx.annotations.has(i)
			? parseReturnType(ctx, i + 1)
			: parseType(ctx, i + 1, false);
		return end > i ? end : i + 1;
	}
	if (frame.ternary > 0) {
		frame.ternary--;
		frame.colon = "value";
	} else {
		frame.colon =
			frame.role === "object" || frame.role === "expr" ? "value" : "label";
	}
	return i + 1;
}

function walkPunct(ctx: Ctx, i: number, frame: Frame, stack: Frame[]): number {
	const token = at(ctx, i);
	const next = at(ctx, i + 1);
	switch (token?.text) {
		case "(": {
			const role = parenRole(ctx, i, frame);
			const close = closeOf(ctx, i);
			if (role === "params" && is(at(ctx, close + 1), ":"))
				ctx.annotations.add(close + 1);
			stack.push(newFrame(role, close));
			return i + 1;
		}
		case "[":
			stack.push(newFrame("expr", closeOf(ctx, i)));
			return i + 1;
		case "{": {
			const role = braceRole(ctx, i, frame);
			if (role === "class") frame.pendingClass = false;
			stack.push(newFrame(role, closeOf(ctx, i)));
			return i + 1;
		}
		case ":":
			return walkColon(ctx, i, frame);
		case "?":
			if (
				!(
					is(next, ":") ||
					is(next, ")") ||
					is(next, ",") ||
					is(next, "=") ||
					(frame.role === "class" && is(next, "("))
				)
			)
				frame.ternary++;
			return i + 1;
		case "=":
			if (frame.role === "params" && frame.state === "binding")
				frame.state = "default";
			if (frame.role === "class" && frame.state === "member")
				frame.state = "init";
			if (frame.decl === "binding") frame.decl = "init";
			return i + 1;
		case ",":
			if (frame.role === "params" && frame.state === "default")
				frame.state = "binding";
			if (frame.decl === "init") frame.decl = "binding";
			return i + 1;
		case ";":
			frame.decl = "none";
			frame.ternary = 0;
			if (frame.role === "class") frame.state = "member";
			return i + 1;
		case "<":
			return walkAngle(ctx, i, frame);
		case "!": {
			const before = at(ctx, i - 1);
			const postfix =
				!token.newlineBefore &&
				(is(before, ")") ||
					is(before, "]") ||
					(isWord(before) && endsExpression(ctx, i - 1)));
			if (postfix) record(ctx, "non-null", i);
			return i + 1;
		}
		default:
			return i + 1;
	}
}

function walk(ctx: Ctx): void {
	const stack: Frame[] = [newFrame("block", ctx.tokens.length)];
	let i = 0;
	while (i < ctx.tokens.length) {
		let frame = stack[stack.length - 1];
		while (frame && stack.length > 1 && i >= frame.close) {
			const atClose = i === frame.close;
			stack.pop();
			const parent = stack[stack.length - 1];
			if (parent?.role === "class" && frame.role === "block")
				parent.state = "member";
			frame = parent;
			if (atClose) i++;
		}
		const token = at(ctx, i);
		if (!frame || !token) break;
		if (
			frame.role === "class" &&
			frame.state === "init" &&
			token.newlineBefore &&
			endsValue(at(ctx, i - 1)) &&
			(isWord(token) || is(token, "[") || is(token, "@"))
		)
			frame.state = "member";
		const next =
			token.kind === "word"
				? walkWord(ctx, i, frame)
				: token.kind === "punct"
					? walkPunct(ctx, i, frame, stack)
					: i + 1;
		i = Math.max(next, i + 1);
	}
}

const DIRECTIVE = /^@ts-(ignore|nocheck|expect-error)(?![\w-])/;

function directiveOf(comment: SourceComment): HatchKind | undefined {
	const lines = comment.block
		? comment.text.slice(2, -2).split("\n")
		: [comment.text.slice(2)];
	for (const line of lines) {
		const found = DIRECTIVE.exec(line.replace(/^[\s/*]*/, ""));
		if (found?.[1] === "ignore") return "ts-ignore";
		if (found?.[1] === "nocheck") return "ts-nocheck";
		if (found?.[1] === "expect-error") return "ts-expect-error";
	}
	return undefined;
}

export function findHatches(
	source: string,
	options: SyntaxOptions,
): readonly Hatch[] | undefined {
	const scanned = scan(source, options.jsx);
	if (!scanned) return undefined;
	const match = matchBrackets(scanned.tokens);
	if (!match) return undefined;
	const ctx: Ctx = {
		tokens: scanned.tokens,
		match,
		hits: [],
		paramOpens: new Set(),
		annotations: new Set(),
		angleCasts: options.angleCasts,
	};
	walk(ctx);
	const fromTokens = ctx.hits.map(
		(hit): Hatch => ({
			kind: hit.kind,
			line: scanned.tokens[hit.token]?.line ?? 0,
			detail: hit.detail,
		}),
	);
	const fromComments = scanned.comments.flatMap((comment): Hatch[] => {
		const kind = directiveOf(comment);
		return kind ? [{ kind, line: comment.line, detail: "" }] : [];
	});
	return [...fromTokens, ...fromComments].sort((a, b) => a.line - b.line);
}
