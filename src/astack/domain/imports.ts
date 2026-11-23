import { EFFECTS, type Effect } from "../change-proof/contract.ts";
import { err, ok, type Result } from "../result.ts";
import { scan, type Token } from "../types/scan.ts";
import { findHatches } from "../types/syntax.ts";

export type EffectUse = {
	readonly effect: Effect;
	readonly line: number;
	readonly via: string;
};

export type ValueImport = { readonly line: number; readonly specifier: string };

export type UnknownImport = {
	readonly line: number;
	readonly form: "require" | "import()";
};

export type ModuleFacts = {
	readonly path: string;
	readonly uses: readonly EffectUse[];
	readonly imports: readonly ValueImport[];
	readonly unknown: readonly UnknownImport[];
	readonly throws: readonly number[];
	readonly casts: readonly number[];
	readonly exports: readonly string[];
};

export type ScanStop = { readonly path: string; readonly message: string };

const READ_NAMES: ReadonlySet<string> = new Set([
	"readFileSync",
	"existsSync",
	"statSync",
	"lstatSync",
	"readdirSync",
	"realpathSync",
	"readlinkSync",
	"accessSync",
	"closeSync",
	"constants",
	"readFile",
	"stat",
	"lstat",
	"readdir",
	"realpath",
	"readlink",
	"access",
]);

const NODE_CLASSES: Readonly<Record<string, Effect>> = {
	fs: "fs-read",
	"fs/promises": "fs-read",
	child_process: "spawn",
	net: "network",
	http: "network",
	https: "network",
	os: "env",
};

const MEMBER_CLASSES: Readonly<
	Record<string, Readonly<Record<string, Effect>>>
> = {
	Bun: { spawn: "spawn", spawnSync: "spawn" },
	process: { env: "env", cwd: "env" },
	Date: { now: "clock" },
	performance: { now: "clock" },
	Math: { random: "random" },
	crypto: { randomUUID: "random" },
};

const DECLARES = new Set([
	"function",
	"const",
	"let",
	"var",
	"class",
	"type",
	"interface",
	"enum",
]);

const PREFIXES = [
	"?",
	"await",
	"void",
	"typeof",
	"delete",
	"yield",
	"!",
	"-",
	"+",
	"~",
];

type Names = "all" | readonly string[];

type Clause = {
	readonly next: number;
	readonly specifier: string | undefined;
	readonly names: Names | undefined;
};

function is(token: Token | undefined, text: string): boolean {
	return token !== undefined && token.kind !== "string" && token.text === text;
}

function isMember(tokens: readonly Token[], at: number): boolean {
	const before = tokens[at - 1];
	return is(before, ".") || is(before, "?.");
}

function unquote(token: Token | undefined): string | undefined {
	return token?.kind === "string" ? token.text.slice(1, -1) : undefined;
}

function nodeModule(specifier: string): string | undefined {
	const name = specifier.startsWith("node:") ? specifier.slice(5) : specifier;
	return name in NODE_CLASSES ? name : undefined;
}

function moduleUses(
	specifier: string,
	names: Names,
	line: number,
): EffectUse[] {
	const name = nodeModule(specifier);
	if (name === undefined) return [];
	const effect = NODE_CLASSES[name];
	if (effect === undefined) return [];
	const uses: EffectUse[] = [{ effect, line, via: specifier }];
	if (effect !== "fs-read") return uses;
	const writer =
		names === "all" ? "*" : names.find((one) => !READ_NAMES.has(one));
	if (writer !== undefined)
		uses.push({ effect: "fs-write", line, via: `${specifier} ${writer}` });
	return uses;
}

function closeOf(
	tokens: readonly Token[],
	open: number,
	pair: readonly [string, string] = ["{", "}"],
): number {
	let depth = 0;
	for (let at = open; at < tokens.length; at++) {
		if (is(tokens[at], pair[0])) depth++;
		if (is(tokens[at], pair[1])) depth--;
		if (depth === 0) return at;
	}
	return tokens.length;
}

