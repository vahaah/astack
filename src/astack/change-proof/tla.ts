import { err, ok, type Result } from "../result.ts";
import type { ModelContract, NegativeControl } from "./contract.ts";

export const STANDARD_MODULES = [
	"Naturals",
	"Integers",
	"Sequences",
	"FiniteSets",
	"Bags",
] as const;

const RESERVED_MODULES: ReadonlySet<string> = new Set([
	...STANDARD_MODULES,
	"AnySet",
	"BuiltInModuleHelper",
	"CSV",
	"IOUtils",
	"Json",
	"Randomization",
	"Strings",
	"TLC",
	"TLCExt",
	"TransitiveClosure",
]);

type Definition = { readonly start: number; readonly end: number };

type TlaModule = {
	readonly path: string;
	readonly name: string;
	readonly text: string;
	readonly blanked: string;
	readonly imports: readonly string[];
	readonly definitions: ReadonlyMap<string, Definition>;
};

export type TlcConfig = {
	readonly specification: string;
	readonly invariants: readonly string[];
	readonly properties: readonly string[];
};

export type ModelFile = { readonly fileName: string; readonly text: string };

export type ModelPlan = {
	readonly moduleFile: string;
	readonly configFile: string;
	readonly positive: readonly ModelFile[];
	readonly negative: readonly ModelFile[];
	readonly config: TlcConfig;
	readonly actions: ReadonlySet<string>;
};

const NAME = "[A-Za-z_][A-Za-z0-9_]*";

function blank(text: string): string {
	return text.replace(/[^\n]/g, " ");
}

export function blankComments(text: string): string {
	let out = "";
	let at = 0;
	while (at < text.length) {
		const char = text[at];
		if (char === '"') {
			const close = /"(?:[^"\\\n]|\\.)*"/y;
			close.lastIndex = at;
			const string = close.exec(text)?.[0] ?? char;
			out += string;
			at += string.length;
		} else if (text.startsWith("\\*", at)) {
			const newline = text.indexOf("\n", at);
			const end = newline < 0 ? text.length : newline;
			out += blank(text.slice(at, end));
			at = end;
		} else if (text.startsWith("(*", at)) {
			let depth = 0;
			let end = at;
			do {
				if (text.startsWith("(*", end)) {
					depth++;
					end += 2;
				} else if (text.startsWith("*)", end)) {
					depth--;
					end += 2;
				} else end++;
			} while (depth > 0 && end < text.length);
			out += blank(text.slice(at, end));
			at = end;
		} else {
			out += char;
			at++;
		}
	}
	return out;
}

function blankStrings(text: string): string {
	return text.replace(/"(?:[^"\\\n]|\\.)*"/g, (string) => blank(string));
}

function readModule(path: string, text: string): Result<TlaModule, string> {
	const blanked = blankComments(text);
	const header = new RegExp(
		`^-{4,}\\s*MODULE\\s+(${NAME})\\s*-{4,}[^\\n]*$`,
		"m",
	).exec(blanked);
	const name = header?.[1];
	if (header === null || name === undefined)
		return err(`${path} has no MODULE header`);
	const bodyStart = header.index + header[0].length;
	const footer = /^={4,}/m.exec(blanked.slice(bodyStart));
	if (footer === null) return err(`${path} has no closing ==== line`);
	const bodyEnd = bodyStart + footer.index;
	const body = blanked.slice(bodyStart, bodyEnd);
	if (/-{4,}\s*MODULE\b/.test(body))
		return err(`${path} holds a nested module`);
	if (`${name}.tla` !== path.slice(path.lastIndexOf("/") + 1))
		return err(
			`${path} declares module ${name}, so its file name must be ${name}.tla`,
		);
	const imports = [
		...[
			...body.matchAll(
				new RegExp(`\\bEXTENDS\\s+(${NAME}(?:\\s*,\\s*${NAME})*)`, "g"),
			),
		].flatMap((match) =>
			(match[1] ?? "").split(",").map((part) => part.trim()),
		),
		...[...body.matchAll(new RegExp(`\\bINSTANCE\\s+(${NAME})`, "g"))].map(
			(match) => match[1] ?? "",
		),
	];
	const definitions = new Map<string, Definition>();
	const starts = [...body.matchAll(/^\S/gm)].map(
		(match) => bodyStart + match.index,
	);
	for (const match of body.matchAll(
		new RegExp(`^(${NAME})\\s*(?:\\([^)]*\\)|\\[[^\\]]*\\])?\\s*==`, "gm"),
	)) {
		const start = bodyStart + match.index;
		const end = starts.find((at) => at > start) ?? bodyEnd;
		const defined = match[1] ?? "";
		if (definitions.has(defined))
			return err(`${path} defines ${defined} twice`);
		definitions.set(defined, { start, end });
	}
	return ok({ path, name, text, blanked, imports, definitions });
}

