import { EFFECTS, type Effect } from "../change-proof/contract.ts";
import { RUNGS, type Rung } from "../change-proof/rung.ts";
import { err, ok, type Result } from "../result.ts";

export const BLOCK_LINE_CAP = 15;

export const DOMAIN_GRAMMAR = `context <Ctx>    plan: one card context
context <Ctx> [shared] : <glob>, ...    card only
agg  <Agg> @ <module>: <State>[, <Cmd> -> <Event>]
inv  <Id> <Agg>: <one-line invariant>
cap  <Cap> [<class>, ...] @ <port path>: <op>(read|write), ...
pure <glob>    card only
step <name> : <A> -> <Out>
flow <name> = <step> >=> <step> ...
law  <Id> <InvId>|<Cap> <property>   check: tsc | prop <control-id> | tla <Model>.<Invariant>
map  <CtxA> => <CtxB>: <translation>, eq <path equation>   check: prop <control-id>
abs  <module>: hides <rule>, callers <path> ..., deletion inline|spreads <n>, alt <option>
rung R<0-4>
A := void | Type   Type := Atom | Atom[] | (Type, ...)   Atom := <Name> | string | number | boolean | unknown
Out := Type | void | Eff<Row, Errs, Type | void>   Row := never | <Cap> | <Cap>.<op> | ...
Errs := never | <Name> | ...   class := ${EFFECTS.join(" | ")}
`;

export type BlockLine = { readonly n: number; readonly text: string };

export type BlockProblem = { readonly line: number; readonly message: string };

export type BlockProblems = readonly BlockProblem[];

export type CardFile = { readonly path: string; readonly text: string };

export type TypeExpr =
	| { readonly kind: "void" }
	| { readonly kind: "name"; readonly name: string }
	| { readonly kind: "array"; readonly item: string }
	| { readonly kind: "tuple"; readonly items: readonly TypeExpr[] };

export type CapRef = { readonly cap: string; readonly op: string | undefined };

export type StepOut =
	| { readonly kind: "pure"; readonly type: TypeExpr }
	| {
			readonly kind: "eff";
			readonly row: readonly CapRef[];
			readonly errs: readonly string[];
			readonly value: TypeExpr;
	  };

export type CapOp = { readonly name: string; readonly mode: "read" | "write" };

export type LawCheck =
	| { readonly kind: "tsc" }
	| { readonly kind: "prop"; readonly control: string }
	| {
			readonly kind: "tla";
			readonly model: string;
			readonly invariant: string;
	  };

export type ContextLine = {
	readonly line: number;
	readonly name: string;
	readonly shared: boolean;
	readonly globs: readonly string[];
};

export type AggLine = {
	readonly line: number;
	readonly name: string;
	readonly module: string;
	readonly state: string;
	readonly command:
		| { readonly cmd: string; readonly event: string }
		| undefined;
};

export type InvLine = {
	readonly line: number;
	readonly id: string;
	readonly agg: string;
	readonly text: string;
};

export type CapLine = {
	readonly line: number;
	readonly name: string;
	readonly classes: readonly Effect[];
	readonly port: string;
	readonly ops: readonly CapOp[];
};

export type PureLine = { readonly line: number; readonly glob: string };

export type StepLine = {
	readonly line: number;
	readonly name: string;
	readonly input: TypeExpr;
	readonly output: StepOut;
};

export type FlowLine = {
	readonly line: number;
	readonly name: string;
	readonly steps: readonly string[];
	readonly row: readonly CapRef[];
	readonly errs: readonly string[];
};

export type LawLine = {
	readonly line: number;
	readonly id: string;
	readonly tag: string;
	readonly property: string;
	readonly check: LawCheck | undefined;
};

export type MapLine = {
	readonly line: number;
	readonly from: string;
	readonly to: string;
	readonly translation: string;
	readonly equation: string | undefined;
	readonly check: LawCheck | undefined;
};