function namesProperty(tokens: readonly Token[], at: number): boolean {
	const next = tokens[at + 1];
	if (is(next, ":") || is(next, "?") || is(next, "=")) return true;
	if (!is(next, "(")) return false;
	const after = tokens[closeOf(tokens, at + 1, ["(", ")"]) + 1];
	const before = tokens[at - 1];
	const operand = PREFIXES.some((prefix) => is(before, prefix));
	return is(after, "{") || (is(after, ":") && !operand);
}

function namedList(
	tokens: readonly Token[],
	open: number,
): { readonly names: string[]; readonly typed: number; readonly end: number } {
	const end = closeOf(tokens, open);
	const names: string[] = [];
	let typed = 0;
	let start = true;
	for (let at = open + 1; at < end; at++) {
		const token = tokens[at];
		if (is(token, ",")) {
			start = true;
			continue;
		}
		if (!start || token === undefined) continue;
		start = false;
		const after = tokens[at + 1];
		if (
			is(token, "type") &&
			after !== undefined &&
			!is(after, ",") &&
			!is(after, "as") &&
			!is(after, "}")
		) {
			typed++;
			continue;
		}
		names.push(token.kind === "string" ? (unquote(token) ?? "") : token.text);
	}
	return { names, typed, end };
}

function fromClause(tokens: readonly Token[], at: number): Clause {
	let names: string[] | "all" = [];
	let typedOnly = false;
	let index = at;
	while (index < tokens.length) {
		const token = tokens[index];
		if (token === undefined || is(token, ";")) break;
		if (token.kind === "string")
			return { next: index + 1, specifier: unquote(token), names };
		if (is(token, "from") && tokens[index + 1]?.kind === "string")
			return {
				next: index + 2,
				specifier: unquote(tokens[index + 1]),
				names:
					typedOnly && names !== "all" && names.length === 0
						? undefined
						: names,
			};
		if (is(token, "*")) {
			names = "all";
			index++;
			continue;
		}
		if (is(token, "{")) {
			const list = namedList(tokens, index);
			if (names !== "all") names = [...names, ...list.names];
			typedOnly = list.typed > 0;
			index = list.end + 1;
			continue;
		}
		if (token.kind === "word" && !is(token, "as") && names !== "all") {
			const before = tokens[index - 1];
			if (!is(before, "as")) names = [...names, "default"];
		}
		index++;
	}
	return { next: index, specifier: undefined, names: undefined };
}

type Draft = {
	readonly uses: EffectUse[];
	readonly imports: ValueImport[];
	readonly unknown: UnknownImport[];
	readonly throws: number[];
	readonly exports: string[];
};

function addImport(
	draft: Draft,
	line: number,
	specifier: string,
	names: Names,
): void {
	draft.imports.push({ line, specifier });
	draft.uses.push(...moduleUses(specifier, names, line));
}

function readImport(
	tokens: readonly Token[],
	at: number,
	draft: Draft,
): number {
	const token = tokens[at];
	const next = tokens[at + 1];
	if (token === undefined || is(next, ".")) return at + 1;
	if (is(next, "(") && is(tokens[at - 1], "typeof")) return at + 2;
	if (is(next, "(")) {
		const literal = unquote(tokens[at + 2]);
		const closes = is(tokens[at + 3], ")") || is(tokens[at + 3], ",");
		if (literal !== undefined && closes)
			addImport(draft, token.line, literal, "all");
		else draft.unknown.push({ line: token.line, form: "import()" });
		return at + 2;
	}
	const after = tokens[at + 2];
	if (
		is(next, "type") &&
		after !== undefined &&
		!is(after, ",") &&
		!is(after, "from")
	)
		return fromClause(tokens, at + 2).next;
	const clause = fromClause(tokens, at + 1);
	if (clause.specifier !== undefined && clause.names !== undefined)
		addImport(draft, token.line, clause.specifier, clause.names);
	return clause.next;
}

function declaredName(
	tokens: readonly Token[],
	at: number,
): string | undefined {
	let index = at;
	while (
		is(tokens[index], "async") ||
		is(tokens[index], "abstract") ||
		is(tokens[index], "declare")
	)
		index++;
	if (!DECLARES.has(tokens[index]?.text ?? "")) return undefined;
	index++;
	if (is(tokens[index], "*")) index++;
	const name = tokens[index];
	return name?.kind === "word" ? name.text : undefined;
}