const UNSUPPORTED = new Set([
	"INIT",
	"NEXT",
	"CONSTRAINT",
	"CONSTRAINTS",
	"ACTION_CONSTRAINT",
	"ACTION_CONSTRAINTS",
	"SYMMETRY",
	"VIEW",
	"CHECK_DEADLOCK",
	"POSTCONDITION",
	"ALIAS",
	"TYPE",
	"TYPE_CONSTRAINT",
]);

const SECTIONS = new Set([
	"SPECIFICATION",
	"INVARIANT",
	"INVARIANTS",
	"PROPERTY",
	"PROPERTIES",
	"CONSTANT",
	"CONSTANTS",
]);

function tokens(text: string): Result<readonly string[], string> {
	const found: string[] = [];
	const token =
		/\s*(?:("(?:[^"\\\n]|\\.)*")|(<-)|([{},=])|(-?\d+)|([A-Za-z_][A-Za-z0-9_]*)|(\S))/y;
	const source = blankComments(text);
	while (token.lastIndex < source.length) {
		const at = token.lastIndex;
		const match = token.exec(source);
		if (match === null) break;
		if (match[0].trim() === "") continue;
		if (match[6] !== undefined)
			return err(
				`the config has the unexpected character ${JSON.stringify(match[6])} at offset ${at}`,
			);
		found.push(match[0].trim());
	}
	return ok(found);
}

function isLiteral(token: string): boolean {
	return /^(?:"(?:[^"\\\n]|\\.)*"|-?\d+|[A-Za-z_][A-Za-z0-9_]*)$/.test(token);
}

export function parseConfig(text: string): Result<TlcConfig, string> {
	const read = tokens(text);
	if (!read.ok) return read;
	const list = read.value;
	const specifications: string[] = [];
	const invariants: string[] = [];
	const properties: string[] = [];
	let section = "";
	for (let at = 0; at < list.length; at++) {
		const word = list[at] ?? "";
		if (word === "<-")
			return err(
				"the config uses <-, and the proof gate allows only literal constants",
			);
		if (UNSUPPORTED.has(word))
			return err(
				`the config uses ${word}, which the proof gate does not support`,
			);
		if (SECTIONS.has(word)) {
			section = word;
			continue;
		}
		if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(word) || section === "")
			return err(`the config has the unexpected token ${JSON.stringify(word)}`);
		if (section === "SPECIFICATION") specifications.push(word);
		else if (section.startsWith("INVARIANT")) invariants.push(word);
		else if (section.startsWith("PROPERT")) properties.push(word);
		else {
			const value = constantValue(list, at + 1);
			if (!value.ok) return err(`constant ${word}: ${value.error}`);
			at = value.value;
		}
	}
	if (specifications.length !== 1)
		return err(
			`the config needs exactly one SPECIFICATION, not ${specifications.length}`,
		);
	const all = [...invariants, ...properties];
	const twice = all.find((name, index) => all.indexOf(name) !== index);
	if (twice !== undefined) return err(`the config names ${twice} twice`);
	return ok({ specification: specifications[0] ?? "", invariants, properties });
}