export type AbsLine = {
	readonly line: number;
	readonly module: string;
	readonly hides: string;
	readonly callers: readonly string[];
	readonly deletion:
		| { readonly kind: "inline" }
		| { readonly kind: "spreads"; readonly count: number };
	readonly alt: string;
};

export type RungLine = { readonly line: number; readonly rung: Rung };

export type DomainBlock = {
	readonly context: { readonly line: number; readonly name: string };
	readonly aggs: readonly AggLine[];
	readonly invs: readonly InvLine[];
	readonly caps: readonly CapLine[];
	readonly steps: readonly StepLine[];
	readonly flows: readonly FlowLine[];
	readonly laws: readonly LawLine[];
	readonly maps: readonly MapLine[];
	readonly abs: readonly AbsLine[];
	readonly rung: RungLine | undefined;
};

export type Card =
	| { readonly kind: "none" }
	| {
			readonly kind: "card";
			readonly path: string;
			readonly line: number;
			readonly contexts: readonly ContextLine[];
			readonly caps: readonly CapLine[];
			readonly pures: readonly PureLine[];
	  };

const NAME = "[A-Za-z_$][\\w$]*";
const NAME_ONLY = new RegExp(`^${NAME}$`);
const CAP_REF = new RegExp(`^(${NAME})(?:\\.(${NAME}))?$`);
const CAP_OP = new RegExp(`^(${NAME})\\((read|write)\\)$`);
const ID = "[A-Za-z][A-Za-z0-9_]*";
const PROP_CHECK = /^prop\s+([A-Za-z][A-Za-z0-9._-]*)$/;
const TLA_CHECK = new RegExp(`^tla\\s+(${ID})\\.(${ID})$`);

const PATTERNS = {
	context: new RegExp(`^context\\s+(${NAME})(\\s+shared)?(?:\\s*:\\s*(.+))?$`),
	agg: new RegExp(
		`^agg\\s+(${NAME})\\s+@\\s+(\\S+?):\\s*(${NAME})(?:\\s*,\\s*(${NAME})\\s*->\\s*(${NAME}))?$`,
	),
	inv: new RegExp(`^inv\\s+(${ID})\\s+(${NAME}):\\s*(\\S.*)$`),
	cap: new RegExp(
		`^cap\\s+(${NAME})\\s+\\[([^\\]]*)\\]\\s+@\\s+(\\S+?):\\s*(\\S.*)$`,
	),
	pure: /^pure\s+(\S+)$/,
	step: new RegExp(`^step\\s+(${NAME})\\s*:\\s*(.+?)\\s+->\\s+(.+)$`),
	flow: new RegExp(`^flow\\s+(${NAME})\\s*=\\s*(.+)$`),
	law: new RegExp(
		`^law\\s+(${ID})\\s+(${NAME})\\s+(.+?)(?:\\s+check:\\s*(.*))?$`,
	),
	map: new RegExp(
		`^map\\s+(${NAME})\\s*=>\\s*(${NAME}):\\s*(.+?)(?:,\\s*eq\\s+(.+?))?(?:\\s+check:\\s*(.*))?$`,
	),
	abs: /^abs\s+(\S+?):\s*hides\s+(.+?),\s*callers\s+(.+?),\s*deletion\s+(inline|spreads\s+\d+),\s*alt\s+(.+)$/,
	rung: /^rung\s+(\S+)$/,
} as const;

type Keyword = keyof typeof PATTERNS;

const KEYWORDS: readonly string[] = Object.keys(PATTERNS);

const PLAN_KEYWORDS: readonly Keyword[] = [
	"context",
	"agg",
	"inv",
	"cap",
	"step",
	"flow",
	"law",
	"map",
	"abs",
	"rung",
];
const CARD_KEYWORDS: readonly Keyword[] = ["context", "cap", "pure"];