function readExport(
	tokens: readonly Token[],
	at: number,
	draft: Draft,
): number {
	const token = tokens[at];
	const next = tokens[at + 1];
	if (token === undefined) return at + 1;
	if (is(next, "type") && (is(tokens[at + 2], "{") || is(tokens[at + 2], "*")))
		return fromClause(tokens, at + 2).next;
	if (is(next, "*")) {
		const clause = fromClause(tokens, at + 1);
		if (clause.specifier !== undefined)
			addImport(draft, token.line, clause.specifier, "all");
		return clause.next;
	}
	if (is(next, "{")) {
		const list = namedList(tokens, at + 1);
		const source = tokens[list.end + 2];
		if (is(tokens[list.end + 1], "from") && source?.kind === "string") {
			const specifier = unquote(source) ?? "";
			if (list.names.length > 0)
				addImport(draft, token.line, specifier, list.names);
			return list.end + 3;
		}
		draft.exports.push(...list.names);
		return list.end + 1;
	}
	if (is(next, "default")) {
		draft.exports.push("default");
		return at + 2;
	}
	const name = declaredName(tokens, at + 1);
	if (name !== undefined) draft.exports.push(name);
	return at + 1;
}

function readGlobal(tokens: readonly Token[], at: number, draft: Draft): void {
	const token = tokens[at];
	if (token === undefined || token.kind !== "word" || isMember(tokens, at))
		return;
	const members = MEMBER_CLASSES[token.text];
	const member = tokens[at + 2];
	if (
		members !== undefined &&
		is(tokens[at + 1], ".") &&
		member !== undefined
	) {
		const effect = members[member.text];
		if (effect !== undefined)
			draft.uses.push({
				effect,
				line: token.line,
				via: `${token.text}.${member.text}`,
			});
		return;
	}
	const before = tokens[at - 1];
	if (
		token.text === "fetch" &&
		is(tokens[at + 1], "(") &&
		!is(before, "function")
	)
		draft.uses.push({ effect: "network", line: token.line, via: "fetch" });
	if (
		token.text === "Date" &&
		is(before, "new") &&
		is(tokens[at + 1], "(") &&
		is(tokens[at + 2], ")")
	)
		draft.uses.push({ effect: "clock", line: token.line, via: "new Date()" });
	if (
		token.text === "require" &&
		is(tokens[at + 1], "(") &&
		!is(before, "function")
	)
		draft.unknown.push({ line: token.line, form: "require" });
	if (token.text === "throw" && !is(tokens[at + 1], ":"))
		draft.throws.push(token.line);
}

function readTokens(tokens: readonly Token[]): Draft {
	const draft: Draft = {
		uses: [],
		imports: [],
		unknown: [],
		throws: [],
		exports: [],
	};
	let at = 0;
	while (at < tokens.length) {
		const token = tokens[at];
		if (token !== undefined && !isMember(tokens, at)) {
			if (is(token, "import") && !namesProperty(tokens, at)) {
				at = readImport(tokens, at, draft);
				continue;
			}
			if (is(token, "export")) {
				at = readExport(tokens, at, draft);
				continue;
			}
		}
		readGlobal(tokens, at, draft);
		at++;
	}
	return draft;
}

export function moduleFacts(
	path: string,
	text: string,
): Result<ModuleFacts, ScanStop> {
	const jsx = path.endsWith(".tsx");
	const scanned = scan(text, jsx);
	const hatches = findHatches(text, { jsx, angleCasts: !jsx });
	if (scanned === undefined || hatches === undefined)
		return err({ path, message: "the types scanner cannot read the module" });
	const draft = readTokens(scanned.tokens);
	return ok({
		path,
		uses: draft.uses,
		imports: draft.imports,
		unknown: draft.unknown,
		throws: draft.throws,
		casts: hatches
			.filter((hatch) => hatch.kind === "cast")
			.map((hatch) => hatch.line),
		exports: [...new Set(draft.exports)],
	});
}

export function classesOf(uses: readonly EffectUse[]): readonly Effect[] {
	return EFFECTS.filter((effect) => uses.some((use) => use.effect === effect));
}
