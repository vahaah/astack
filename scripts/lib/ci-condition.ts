type Json =
	| null
	| boolean
	| number
	| string
	| readonly Json[]
	| { readonly [key: string]: Json };

type Value =
	| { readonly kind: "known"; readonly value: Json }
	| { readonly kind: "scope"; readonly fields: Readonly<Record<string, Value>> }
	| { readonly kind: "spread"; readonly items: readonly Value[] }
	| { readonly kind: "unknown"; readonly truthy: boolean | undefined };

type Operator = "==" | "!=" | "<" | "<=" | ">" | ">=" | "&&" | "||";

type Node =
	| { readonly kind: "literal"; readonly value: Json }
	| { readonly kind: "name"; readonly name: string }
	| { readonly kind: "member"; readonly target: Node; readonly key: string }
	| { readonly kind: "spread"; readonly target: Node }
	| { readonly kind: "index"; readonly target: Node; readonly key: Node }
	| {
			readonly kind: "call";
			readonly name: string;
			readonly args: readonly Node[];
	  }
	| { readonly kind: "not"; readonly operand: Node }
	| {
			readonly kind: "binary";
			readonly op: Operator;
			readonly left: Node;
			readonly right: Node;
	  };

type Token =
	| { readonly kind: "punct"; readonly text: string }
	| { readonly kind: "string"; readonly value: string }
	| { readonly kind: "number"; readonly value: number }
	| { readonly kind: "word"; readonly text: string };

export type Scenario = {
	readonly event: string;
	readonly action: string | undefined;
};

export type Assumptions = Readonly<Record<string, string>>;

const PUNCTUATION: readonly string[] = [
	"==",
	"!=",
	"<=",
	">=",
	"&&",
	"||",
	"(",
	")",
	"[",
	"]",
	",",
	".",
	"*",
	"!",
	"<",
	">",
];

const UNKNOWN: Value = { kind: "unknown", truthy: undefined };

const known = (value: Json): Value => ({ kind: "known", value });

function tokenize(source: string): Token[] | undefined {
	const tokens: Token[] = [];
	let at = 0;
	while (at < source.length) {
		const rest = source.slice(at);
		const space = /^\s+/.exec(rest);
		if (space) {
			at += space[0].length;
			continue;
		}
		const text = /^'((?:[^']|'')*)'/.exec(rest);
		if (text) {
			tokens.push({
				kind: "string",
				value: (text[1] ?? "").replace(/''/g, "'"),
			});
			at += text[0].length;
			continue;
		}
		const number = /^(?:0x[0-9a-f]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)/i.exec(rest);
		if (number) {
			tokens.push({ kind: "number", value: Number(number[0]) });
			at += number[0].length;
			continue;
		}
		const word = /^[a-z_][\w-]*/i.exec(rest);
		if (word) {
			tokens.push({ kind: "word", text: word[0] });
			at += word[0].length;
			continue;
		}
		const punct = PUNCTUATION.find((candidate) => rest.startsWith(candidate));
		if (punct === undefined) return undefined;
		tokens.push({ kind: "punct", text: punct });
		at += punct.length;
	}
	return tokens;
}