const SHAPES: Readonly<Record<Keyword, string>> = {
	context: "context <Ctx>, or in a card context <Ctx> [shared] : <glob>, ...",
	agg: "agg <Agg> @ <module>: <State>[, <Cmd> -> <Event>]",
	inv: "inv <Id> <Agg>: <one-line invariant>",
	cap: "cap <Cap> [<class>, ...] @ <port path>: <op>(read|write), ...",
	pure: "pure <glob>",
	step: "step <name> : <A> -> <Out>",
	flow: "flow <name> = <step> >=> <step> ...",
	law: "law <Id> <InvId>|<Cap> <property>   check: tsc | prop <control-id> | tla <Model>.<Invariant>",
	map: "map <CtxA> => <CtxB>: <translation>, eq <path equation>   check: prop <control-id>",
	abs: "abs <module>: hides <rule>, callers <path> ..., deletion inline|spreads <n>, alt <option>",
	rung: "rung R<0-4>",
};

function isKeyword(word: string): word is Keyword {
	return KEYWORDS.includes(word);
}

function splitTop(text: string, separator: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let current = "";
	for (const char of text) {
		if (char === "(" || char === "<") depth++;
		if (char === ")" || char === ">") depth--;
		if (char === separator && depth === 0) {
			parts.push(current.trim());
			current = "";
		} else current += char;
	}
	parts.push(current.trim());
	return parts;
}

function parseType(text: string): TypeExpr | undefined {
	const type = text.trim();
	if (type === "void") return { kind: "void" };
	if (type.startsWith("(") && type.endsWith(")")) {
		const items: TypeExpr[] = [];
		for (const part of splitTop(type.slice(1, -1), ",")) {
			const item = parseType(part);
			if (item === undefined || item.kind === "void") return undefined;
			items.push(item);
		}
		return items.length < 2 ? undefined : { kind: "tuple", items };
	}
	if (type.endsWith("[]")) {
		const item = type.slice(0, -2);
		return NAME_ONLY.test(item) ? { kind: "array", item } : undefined;
	}
	return NAME_ONLY.test(type) ? { kind: "name", name: type } : undefined;
}

function parseNames(text: string): readonly string[] | undefined {
	const names = text.split("|").map((name) => name.trim());
	if (names.length === 1 && names[0] === "never") return [];
	return names.every((name) => NAME_ONLY.test(name) && name !== "never")
		? names
		: undefined;
}

function parseRow(text: string): readonly CapRef[] | undefined {
	const refs = text.split("|").map((ref) => ref.trim());
	if (refs.length === 1 && refs[0] === "never") return [];
	const parsed: CapRef[] = [];
	for (const ref of refs) {
		const match = CAP_REF.exec(ref);
		if (match === null || match[1] === "never") return undefined;
		parsed.push({ cap: match[1] ?? "", op: match[2] });
	}
	return parsed;
}

function parseOut(text: string): StepOut | undefined {
	const eff = /^Eff<(.*)>$/.exec(text.trim());
	if (eff === null) {
		const type = parseType(text);
		return type === undefined ? undefined : { kind: "pure", type };
	}
	const parts = splitTop(eff[1] ?? "", ",");
	if (parts.length !== 3) return undefined;
	const [rowText = "", errText = "", valueText = ""] = parts;
	const row = parseRow(rowText);
	const errs = parseNames(errText);
	const value = parseType(valueText);
	return row === undefined || errs === undefined || value === undefined
		? undefined
		: { kind: "eff", row, errs, value };
}

function parseCheck(text: string | undefined): LawCheck | undefined | null {
	if (text === undefined) return undefined;
	const check = text.trim();
	if (check === "tsc") return { kind: "tsc" };
	const prop = PROP_CHECK.exec(check);
	if (prop !== null) return { kind: "prop", control: prop[1] ?? "" };
	const tla = TLA_CHECK.exec(check);
	return tla === null
		? null
		: { kind: "tla", model: tla[1] ?? "", invariant: tla[2] ?? "" };
}

function parseClasses(text: string): readonly Effect[] | undefined {
	const classes: Effect[] = [];
	for (const name of text.split(",").map((part) => part.trim())) {
		const found = EFFECTS.find((effect) => effect === name);
		if (found === undefined) return undefined;
		classes.push(found);
	}
	return classes;
}

