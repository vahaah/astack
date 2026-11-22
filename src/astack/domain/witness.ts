import {
	type CapRef,
	type DomainBlock,
	firstInput,
	type StepLine,
	type StepOut,
	type TypeExpr,
	typeText,
} from "./notation.ts";
import type { Carrier } from "./profile.ts";

export type Reading = Carrier;

export type StepLink = { readonly module: string; readonly name: string };

export type ModuleExports = {
	readonly names: ReadonlySet<string>;
	readonly generic: ReadonlySet<string>;
	readonly overloaded: ReadonlySet<string>;
};

export type StepLinks = {
	readonly root: string;
	readonly steps: ReadonlyMap<string, StepLink>;
	readonly exports: ReadonlyMap<string, ModuleExports>;
	readonly ports: ReadonlyMap<string, string>;
};

export type WitnessLine = { readonly line: number; readonly what: string };

export type WitnessSource = {
	readonly root: string;
	readonly modules: readonly string[];
	readonly text: string;
	readonly lines: ReadonlyMap<number, WitnessLine>;
};

const PRIMITIVES = new Set(["string", "number", "boolean", "unknown", "void"]);

const EXPORT =
	/^export\s+(?:declare\s+)?(?:default\s+)?(?:abstract\s+)?(?:async\s+)?(function\*?|const|let|var|class|type|interface|enum|namespace)\s+([A-Za-z_$][\w$]*)(\s*<)?/gm;
const EXPORT_LIST = /^export\s+(?:type\s+)?\{([^}]*)\}/gm;

export function scanExports(text: string): ModuleExports {
	const names = new Set<string>();
	const generic = new Set<string>();
	const functions = new Map<string, number>();
	for (const match of text.matchAll(EXPORT)) {
		const [, kind = "", name = "", angle] = match;
		names.add(name);
		if (!kind.startsWith("function")) continue;
		functions.set(name, (functions.get(name) ?? 0) + 1);
		if (angle !== undefined) generic.add(name);
	}
	for (const match of text.matchAll(EXPORT_LIST))
		for (const part of (match[1] ?? "").split(",")) {
			const name = part
				.trim()
				.split(/\s+as\s+/)
				.at(-1)
				?.replace(/^type\s+/, "");
			if (name) names.add(name);
		}
	return {
		names,
		generic,
		overloaded: new Set(
			[...functions].filter(([, count]) => count > 1).map(([name]) => name),
		),
	};
}

const HEADER = [
	"type Equals<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;",
	"type Plain<T> = [T] extends [readonly unknown[]] ? { -readonly [K in keyof T]: Plain<T[K]> } : T;",
	"type Same<A, D> = Equals<Plain<A>, Plain<D>> extends true ? true : { readonly linked: A; readonly declared: D };",
	"type Fits<A, D> = [A] extends [D] ? true : { readonly gives: A; readonly takes: D };",
	"type Expect<T extends true> = T;",
	"type OkOf<R> = R extends { readonly ok: true; readonly value: infer V } ? V : never;",
	"type ErrOf<R> = R extends { readonly ok: false; readonly error: infer E } ? E : never;",
	"type Result$<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };",
];

const EFFECT = 'import("effect").Effect.Effect';

function from(module: string): string {
	return `import(${JSON.stringify(`../../../../${module}`)})`;
}

type Writer = {
	readonly lines: string[];
	readonly map: Map<number, WitnessLine>;
	check(line: number, what: string, body: string): void;
};

function writer(): Writer {
	const lines = [...HEADER];
	const map = new Map<number, WitnessLine>();
	return {
		lines,
		map,
		check(line, what, body) {
			lines.push(`export type W${lines.length + 1} = Expect<${body}>;`);
			map.set(lines.length, { line, what });
		},
	};
}