function parse(source: string): Node | undefined {
	const tokens = tokenize(source);
	if (tokens === undefined) return undefined;
	let at = 0;
	const peek = (text: string): boolean => {
		const token = tokens[at];
		return token?.kind === "punct" && token.text === text;
	};
	const take = (text: string): boolean => {
		if (!peek(text)) return false;
		at += 1;
		return true;
	};
	const binary = (
		operators: readonly Operator[],
		next: () => Node | undefined,
	): (() => Node | undefined) => {
		return () => {
			let left = next();
			while (left !== undefined) {
				const op = operators.find((candidate) => peek(candidate));
				if (op === undefined) return left;
				at += 1;
				const right = next();
				if (right === undefined) return undefined;
				left = { kind: "binary", op, left, right };
			}
			return undefined;
		};
	};
	const primary = (): Node | undefined => {
		const token = tokens[at];
		if (token === undefined) return undefined;
		at += 1;
		switch (token.kind) {
			case "string":
			case "number":
				return { kind: "literal", value: token.value };
			case "punct": {
				if (token.text !== "(") return undefined;
				const inner = or();
				return take(")") ? inner : undefined;
			}
			case "word": {
				if (token.text === "true") return { kind: "literal", value: true };
				if (token.text === "false") return { kind: "literal", value: false };
				if (token.text === "null") return { kind: "literal", value: null };
				if (!take("(")) return { kind: "name", name: token.text };
				const args: Node[] = [];
				if (take(")")) return { kind: "call", name: token.text, args };
				do {
					const arg = or();
					if (arg === undefined) return undefined;
					args.push(arg);
				} while (take(","));
				return take(")") ? { kind: "call", name: token.text, args } : undefined;
			}
			default: {
				const unhandled: never = token;
				return unhandled;
			}
		}
	};
	const postfix = (): Node | undefined => {
		let target = primary();
		while (target !== undefined) {
			if (take(".")) {
				if (take("*")) {
					target = { kind: "spread", target };
					continue;
				}
				const key = tokens[at];
				if (key?.kind !== "word") return undefined;
				at += 1;
				target = { kind: "member", target, key: key.text };
				continue;
			}
			if (take("[")) {
				const key = or();
				if (key === undefined || !take("]")) return undefined;
				target = { kind: "index", target, key };
				continue;
			}
			return target;
		}
		return undefined;
	};
	const unary = (): Node | undefined => {
		if (!take("!")) return postfix();
		const operand = unary();
		return operand === undefined ? undefined : { kind: "not", operand };
	};
	const relation = binary(["<=", ">=", "<", ">"], unary);
	const equality = binary(["==", "!="], relation);
	const and = binary(["&&"], equality);
	const or = binary(["||"], and);
	const node = or();
	return node !== undefined && at === tokens.length ? node : undefined;
}