function parseOps(text: string): readonly CapOp[] | undefined {
	const ops: CapOp[] = [];
	for (const part of text.split(",").map((op) => op.trim())) {
		const match = CAP_OP.exec(part);
		if (match === null) return undefined;
		ops.push({
			name: match[1] ?? "",
			mode: match[2] === "write" ? "write" : "read",
		});
	}
	return ops;
}

type Lines = {
	readonly contexts: ContextLine[];
	readonly aggs: AggLine[];
	readonly invs: InvLine[];
	readonly caps: CapLine[];
	readonly pures: PureLine[];
	readonly steps: StepLine[];
	readonly flows: FlowLine[];
	readonly laws: LawLine[];
	readonly maps: MapLine[];
	readonly abs: AbsLine[];
	readonly rungs: RungLine[];
};

function addLine(
	into: Lines,
	keyword: Keyword,
	line: number,
	match: RegExpExecArray,
): boolean {
	const at = (index: number): string => match[index] ?? "";
	switch (keyword) {
		case "context": {
			const globs =
				match[3] === undefined
					? []
					: at(3)
							.split(",")
							.map((glob) => glob.trim());
			if (globs.includes("")) return false;
			into.contexts.push({
				line,
				name: at(1),
				shared: match[2] !== undefined,
				globs,
			});
			return true;
		}
		case "agg":
			into.aggs.push({
				line,
				name: at(1),
				module: at(2),
				state: at(3),
				command:
					match[4] === undefined ? undefined : { cmd: at(4), event: at(5) },
			});
			return true;
		case "inv":
			into.invs.push({ line, id: at(1), agg: at(2), text: at(3) });
			return true;
		case "cap": {
			const classes = parseClasses(at(2));
			const ops = parseOps(at(4));
			if (classes === undefined || ops === undefined) return false;
			into.caps.push({ line, name: at(1), classes, port: at(3), ops });
			return true;
		}
		case "pure":
			into.pures.push({ line, glob: at(1) });
			return true;
		case "step": {
			const input = parseType(at(2));
			const output = parseOut(at(3));
			if (input === undefined || output === undefined) return false;
			into.steps.push({ line, name: at(1), input, output });
			return true;
		}
		case "flow": {
			const steps = at(2)
				.split(">=>")
				.map((step) => step.trim());
			if (steps.length < 2 || !steps.every((step) => NAME_ONLY.test(step)))
				return false;
			into.flows.push({ line, name: at(1), steps, row: [], errs: [] });
			return true;
		}
		case "law": {
			const check = parseCheck(match[4]);
			if (check === null) return false;
			into.laws.push({ line, id: at(1), tag: at(2), property: at(3), check });
			return true;
		}
		case "map": {
			const check = parseCheck(match[5]);
			if (check === null) return false;
			into.maps.push({
				line,
				from: at(1),
				to: at(2),
				translation: at(3),
				equation: match[4],
				check,
			});
			return true;
		}
		case "abs": {
			const spreads = /^spreads\s+(\d+)$/.exec(at(4));
			into.abs.push({
				line,
				module: at(1),
				hides: at(2),
				callers: at(3).split(/\s+/),
				deletion:
					spreads === null
						? { kind: "inline" }
						: { kind: "spreads", count: Number(spreads[1]) },
				alt: at(5),
			});
			return true;
		}
		case "rung": {
			const rung = RUNGS.find((name) => name === at(1));
			if (rung === undefined) return false;
			into.rungs.push({ line, rung });
			return true;
		}
		default: {
			const unreachable: never = keyword;
			return unreachable;
		}
	}
}