function constantValue(
	list: readonly string[],
	from: number,
): Result<number, string> {
	if (list[from] !== "=") return err("must be NAME = literal");
	const first = list[from + 1] ?? "";
	if (first !== "{")
		return isLiteral(first)
			? ok(from + 1)
			: err(`${JSON.stringify(first)} is not a literal`);
	let at = from + 2;
	if (list[at] === "}") return ok(at);
	while (at < list.length) {
		if (!isLiteral(list[at] ?? ""))
			return err(
				`${JSON.stringify(list[at] ?? "")} is not a literal set member`,
			);
		const next = list[at + 1];
		if (next === "}") return ok(at + 1);
		if (next !== ",") return err("a set literal needs commas between members");
		at += 2;
	}
	return err("a set literal has no closing }");
}

export type ModelInputs = {
	readonly module: string;
	readonly config: string;
	readonly dependencies: ReadonlyMap<string, string>;
};

function sameSet(left: readonly string[], right: readonly string[]): boolean {
	return (
		left.length === right.length && left.every((name) => right.includes(name))
	);
}

function isAction(module: TlaModule, definition: Definition): boolean {
	const body = blankStrings(
		module.blanked.slice(definition.start, definition.end),
	);
	return /[A-Za-z0-9_)\]}>]'/.test(body) || /\bUNCHANGED\b/.test(body);
}

function fileName(path: string): string {
	return path.slice(path.lastIndexOf("/") + 1);
}

function closure(
	modules: ReadonlyMap<string, TlaModule>,
	root: TlaModule,
): Result<ReadonlySet<string>, string> {
	const seen = new Set<string>([root.name]);
	const queue = [root];
	for (
		let module = queue.shift();
		module !== undefined;
		module = queue.shift()
	) {
		for (const name of module.imports) {
			const local = modules.get(name);
			if (local !== undefined) {
				if (!seen.has(name)) {
					seen.add(name);
					queue.push(local);
				}
			} else if (!STANDARD_MODULES.some((standard) => standard === name))
				return err(
					`${module.path} imports ${name}, which is neither an allowed standard module (${STANDARD_MODULES.join(", ")}) nor a declared dependency`,
				);
		}
	}
	return ok(seen);
}

function mutate(
	module: TlaModule,
	negative: NegativeControl,
	config: TlcConfig,
): Result<string, string> {
	const { action, original, replacement } = negative;
	const definition = module.definitions.get(action);
	if (definition === undefined)
		return err(`${module.path} defines no action ${action}`);
	const spec = module.definitions.get(config.specification);
	const init =
		spec === undefined
			? undefined
			: new RegExp(`==\\s*(${NAME})`).exec(
					module.blanked.slice(spec.start, spec.end),
				)?.[1];
	if ([...config.invariants, ...config.properties].includes(action))
		return err(
			`the negative action ${action} is a configured invariant or property, not an action`,
		);
	if (action === config.specification || action === init)
		return err(
			`the negative action ${action} is the specification or its initial predicate, not an action`,
		);
	if (!isAction(module, definition))
		return err(
			`${action} in ${module.path} has no primed variable, so it is not an action`,
		);
	const span = module.blanked.slice(definition.start, definition.end);
	const offsets: number[] = [];
	for (
		let at = span.indexOf(original);
		at >= 0;
		at = span.indexOf(original, at + 1)
	)
		offsets.push(at);
	const [offset] = offsets;
	if (offsets.length !== 1 || offset === undefined)
		return err(
			`the negative original ${JSON.stringify(original)} occurs ${offsets.length} times in action ${action}, not once`,
		);
	const start = definition.start + offset;
	const text = `${module.text.slice(0, start)}${replacement}${module.text.slice(start + original.length)}`;
	const changed = readModule(module.path, text);
	if (!changed.ok)
		return err(
			`the negative replacement does not preserve the module: ${changed.error}`,
		);
	const changedAction = changed.value.definitions.get(action);
	if (changedAction === undefined || !isAction(changed.value, changedAction))
		return err(`the negative replacement does not preserve action ${action}`);
	const outside = (source: TlaModule, body: Definition): string =>
		`${source.blanked.slice(0, body.start)}\0${source.blanked.slice(body.end)}`;
	if (
		outside(module, definition) !== outside(changed.value, changedAction) ||
		!sameSet(module.imports, changed.value.imports)
	)
		return err(
			`the negative replacement changes code outside action ${action}`,
		);
	return ok(text);
}