export function witnessSource(
	block: DomainBlock,
	links: StepLinks,
	reading: Reading,
): WitnessSource {
	const order = [
		...new Set([
			...block.aggs.map((agg) => agg.module),
			...block.steps.flatMap((step) => {
				const link = links.steps.get(step.name);
				return link === undefined ? [] : [link.module];
			}),
		]),
	];
	const named = (name: string): string => {
		if (PRIMITIVES.has(name)) return name;
		const module = order.find((path) =>
			links.exports.get(path)?.names.has(name),
		);
		if (module !== undefined) return `${from(module)}.${name}`;
		return name === "Result" ? "Result$" : name;
	};
	const type = (expr: TypeExpr): string => {
		switch (expr.kind) {
			case "void":
				return "void";
			case "name":
				return named(expr.name);
			case "array":
				return `readonly ${named(expr.item)}[]`;
			case "tuple":
				return `readonly [${expr.items.map(type).join(", ")}]`;
			default: {
				const unreachable: never = expr;
				return unreachable;
			}
		}
	};
	const union = (names: readonly string[], each: (name: string) => string) =>
		names.length === 0 ? "never" : names.map(each).join(" | ");
	const tags = (row: readonly CapRef[]): string =>
		union([...new Set(row.map((ref) => ref.cap))], (cap) => {
			const port = links.ports.get(cap);
			return port === undefined ? cap : `${from(port)}.${cap}`;
		});
	const out = writer();
	const fn = (link: StepLink): string =>
		`typeof ${from(link.module)}.${link.name}`;
	const outputCheck = (step: StepLine, link: StepLink): string => {
		const returned = `ReturnType<${fn(link)}>`;
		const result: StepOut = step.output;
		if (result.kind === "pure")
			return `Same<${returned}, ${type(result.type)}>`;
		const value = type(result.value);
		const errors = union(result.errs, named);
		if (reading === "effect")
			return `Same<{ readonly success: Plain<${EFFECT}.Success<${returned}>>; readonly error: ${EFFECT}.Error<${returned}>; readonly context: ${EFFECT}.Context<${returned}> }, { readonly success: Plain<${value}>; readonly error: ${errors}; readonly context: ${tags(result.row)} }>`;
		const awaited = `Awaited<${returned}>`;
		return `Same<{ readonly shape: Equals<${awaited}, ${named("Result")}<OkOf<${awaited}>, ErrOf<${awaited}>>>; readonly value: Plain<OkOf<${awaited}>>; readonly error: ErrOf<${awaited}> }, { readonly shape: true; readonly value: Plain<${value}>; readonly error: ${errors} }>`;
	};
	const linked = new Map<string, StepLink>();
	for (const agg of block.aggs) {
		const state = `${from(agg.module)}.${agg.state}`;
		out.check(agg.line, `agg ${agg.name} State`, `Same<${state}, ${state}>`);
		if (agg.command === undefined) continue;
		const decide = `typeof ${from(agg.module)}.decide`;
		const fold = `typeof ${from(agg.module)}.fold`;
		const cmd = `${from(agg.module)}.${agg.command.cmd}`;
		const event = `${from(agg.module)}.${agg.command.event}`;
		out.check(
			agg.line,
			`agg ${agg.name} decide`,
			`Same<[Parameters<${decide}>[0], Parameters<${decide}>[1]], [${state}, ${cmd}]>`,
		);
		out.check(
			agg.line,
			`agg ${agg.name} fold`,
			`Same<[Parameters<${fold}>[0], Parameters<${fold}>[1], ReturnType<${fold}>], [${state}, ${event}, ${state}]>`,
		);
	}
	for (const step of block.steps) {
		const link = links.steps.get(step.name);
		const label = `step ${step.name}`;
		if (link === undefined) {
			out.check(
				step.line,
				label,
				`"link one Files cell <module>#${step.name} to the step ${step.name}"`,
			);
			continue;
		}
		const scan = links.exports.get(link.module);
		if (scan?.generic.has(link.name) || scan?.overloaded.has(link.name)) {
			out.check(
				step.line,
				label,
				`"${link.module}#${link.name} is generic or overloaded; link a concrete export"`,
			);
			continue;
		}
		linked.set(step.name, link);
		const params = `Parameters<${fn(link)}>`;
		const inputs =
			step.input.kind === "void"
				? []
				: step.input.kind === "tuple"
					? step.input.items
					: [step.input];
		inputs.forEach((input, index) => {
			out.check(
				step.line,
				`${label} parameter ${index + 1}`,
				`Same<${params}[${index}], ${type(input)}>`,
			);
		});
		out.check(step.line, `${label} output`, outputCheck(step, link));
	}
	const unwrap = (step: StepLine, link: StepLink): string => {
		const returned = `ReturnType<${fn(link)}>`;
		if (step.output.kind === "pure") return returned;
		return reading === "effect"
			? `${EFFECT}.Success<${returned}>`
			: `OkOf<Awaited<${returned}>>`;
	};
	const byName = new Map(block.steps.map((step) => [step.name, step]));
	for (const flow of block.flows)
		flow.steps.forEach((name, index) => {
			const next = flow.steps[index + 1];
			const step = byName.get(name);
			const then = next === undefined ? undefined : byName.get(next);
			const link = linked.get(name);
			const thenLink = next === undefined ? undefined : linked.get(next);
			if (
				step === undefined ||
				then === undefined ||
				link === undefined ||
				thenLink === undefined ||
				firstInput(then.input).kind === "void"
			)
				return;
			out.check(
				flow.line,
				`flow ${flow.name} ${name} >=> ${then.name} (${typeText(firstInput(then.input))})`,
				`Fits<${unwrap(step, link)}, Parameters<${fn(thenLink)}>[0]>`,
			);
		});
	return {
		root: links.root,
		modules: [
			...new Set([
				...order,
				...(reading === "effect" ? [...links.ports.values()] : []),
			]),
		],
		text: `${out.lines.join("\n")}\n`,
		lines: out.map,
	};
}