function readLines(
	lines: readonly BlockLine[],
	allowed: readonly Keyword[],
	where: string,
): { readonly lines: Lines; readonly problems: BlockProblem[] } {
	const into: Lines = {
		contexts: [],
		aggs: [],
		invs: [],
		caps: [],
		pures: [],
		steps: [],
		flows: [],
		laws: [],
		maps: [],
		abs: [],
		rungs: [],
	};
	const problems: BlockProblem[] = [];
	for (const { n, text } of lines) {
		const trimmed = text.trim();
		if (trimmed === "") continue;
		const word = trimmed.split(/\s+/)[0] ?? "";
		if (!isKeyword(word) || !allowed.includes(word)) {
			problems.push({
				line: n,
				message: `"${word}" is no keyword of ${where}; use ${allowed.join(", ")}`,
			});
			continue;
		}
		const match = PATTERNS[word].exec(trimmed);
		if (match === null || !addLine(into, word, n, match))
			problems.push({
				line: n,
				message: `a ${word} line reads ${SHAPES[word]}`,
			});
	}
	return { lines: into, problems };
}

export function unwrapped(out: StepOut): TypeExpr {
	return out.kind === "pure" ? out.type : out.value;
}

export function firstInput(input: TypeExpr): TypeExpr {
	return input.kind === "tuple" ? (input.items[0] ?? input) : input;
}

export function typeText(type: TypeExpr): string {
	switch (type.kind) {
		case "void":
			return "void";
		case "name":
			return type.name;
		case "array":
			return `${type.item}[]`;
		case "tuple":
			return `(${type.items.map(typeText).join(", ")})`;
		default: {
			const unreachable: never = type;
			return unreachable;
		}
	}
}

export function capRefText(ref: CapRef): string {
	return ref.op === undefined ? ref.cap : `${ref.cap}.${ref.op}`;
}

function distinct<T>(
	lists: readonly (readonly T[])[],
	key: (item: T) => string,
): T[] {
	const seen = new Map<string, T>();
	for (const item of lists.flat())
		if (!seen.has(key(item))) seen.set(key(item), item);
	return [...seen.values()];
}

function joinFlow(
	flow: FlowLine,
	steps: ReadonlyMap<string, StepLine>,
): Result<FlowLine, BlockProblem> {
	const chain: StepLine[] = [];
	for (const name of flow.steps) {
		const step = steps.get(name);
		if (step === undefined)
			return err({
				line: flow.line,
				message: `flow ${flow.name} names the unknown step ${name}`,
			});
		chain.push(step);
	}
	for (const [at, then] of chain.entries()) {
		const first = chain[at - 1];
		if (first === undefined) continue;
		const out = typeText(unwrapped(first.output));
		const into = typeText(firstInput(then.input));
		if (out !== into)
			return err({
				line: flow.line,
				message: `flow ${flow.name} joins ${first.name} and ${then.name}, but ${first.name} gives ${out} and ${then.name} takes ${into}`,
			});
	}
	const effs = chain.flatMap((step) =>
		step.output.kind === "eff" ? [step.output] : [],
	);
	return ok({
		...flow,
		row: distinct(
			effs.map((out) => out.row),
			capRefText,
		),
		errs: distinct(
			effs.map((out) => out.errs),
			(name) => name,
		),
	});
}

function repeated<T extends { readonly line: number }>(
	what: string,
	items: readonly T[],
	key: (item: T) => string,
): BlockProblem[] {
	const seen = new Set<string>();
	const problems: BlockProblem[] = [];
	for (const item of items) {
		const name = key(item);
		if (seen.has(name))
			problems.push({
				line: item.line,
				message: `${what} ${name} appears twice`,
			});
		seen.add(name);
	}
	return problems;
}