export function planModel(
	model: ModelContract,
	negative: NegativeControl,
	inputs: ModelInputs,
): Result<ModelPlan, string> {
	const read = [
		readModule(model.module, inputs.module),
		...[...inputs.dependencies].map(([path, text]) => readModule(path, text)),
	];
	const modules = new Map<string, TlaModule>();
	for (const module of read) {
		if (!module.ok) return module;
		if (RESERVED_MODULES.has(module.value.name))
			return err(
				`${module.value.path} shadows the standard module ${module.value.name}`,
			);
		modules.set(module.value.name, module.value);
	}
	const root = read[0];
	if (root === undefined || !root.ok)
		return err(`${model.module} cannot be read`);
	const reached = closure(modules, root.value);
	if (!reached.ok) return reached;
	const unused = [...modules.values()].find(
		(module) => !reached.value.has(module.name),
	);
	if (unused !== undefined)
		return err(
			`the declared dependency ${unused.path} is not imported by the model`,
		);
	const config = parseConfig(inputs.config);
	if (!config.ok) return err(`${model.config}: ${config.error}`);
	const { specification, invariants, properties } = config.value;
	const defined = (name: string): boolean =>
		[...modules.values()].some((module) => module.definitions.has(name));
	const undefinedName = [specification, ...invariants, ...properties].find(
		(name) => !defined(name),
	);
	if (undefinedName !== undefined)
		return err(
			`${model.config} names ${undefinedName}, which no model module defines`,
		);
	if (!sameSet(invariants, model.invariants))
		return err(
			`model.invariants must equal the INVARIANT names of ${model.config}: ${invariants.join(", ") || "none"}`,
		);
	if (!sameSet(properties, model.properties))
		return err(
			`model.properties must equal the PROPERTY names of ${model.config}: ${properties.join(", ") || "none"}`,
		);
	const fair = [...modules.values()].some((module) =>
		/\b[WS]F_/.test(module.blanked),
	);
	if (fair !== model.fairness.length > 0)
		return err(
			fair
				? "the model uses WF_ or SF_, so model.fairness must state it"
				: "model.fairness states fairness, but the model uses no WF_ or SF_",
		);
	const target = [...modules.values()].find(
		(module) => module.path === negative.file,
	);
	if (target === undefined)
		return err(`negative.file ${negative.file} is not a model module`);
	const mutated = mutate(target, negative, config.value);
	if (!mutated.ok) return mutated;
	const positive: ModelFile[] = [
		...[...modules.values()].map((module) => ({
			fileName: fileName(module.path),
			text: module.text,
		})),
		{ fileName: fileName(model.config), text: inputs.config },
	];
	const actions = new Set(
		[...modules.values()].flatMap((module) =>
			[...module.definitions]
				.filter(([, definition]) => isAction(module, definition))
				.map(([name]) => name),
		),
	);
	return ok({
		moduleFile: fileName(model.module),
		configFile: fileName(model.config),
		positive,
		negative: positive.map((file) =>
			file.fileName === fileName(negative.file)
				? { fileName: file.fileName, text: mutated.value }
				: file,
		),
		config: config.value,
		actions,
	});
}