function isObject(value: Json): value is { readonly [key: string]: Json } {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function truthiness(value: Value): boolean | undefined {
	switch (value.kind) {
		case "known":
			return !(
				value.value === false ||
				value.value === null ||
				value.value === "" ||
				(typeof value.value === "number" &&
					(value.value === 0 || Number.isNaN(value.value)))
			);
		case "scope":
		case "spread":
			return true;
		case "unknown":
			return value.truthy;
		default: {
			const unhandled: never = value;
			return unhandled;
		}
	}
}

function settle(value: Value): Value {
	if (value.kind !== "spread") return value;
	const items = value.items.map((item) =>
		item.kind === "known" ? item.value : undefined,
	);
	return items.every((item) => item !== undefined)
		? known(items.flatMap((item) => (item === undefined ? [] : [item])))
		: UNKNOWN;
}

function member(target: Value, key: string): Value {
	switch (target.kind) {
		case "known":
			if (isObject(target.value)) return known(target.value[key] ?? null);
			return known(null);
		case "scope":
			return target.fields[key] ?? UNKNOWN;
		case "spread":
			return {
				kind: "spread",
				items: target.items.map((item) => member(item, key)),
			};
		case "unknown":
			return UNKNOWN;
		default: {
			const unhandled: never = target;
			return unhandled;
		}
	}
}

function spread(target: Value): Value {
	if (target.kind === "known" && Array.isArray(target.value))
		return { kind: "spread", items: target.value.map(known) };
	if (target.kind === "known" && isObject(target.value))
		return { kind: "spread", items: Object.values(target.value).map(known) };
	return UNKNOWN;
}

function toNumber(value: Json): number {
	if (value === null) return 0;
	if (typeof value === "boolean") return value ? 1 : 0;
	if (typeof value === "number") return value;
	if (typeof value === "string") return value.trim() === "" ? 0 : Number(value);
	return Number.NaN;
}

function isComposite(value: Json): boolean {
	return typeof value === "object" && value !== null;
}

function looseEquals(left: Json, right: Json): boolean {
	if (isComposite(left) || isComposite(right)) return left === right;
	if (typeof left === "string" && typeof right === "string")
		return left.toLowerCase() === right.toLowerCase();
	return toNumber(left) === toNumber(right);
}

function equals(left: Value, right: Value): Value {
	const a = settle(left);
	const b = settle(right);
	if (a.kind !== "known" || b.kind !== "known") return UNKNOWN;
	return known(looseEquals(a.value, b.value));
}

function contains(search: Value, item: Value): Value {
	const haystack = settle(search);
	const needle = settle(item);
	if (haystack.kind !== "known") return UNKNOWN;
	if (Array.isArray(haystack.value)) {
		if (haystack.value.length === 0) return known(false);
		if (needle.kind !== "known") return UNKNOWN;
		return known(
			haystack.value.some((entry) => looseEquals(entry, needle.value)),
		);
	}
	if (typeof haystack.value !== "string" || needle.kind !== "known")
		return UNKNOWN;
	return known(
		haystack.value.toLowerCase().includes(String(needle.value).toLowerCase()),
	);
}

function affix(
	text: Value,
	part: Value,
	test: (whole: string, piece: string) => boolean,
): Value {
	const whole = settle(text);
	const piece = settle(part);
	if (whole.kind !== "known" || piece.kind !== "known") return UNKNOWN;
	return known(
		test(String(whole.value).toLowerCase(), String(piece.value).toLowerCase()),
	);
}

function call(name: string, args: readonly Value[]): Value {
	const [first = UNKNOWN, second = UNKNOWN] = args;
	switch (name.toLowerCase()) {
		case "success":
		case "always":
			return known(true);
		case "failure":
		case "cancelled":
			return known(false);
		case "contains":
			return contains(first, second);
		case "startswith":
			return affix(first, second, (whole, piece) => whole.startsWith(piece));
		case "endswith":
			return affix(first, second, (whole, piece) => whole.endsWith(piece));
		default:
			return UNKNOWN;
	}
}

function evaluate(node: Node, root: Value): Value {
	switch (node.kind) {
		case "literal":
			return known(node.value);
		case "name":
			return member(root, node.name);
		case "member":
			return member(evaluate(node.target, root), node.key);
		case "spread":
			return spread(evaluate(node.target, root));
		case "index": {
			const key = settle(evaluate(node.key, root));
			if (key.kind !== "known") return UNKNOWN;
			const target = evaluate(node.target, root);
			if (target.kind === "known" && Array.isArray(target.value))
				return typeof key.value === "number"
					? known(target.value[key.value] ?? null)
					: known(null);
			return member(target, String(key.value));
		}
		case "call":
			return call(
				node.name,
				node.args.map((arg) => evaluate(arg, root)),
			);
		case "not": {
			const truthy = truthiness(evaluate(node.operand, root));
			return truthy === undefined ? UNKNOWN : known(!truthy);
		}
		case "binary":
			return combine(node, root);
		default: {
			const unhandled: never = node;
			return unhandled;
		}
	}
}

function combine(node: Extract<Node, { kind: "binary" }>, root: Value): Value {
	const left = evaluate(node.left, root);
	switch (node.op) {
		case "&&": {
			const truthy = truthiness(left);
			if (truthy === false) return left;
			const right = evaluate(node.right, root);
			if (truthy === true) return right;
			return truthiness(right) === false
				? { kind: "unknown", truthy: false }
				: UNKNOWN;
		}
		case "||": {
			const truthy = truthiness(left);
			if (truthy === true) return left;
			const right = evaluate(node.right, root);
			if (truthy === false) return right;
			return truthiness(right) === true
				? { kind: "unknown", truthy: true }
				: UNKNOWN;
		}
		case "==":
			return equals(left, evaluate(node.right, root));
		case "!=": {
			const same = equals(left, evaluate(node.right, root));
			return same.kind === "known" ? known(!same.value) : UNKNOWN;
		}
		case "<":
		case "<=":
		case ">":
		case ">=":
			return UNKNOWN;
		default: {
			const unhandled: never = node.op;
			return unhandled;
		}
	}
}

function assumed(path: readonly string[], value: string): Value {
	const [head, ...rest] = path;
	if (head === undefined) return known(value);
	return { kind: "scope", fields: { [head]: assumed(rest, value) } };
}

function merge(left: Value, right: Value): Value {
	if (left.kind !== "scope" || right.kind !== "scope") return right;
	const fields: Record<string, Value> = { ...left.fields };
	for (const [key, value] of Object.entries(right.fields)) {
		const current = fields[key];
		fields[key] = current === undefined ? value : merge(current, value);
	}
	return { kind: "scope", fields };
}

function contextOf(scenario: Scenario, assumptions: Assumptions): Value {
	const base: Value = {
		kind: "scope",
		fields: {
			github: {
				kind: "scope",
				fields: {
					event_name: known(scenario.event),
					event: {
						kind: "scope",
						fields: {
							action:
								scenario.action === undefined
									? UNKNOWN
									: known(scenario.action),
							label: known(null),
							pull_request: {
								kind: "scope",
								fields: { labels: known([]) },
							},
						},
					},
				},
			},
			inputs: known({}),
		},
	};
	return Object.entries(assumptions).reduce<Value>(
		(context, [path, value]) => merge(context, assumed(path.split("."), value)),
		base,
	);
}

function expressionOf(condition: string): string | undefined {
	const trimmed = condition.trim();
	const whole = /^\$\{\{([\s\S]*)\}\}$/.exec(trimmed);
	if (whole) {
		const inner = whole[1] ?? "";
		return inner.includes("${{") || inner.includes("}}") ? undefined : inner;
	}
	return trimmed.includes("${{") ? undefined : trimmed;
}

export function canRun(
	condition: unknown,
	scenarios: readonly Scenario[],
	assumptions: Assumptions = {},
): boolean {
	if (condition === undefined || condition === null) return true;
	if (typeof condition === "boolean") return condition;
	if (typeof condition === "number") return condition !== 0;
	if (typeof condition !== "string") return true;
	const expression = expressionOf(condition);
	const node = expression === undefined ? undefined : parse(expression);
	if (node === undefined) return true;
	return scenarios.some(
		(scenario) =>
			truthiness(evaluate(node, contextOf(scenario, assumptions))) !== false,
	);
}

export function outputsRead(
	condition: unknown,
): { job: string; output: string }[] {
	if (typeof condition !== "string") return [];
	return [
		...condition.matchAll(/\bneeds\.([\w-]+)\.outputs\.([\w-]+)/g),
	].flatMap((match) =>
		match[1] === undefined || match[2] === undefined
			? []
			: [{ job: match[1], output: match[2] }],
	);
}

const PULL_REQUEST_ACTIONS: readonly string[] = [
	"opened",
	"synchronize",
	"reopened",
];

const NOT_OPEN_OR_LABELLED: readonly string[] = [
	"closed",
	"labeled",
	"unlabeled",
];

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function typesOf(trigger: unknown): readonly string[] | undefined {
	const types = isRecord(trigger) ? trigger.types : undefined;
	if (typeof types === "string") return [types];
	return Array.isArray(types)
		? types.filter((item): item is string => typeof item === "string")
		: undefined;
}

export function pullRequestScenarios(
	on: unknown,
	triggers: readonly string[],
): Scenario[] {
	return triggers.flatMap((event): Scenario[] => {
		const types = typesOf(isRecord(on) ? on[event] : undefined);
		if (event === "merge_group")
			return (types ?? ["checks_requested"]).map((action) => ({
				event,
				action,
			}));
		return (types ?? PULL_REQUEST_ACTIONS)
			.filter((action) => !NOT_OPEN_OR_LABELLED.includes(action))
			.map((action) => ({ event, action }));
	});
}