export function parseDomainBlock(
	lines: readonly BlockLine[],
): Result<DomainBlock, BlockProblems> {
	const filled = lines.filter((line) => line.text.trim() !== "");
	const read = readLines(filled, PLAN_KEYWORDS, "a plan domain block");
	const { contexts, caps, steps, rungs } = read.lines;
	const found: BlockProblem[] = [...read.problems];
	const start = lines[0]?.n ?? 1;
	if (filled.length > BLOCK_LINE_CAP)
		found.push({
			line: filled[BLOCK_LINE_CAP]?.n ?? start,
			message: `the domain block has ${filled.length} lines; keep it to ${BLOCK_LINE_CAP}`,
		});
	const [context] = contexts;
	if (context === undefined)
		found.push({
			line: start,
			message: "the domain block needs one context line",
		});
	for (const extra of contexts.slice(1))
		found.push({
			line: extra.line,
			message: "the domain block has one context line",
		});
	for (const line of contexts)
		if (line.globs.length > 0 || line.shared)
			found.push({
				line: line.line,
				message:
					"a plan context line names a card context, with no globs and no shared mark",
			});
	for (const extra of rungs.slice(1))
		found.push({
			line: extra.line,
			message: "the domain block has one rung line",
		});
	found.push(
		...repeated("step", steps, (step) => step.name),
		...repeated("cap", caps, (cap) => cap.name),
		...repeated("inv", read.lines.invs, (inv) => inv.id),
		...repeated("law", read.lines.laws, (law) => law.id),
	);
	const byName = new Map(steps.map((step) => [step.name, step]));
	const flows: FlowLine[] = [];
	for (const flow of read.lines.flows) {
		const joined = joinFlow(flow, byName);
		if (joined.ok) flows.push(joined.value);
		else found.push(joined.error);
	}
	if (found.length > 0 || context === undefined)
		return err(found.sort((a, b) => a.line - b.line));
	return ok({
		context: { line: context.line, name: context.name },
		aggs: read.lines.aggs,
		invs: read.lines.invs,
		caps,
		steps,
		flows,
		laws: read.lines.laws,
		maps: read.lines.maps,
		abs: read.lines.abs,
		rung: rungs[0],
	});
}

const CONTEXTS_HEADING = /^##\s+Contexts\s*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})\s*(\S*)\s*$/;

type CardFence = {
	readonly path: string;
	readonly line: number;
	readonly lines: readonly BlockLine[];
};

function cardFences(file: CardFile): CardFence[] {
	const fences: CardFence[] = [];
	let inContexts = false;
	let open: { line: number; marker: string; lines: BlockLine[] } | undefined;
	let other: string | undefined;
	for (const [index, text] of file.text.split(/\r?\n/).entries()) {
		const n = index + 1;
		if (open !== undefined) {
			if (text.trim() === open.marker) {
				fences.push({ path: file.path, line: open.line, lines: open.lines });
				open = undefined;
			} else open.lines.push({ n, text });
			continue;
		}
		if (other !== undefined) {
			if (text.trim() === other) other = undefined;
			continue;
		}
		const fence = FENCE.exec(text);
		if (fence !== null) {
			const marker = fence[1] ?? "```";
			if (inContexts && fence[2] === "domain")
				open = { line: n, marker, lines: [] };
			else other = marker;
		} else if (/^##\s/.test(text)) inContexts = CONTEXTS_HEADING.test(text);
		else if (/^#\s/.test(text)) inContexts = false;
	}
	return fences;
}

export function parseCard(
	files: readonly CardFile[],
): Result<Card, BlockProblems> {
	const [card, second] = files.flatMap(cardFences);
	if (card === undefined) return ok({ kind: "none" });
	if (second !== undefined)
		return err([
			{
				line: second.line,
				message: `${second.path}:${second.line} holds a second contexts card; ${card.path}:${card.line} holds the first`,
			},
		]);
	const read = readLines(card.lines, CARD_KEYWORDS, "a contexts card");
	const { contexts, caps, pures } = read.lines;
	const found = [
		...read.problems,
		...contexts
			.filter((context) => context.globs.length === 0)
			.map((context) => ({
				line: context.line,
				message:
					"a card context line names its globs: context <Ctx> [shared] : <glob>, ...",
			})),
		...repeated("context", contexts, (context) => context.name),
		...repeated("cap", caps, (cap) => cap.name),
	];
	if (found.length > 0)
		return err(
			found.map((problem) => ({
				line: problem.line,
				message: `${card.path}:${problem.line}: ${problem.message}`,
			})),
		);
	return ok({
		kind: "card",
		path: card.path,
		line: card.line,
		contexts,
		caps,
		pures,
	});
}
