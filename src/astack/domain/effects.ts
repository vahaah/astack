import { EFFECTS, type Effect } from "../change-proof/contract.ts";
import { anyGlob } from "../glob.ts";
import type { ModuleFacts } from "./imports.ts";
import type {
	CapLine,
	CapRef,
	ContextLine,
	DomainBlock,
	StepLine,
} from "./notation.ts";
import type { ContextsCard, FilesCell } from "./rules.ts";

export type EffectFinding = {
	readonly kind: "advice" | "report";
	readonly path: string;
	readonly line: number;
	readonly rule: string;
	readonly message: string;
};

export type EffectInputs = {
	readonly card: ContextsCard;
	readonly block: DomainBlock | undefined;
	readonly cells: readonly FilesCell[];
};

export type ClassSource = { readonly line: number; readonly via: string };

export type ModuleClasses = ReadonlyMap<
	string,
	ReadonlyMap<Effect, ClassSource>
>;

export type Resolved =
	| { readonly kind: "module"; readonly path: string }
	| { readonly kind: "none" }
	| { readonly kind: "unresolved"; readonly message: string };

const ALIAS = /^(?:@\/|~\/|#)/;

function normalize(path: string): string | undefined {
	const parts: string[] = [];
	for (const part of path.split("/")) {
		if (part === "" || part === ".") continue;
		if (part !== "..") parts.push(part);
		else if (parts.pop() === undefined) return undefined;
	}
	return parts.join("/");
}

function folderOf(path: string): string {
	const at = path.lastIndexOf("/");
	return at < 0 ? "" : path.slice(0, at);
}

export function resolveImport(
	from: string,
	specifier: string,
	modules: ReadonlySet<string>,
): Resolved {
	if (ALIAS.test(specifier))
		return {
			kind: "unresolved",
			message: `the alias import ${specifier} names no module that the check can read`,
		};
	if (!specifier.startsWith("./") && !specifier.startsWith("../"))
		return { kind: "none" };
	if (specifier.endsWith(".json")) return { kind: "none" };
	const target = normalize(`${folderOf(from)}/${specifier}`);
	const stem = target?.replace(/\.js$/, "");
	const candidates =
		target === undefined || stem === undefined
			? []
			: [
					target,
					...(target.endsWith(".js") ? [`${stem}.ts`, `${stem}.tsx`] : []),
					`${target}.ts`,
					`${target}.tsx`,
					`${target}/index.ts`,
				];
	const path = candidates.find((candidate) => modules.has(candidate));
	return path === undefined
		? {
				kind: "unresolved",
				message: `the import ${specifier} names no tracked module under the code roots`,
			}
		: { kind: "module", path };
}

export function classesThroughImports(
	facts: readonly ModuleFacts[],
): ModuleClasses {
	const modules = new Set(facts.map((one) => one.path));
	const classes = new Map<string, Map<Effect, ClassSource>>();
	const edges = new Map<string, { line: number; path: string }[]>();
	for (const module of facts) {
		const own = new Map<Effect, ClassSource>();
		for (const use of module.uses)
			if (!own.has(use.effect))
				own.set(use.effect, { line: use.line, via: use.via });
		classes.set(module.path, own);
		edges.set(
			module.path,
			module.imports.flatMap((value) => {
				const found = resolveImport(module.path, value.specifier, modules);
				return found.kind === "module"
					? [{ line: value.line, path: found.path }]
					: [];
			}),
		);
	}
	let changed = true;
	while (changed) {
		changed = false;
		for (const [path, imports] of edges) {
			const mine = classes.get(path);
			if (mine === undefined) continue;
			for (const target of imports)
				for (const effect of classes.get(target.path)?.keys() ?? [])
					if (!mine.has(effect)) {
						mine.set(effect, { line: target.line, via: target.path });
						changed = true;
					}
		}
	}
	return classes;
}

function sorted(classes: Iterable<Effect>): readonly Effect[] {
	const found = new Set(classes);
	return EFFECTS.filter((effect) => found.has(effect));
}

export function classText(classes: Iterable<Effect>): string {
	const list = sorted(classes);
	return list.length === 0 ? "none" : list.join(", ");
}

function extra(
	path: string,
	classes: ModuleClasses,
	allowed: ReadonlySet<Effect>,
): readonly (readonly [Effect, ClassSource])[] {
	return [...(classes.get(path) ?? new Map<Effect, ClassSource>())].filter(
		([effect]) => !allowed.has(effect),
	);
}

function firstLine(found: readonly (readonly [Effect, ClassSource])[]): number {
	return Math.min(...found.map(([, source]) => source.line));
}

function viaText(found: readonly (readonly [Effect, ClassSource])[]): string {
	return found
		.map(([effect, source]) => `${effect} by ${source.via}`)
		.join(", ");
}

function pureFindings(
	facts: readonly ModuleFacts[],
	classes: ModuleClasses,
	card: ContextsCard,
): EffectFinding[] {
	const globs = card.pures.map((pure) => pure.glob);
	return facts.flatMap((module): EffectFinding[] => {
		if (!anyGlob(globs, module.path)) return [];
		const found = extra(module.path, classes, new Set());
		const advice = (line: number, message: string): EffectFinding => ({
			kind: "advice",
			path: module.path,
			line,
			rule: "pure",
			message,
		});
		return [
			...(found.length === 0
				? []
				: [
						advice(
							firstLine(found),
							`a pure line of ${card.path} names this module, but it has ${classText(found.map(([effect]) => effect))} (${viaText(found)})`,
						),
					]),
			...module.throws.map((line) =>
				advice(line, "a pure module throws; return the failure as a Result"),
			),
			...module.casts.map((line) =>
				advice(line, "a pure module casts a type; parse or narrow the value"),
			),
		];
	});
}

function capFindings(
	facts: readonly ModuleFacts[],
	classes: ModuleClasses,
	caps: readonly CapLine[],
): EffectFinding[] {
	const ports = [...new Set(caps.map((cap) => cap.port))];
	return ports.flatMap((port): EffectFinding[] => {
		const own = caps.filter((cap) => cap.port === port);
		const names = own.map((cap) => cap.name).join(", ");
		const module = facts.find((one) => one.path === port);
		if (module === undefined)
			return [
				{
					kind: "advice",
					path: port,
					line: 1,
					rule: "cap",
					message: `the port of cap ${names} is no module under the code roots`,
				},
			];
		const allowed = new Set(own.flatMap((cap) => cap.classes));
		const found = extra(port, classes, allowed);
		const missing = own.flatMap((cap) =>
			cap.ops
				.filter((op) => !module.exports.includes(op.name))
				.map((op) => `${cap.name}.${op.name}`),
		);
		return [
			...(found.length === 0
				? []
				: [
						{
							kind: "advice" as const,
							path: port,
							line: firstLine(found),
							rule: "cap",
							message: `cap ${names} allows ${classText(allowed)}, but its port also has ${classText(found.map(([effect]) => effect))} (${viaText(found)})`,
						},
					]),
			...missing.map(
				(op): EffectFinding => ({
					kind: "advice",
					path: port,
					line: 1,
					rule: "cap",
					message: `the port exports no ${op.split(".")[1] ?? op}, which ${op} names`,
				}),
			),
		];
	});
}

function rowClasses(
	row: readonly CapRef[],
	caps: readonly CapLine[],
): ReadonlySet<Effect> {
	return new Set(
		row.flatMap(
			(ref) => caps.find((cap) => cap.name === ref.cap)?.classes ?? [],
		),
	);
}

function stepModule(
	step: StepLine,
	cells: readonly FilesCell[],
): string | undefined {
	const modules = new Set(
		cells.flatMap(({ cell }) => {
			const [module = "", name] = cell.split("#");
			return name === step.name ? [module] : [];
		}),
	);
	return modules.size === 1 ? [...modules][0] : undefined;
}

function stepFindings(
	inputs: EffectInputs,
	classes: ModuleClasses,
): EffectFinding[] {
	const { block, card, cells } = inputs;
	if (block === undefined) return [];
	const caps = [...card.caps, ...block.caps];
	return block.steps.flatMap((step): EffectFinding[] => {
		const module = stepModule(step, cells);
		if (module === undefined || !classes.has(module)) return [];
		const row = step.output.kind === "eff" ? step.output.row : [];
		const allowed = rowClasses(row, caps);
		const found = extra(module, classes, allowed);
		return found.length === 0
			? []
			: [
					{
						kind: "advice",
						path: module,
						line: firstLine(found),
						rule: "step",
						message: `step ${step.name} allows ${classText(allowed)} by its row, but its module has ${classText(found.map(([effect]) => effect))} (${viaText(found)})`,
					},
				];
	});
}

function contextOf(
	path: string,
	contexts: readonly ContextLine[],
): ContextLine | undefined {
	return contexts.find((context) => anyGlob(context.globs, path));
}

function totalityFindings(
	facts: readonly ModuleFacts[],
	inputs: EffectInputs,
): EffectFinding[] {
	const { contexts } = inputs.card;
	const mapped = new Set(
		(inputs.block?.maps ?? []).map((map) => `${map.from}=>${map.to}`),
	);
	const modules = new Set(facts.map((one) => one.path));
	return facts.flatMap((module): EffectFinding[] => {
		const home = contextOf(module.path, contexts);
		if (home === undefined)
			return [
				{
					kind: "report",
					path: module.path,
					line: 1,
					rule: "unowned",
					message: `no context glob of ${inputs.card.path} names this module`,
				},
			];
		return module.imports.flatMap((value): EffectFinding[] => {
			const found = resolveImport(module.path, value.specifier, modules);
			if (found.kind === "unresolved")
				return [
					{
						kind: "report",
						path: module.path,
						line: value.line,
						rule: "import",
						message: `${found.message}, so it gives no class`,
					},
				];
			if (found.kind === "none") return [];
			const other = contextOf(found.path, contexts);
			if (
				other === undefined ||
				other.name === home.name ||
				other.shared ||
				mapped.has(`${home.name}=>${other.name}`)
			)
				return [];
			return [
				{
					kind: "report",
					path: module.path,
					line: value.line,
					rule: "context",
					message: `${home.name} imports ${found.path} of ${other.name}, and no map line names ${home.name} => ${other.name}`,
				},
			];
		});
	});
}

function unknownFindings(facts: readonly ModuleFacts[]): EffectFinding[] {
	return facts.flatMap((module) =>
		module.unknown.map(
			(found): EffectFinding => ({
				kind: "advice",
				path: module.path,
				line: found.line,
				rule: "import",
				message: `a ${found.form} call with no literal path has classes that the check cannot read`,
			}),
		),
	);
}

export function compareFindings(a: EffectFinding, b: EffectFinding): number {
	if (a.kind !== b.kind) return a.kind === "advice" ? -1 : 1;
	if (a.path !== b.path) return a.path < b.path ? -1 : 1;
	return a.line - b.line;
}

export function effectFindings(
	facts: readonly ModuleFacts[],
	inputs: EffectInputs,
): readonly EffectFinding[] {
	const classes = classesThroughImports(facts);
	return [
		...pureFindings(facts, classes, inputs.card),
		...capFindings(facts, classes, [
			...inputs.card.caps,
			...(inputs.block?.caps ?? []),
		]),
		...stepFindings(inputs, classes),
		...unknownFindings(facts),
		...totalityFindings(facts, inputs),
	].sort(compareFindings);
}
