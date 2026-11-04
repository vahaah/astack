import { err, ok, type Result } from "../result.ts";

export const STAGES = [
	"schema",
	"domain",
	"category",
	"controls",
	"model",
	"countermodel",
	"stale",
] as const;

export type Stage = (typeof STAGES)[number];

export type Rejection = { readonly stage: Stage; readonly message: string };

export function rejection(
	stage: Stage,
	message: string,
): Result<never, Rejection> {
	return err({ stage, message });
}

export const EFFECTS = [
	"fs-read",
	"fs-write",
	"spawn",
	"network",
	"clock",
	"env",
] as const;
export type Effect = (typeof EFFECTS)[number];

export const LAWS = [
	"id-left",
	"id-right",
	"assoc",
	"functor-id",
	"functor-comp",
	"monad-left",
	"monad-right",
	"monad-assoc",
] as const;
export type Law = (typeof LAWS)[number];

const CATEGORY_LAWS: readonly Law[] = ["id-left", "id-right", "assoc"];
const FUNCTOR_LAWS: readonly Law[] = ["functor-id", "functor-comp"];
const MONAD_LAWS: readonly Law[] = ["monad-left", "monad-right", "monad-assoc"];

export type FileLink = { readonly path: string; readonly symbol: string };

export type ScopeRow = {
	readonly path: string;
	readonly obligation: string;
	readonly modelRefs: readonly string[];
};

export type AdrRatification = {
	readonly kind: "integrated-proposal";
	readonly process: {
		readonly file: string;
		readonly decision: string;
	};
	readonly integratedAt: string;
	readonly proofRecord: string;
};

export type AdrReference = {
	readonly file: string;
	readonly decision: string;
	readonly ratification?: AdrRatification;
};

export type DomainContract = {
	readonly context: string;
	readonly glossary: string;
	readonly aggregate: FileLink;
	readonly terms: readonly string[];
	readonly invariants: readonly {
		readonly name: string;
		readonly modelRef: string;
	}[];
	readonly adrs: readonly AdrReference[];
	readonly controls: {
		readonly matrix: string;
		readonly criteria: readonly string[];
	};
};

export type Carrier =
	| { readonly kind: "pure" }
	| { readonly kind: "result"; readonly error: string }
	| {
			readonly kind: "promise-result";
			readonly error: string;
			readonly observation: string;
			readonly rejection: string;
	  }
	| { readonly kind: "artifact"; readonly contract: string };

export type Arrow = {
	readonly name: string;
	readonly from: string;
	readonly to: string;
	readonly link: FileLink;
	readonly effects: readonly Effect[];
};

export type CompositionOp = "o" | ">=>";

export type Witness =
	| { readonly kind: "model"; readonly name: string }
	| { readonly kind: "control"; readonly id: string };

export type LawEntry =
	| {
			readonly law: Law;
			readonly status: "witnessed";
			readonly witness: Witness;
	  }
	| {
			readonly law: Law;
			readonly status: "not_applicable";
			readonly reason: string;
	  };

export type CompositionRecord = {
	readonly carrier: Carrier;
	readonly objects: readonly {
		readonly name: string;
		readonly link: FileLink;
	}[];
	readonly arrows: readonly Arrow[];
	readonly composites: readonly {
		readonly arrows: readonly string[];
		readonly op: CompositionOp;
	}[];
	readonly equality: string;
	readonly laws: readonly LawEntry[];
	readonly typedWitness: string;
};

export type AbstractionRelation = {
	readonly hides: string;
	readonly callersKnow: readonly string[];
	readonly deletionTest: string;
	readonly alternatives: readonly {
		readonly name: string;
		readonly rejectedBecause: string;
	}[];
	readonly relation: readonly {
		readonly concrete: FileLink;
		readonly modelAction: string;
	}[];
	readonly omitted: readonly string[];
};

export type ModelContract = {
	readonly module: string;
	readonly config: string;
	readonly dependencies: readonly string[];
	readonly bounds: readonly string[];
	readonly fairness: readonly string[];
	readonly invariants: readonly string[];
	readonly properties: readonly string[];
};

export type Expectation = {
	readonly kind: "invariant" | "temporal";
	readonly name: string;
};

export type NegativeControl = {
	readonly file: string;
	readonly action: string;
	readonly original: string;
	readonly replacement: string;
	readonly defect: string;
	readonly expect: Expectation;
};

export type ChangeProof = {
	readonly version: 1;
	readonly change: string;
	readonly base: string;
	readonly scope: readonly ScopeRow[];
	readonly domain: DomainContract;
	readonly category: CompositionRecord;
	readonly abstraction: AbstractionRelation;
	readonly model: ModelContract;
	readonly negative: NegativeControl;
	readonly limits: readonly string[];
};

const FULL_SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const SYMBOL = /^[A-Za-z_$][\w$]*$/;
const TLA_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const CRITERION = /^[A-Za-z][A-Za-z0-9._-]*$/;
const DECISION = /^D[1-9]\d*$/;

type Raw = Readonly<Record<string, unknown>>;

function isRaw(value: unknown): value is Raw {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isRepoPath(path: string): boolean {
	return (
		!path.startsWith("/") &&
		!/^[A-Za-z]:/.test(path) &&
		!path.includes("\\") &&
		!path.includes("\0") &&
		path
			.split("/")
			.every(
				(part) =>
					part !== "" && part !== "." && part !== ".." && part !== ".git",
			)
	);
}

type Sink = { first: string | undefined };

type Fields = {
	at(key: string): string;
	fail(key: string, message: string): void;
	value(key: string): unknown;
	text(key: string, pattern?: RegExp, shape?: string): string;
	string(key: string): string;
	path(key: string, extension?: string): string;
	report(where: string, message: string): void;
	oneOf<T extends string>(key: string, values: readonly [T, ...T[]]): T;
	items<T>(
		key: string,
		min: number,
		read: (value: unknown, where: string) => T,
	): readonly T[];
	texts(
		key: string,
		min: number,
		pattern?: RegExp,
		shape?: string,
	): readonly string[];
	paths(key: string, min: number, extension: string): readonly string[];
	object<T>(
		key: string,
		keys: readonly string[],
		read: (fields: Fields) => T,
	): T;
	objects<T>(
		key: string,
		min: number,
		keys: readonly string[],
		read: (fields: Fields) => T,
	): readonly T[];
	child(value: unknown, where: string, keys: readonly string[]): Fields;
};

function openFields(
	sink: Sink,
	value: unknown,
	where: string,
	keys: readonly string[],
): Fields {
	let raw: Raw;
	if (!isRaw(value)) {
		sink.first ??= `${where} must be an object`;
		raw = {};
	} else {
		const extra = Object.keys(value).find((key) => !keys.includes(key));
		if (extra !== undefined)
			sink.first ??= `${where} has the unknown key ${JSON.stringify(extra)}`;
		raw = value;
	}
	const fields: Fields = {
		at(key: string): string {
			return where === "the proof" ? key : `${where}.${key}`;
		},

		fail(key: string, message: string): void {
			fields.report(fields.at(key), message);
		},

		value(key: string): unknown {
			return raw[key];
		},

		text(key: string, pattern?: RegExp, shape = "nonblank text"): string {
			const value = raw[key];
			if (
				typeof value !== "string" ||
				value.trim() === "" ||
				(pattern !== undefined && !pattern.test(value))
			) {
				fields.fail(key, `must be ${shape}`);
				return "";
			}
			return value;
		},

		string(key: string): string {
			const value = raw[key];
			if (typeof value === "string") return value;
			fields.fail(key, "must be a string");
			return "";
		},

		path(key: string, extension?: string): string {
			const value = fields.text(key);
			if (
				value !== "" &&
				(!isRepoPath(value) ||
					(extension !== undefined && !value.endsWith(extension)))
			)
				fields.fail(
					key,
					`must be a repository path${extension === undefined ? "" : ` ending in ${extension}`}, outside .git`,
				);
			return value;
		},

		report(where: string, message: string): void {
			sink.first ??= `${where} ${message}`;
		},

		oneOf<T extends string>(key: string, values: readonly [T, ...T[]]): T {
			const value = raw[key];
			const found = values.find((candidate) => candidate === value);
			if (found === undefined)
				fields.fail(key, `must be one of ${values.join(", ")}`);
			return found ?? values[0];
		},

		items<T>(
			key: string,
			min: number,
			read: (value: unknown, where: string) => T,
		): readonly T[] {
			const value = raw[key];
			if (!Array.isArray(value) || value.length < min) {
				fields.fail(
					key,
					min === 0
						? "must be an array"
						: `must be an array with at least ${min} ${min === 1 ? "entry" : "entries"}`,
				);
				return [];
			}
			return value.map((item, index) =>
				read(item, `${fields.at(key)}[${index}]`),
			);
		},

		texts(
			key: string,
			min: number,
			pattern?: RegExp,
			shape = "nonblank text",
		): readonly string[] {
			return fields.items(key, min, (item, where) => {
				if (
					typeof item !== "string" ||
					item.trim() === "" ||
					(pattern !== undefined && !pattern.test(item))
				) {
					fields.report(where, `must be ${shape}`);
					return "";
				}
				return item;
			});
		},

		paths(key: string, min: number, extension: string): readonly string[] {
			return fields.texts(key, min).map((path, index) => {
				if (path !== "" && (!isRepoPath(path) || !path.endsWith(extension)))
					fields.report(
						`${fields.at(key)}[${index}]`,
						`must be a repository path ending in ${extension}, outside .git`,
					);
				return path;
			});
		},

		object<T>(
			key: string,
			keys: readonly string[],
			read: (fields: Fields) => T,
		): T {
			return read(openFields(sink, raw[key], fields.at(key), keys));
		},

		objects<T>(
			key: string,
			min: number,
			keys: readonly string[],
			read: (fields: Fields) => T,
		): readonly T[] {
			return fields.items(key, min, (item, where) =>
				read(openFields(sink, item, where, keys)),
			);
		},

		child(value: unknown, where: string, keys: readonly string[]): Fields {
			return openFields(sink, value, where, keys);
		},
	};
	return fields;
}

const readLink = (fields: Fields): FileLink => ({
	path: fields.path("path"),
	symbol: fields.text("symbol", SYMBOL, "an identifier"),
});

function readCarrier(fields: Fields): Carrier {
	const raw = fields.value("carrier");
	const kind = isRaw(raw) ? raw.kind : undefined;
	const where = "category.carrier";
	switch (kind) {
		case "pure":
			fields.child(raw, where, ["kind"]);
			return { kind };
		case "result": {
			const carrier = fields.child(raw, where, ["kind", "error"]);
			return { kind, error: carrier.text("error") };
		}
		case "promise-result": {
			const carrier = fields.child(raw, where, [
				"kind",
				"error",
				"observation",
				"rejection",
			]);
			return {
				kind,
				error: carrier.text("error"),
				observation: carrier.text("observation"),
				rejection: carrier.text("rejection"),
			};
		}
		case "artifact": {
			const carrier = fields.child(raw, where, ["kind", "contract"]);
			return { kind, contract: carrier.text("contract") };
		}
		default:
			fields.fail(
				"carrier",
				'must be an object whose kind is "pure", "result", "promise-result" or "artifact"',
			);
			return { kind: "pure" };
	}
}

function readWitness(fields: Fields): Witness {
	const value = fields.text(
		"witness",
		/^(?:model:[A-Za-z_][A-Za-z0-9_]*|control:[A-Za-z][A-Za-z0-9._-]*)$/,
		"model:<name> or control:<ID>",
	);
	const [kind, name = ""] = value.split(/:(.*)/s);
	return kind === "control"
		? { kind: "control", id: name }
		: { kind: "model", name };
}

function readLaw(fields: Fields, value: unknown, where: string): LawEntry {
	const status = isRaw(value) ? value.status : undefined;
	if (status === "not_applicable") {
		const entry = fields.child(value, where, ["law", "status", "reason"]);
		return {
			law: entry.oneOf("law", LAWS),
			status,
			reason: entry.text("reason"),
		};
	}
	const entry = fields.child(value, where, ["law", "status", "witness"]);
	if (status !== "witnessed")
		entry.fail("status", 'must be "witnessed" or "not_applicable"');
	return {
		law: entry.oneOf("law", LAWS),
		status: "witnessed",
		witness: readWitness(entry),
	};
}

function readExpectation(fields: Fields): Expectation {
	return {
		kind: fields.oneOf("kind", ["invariant", "temporal"] as const),
		name: fields.text("name", TLA_NAME, "a TLA+ name"),
	};
}

function readProof(fields: Fields): ChangeProof {
	if (fields.value("version") !== 1) fields.fail("version", "must be 1");
	return {
		version: 1,
		change: fields.text("change"),
		base: fields.text("base", FULL_SHA, "a full lowercase commit SHA"),
		scope: fields.objects(
			"scope",
			1,
			["path", "obligation", "modelRefs"],
			(row) => ({
				path: row.path("path"),
				obligation: row.text("obligation", CRITERION, "a criterion ID"),
				modelRefs: row.texts("modelRefs", 1, TLA_NAME, "a TLA+ name"),
			}),
		),
		domain: fields.object(
			"domain",
			[
				"context",
				"glossary",
				"aggregate",
				"terms",
				"invariants",
				"adrs",
				"controls",
			],
			(domain) => ({
				context: domain.text("context"),
				glossary: domain.path("glossary"),
				aggregate: domain.object("aggregate", ["path", "symbol"], readLink),
				terms: domain.texts("terms", 1),
				invariants: domain.objects(
					"invariants",
					1,
					["name", "modelRef"],
					(row) => ({
						name: row.text("name"),
						modelRef: row.text("modelRef", TLA_NAME, "a TLA+ name"),
					}),
				),
				adrs: domain.objects(
					"adrs",
					1,
					["file", "decision", "ratification"],
					(row) => {
						const reference = {
							file: row.path("file"),
							decision: row.text(
								"decision",
								DECISION,
								"a decision ID such as D1",
							),
						};
						if (row.value("ratification") === undefined) return reference;
						return {
							...reference,
							ratification: row.object(
								"ratification",
								["kind", "process", "integratedAt", "proofRecord"],
								(value) => ({
									kind: value.oneOf("kind", ["integrated-proposal"]),
									process: value.object(
										"process",
										["file", "decision"],
										(process) => ({
											file: process.path("file"),
											decision: process.text(
												"decision",
												DECISION,
												"a decision ID such as D1",
											),
										}),
									),
									integratedAt: value.text(
										"integratedAt",
										FULL_SHA,
										"a full lowercase commit SHA",
									),
									proofRecord: value.path("proofRecord"),
								}),
							),
						};
					},
				),
				controls: domain.object(
					"controls",
					["matrix", "criteria"],
					(controls) => ({
						matrix: controls.path("matrix"),
						criteria: controls.texts(
							"criteria",
							1,
							CRITERION,
							"a criterion ID",
						),
					}),
				),
			}),
		),
		category: fields.object(
			"category",
			[
				"carrier",
				"objects",
				"arrows",
				"composites",
				"equality",
				"laws",
				"typedWitness",
			],
			(category) => ({
				carrier: readCarrier(category),
				objects: category.objects("objects", 1, ["name", "link"], (row) => ({
					name: row.text("name"),
					link: row.object("link", ["path", "symbol"], readLink),
				})),
				arrows: category.objects(
					"arrows",
					1,
					["name", "from", "to", "link", "effects"],
					(row) => ({
						name: row.text("name"),
						from: row.text("from"),
						to: row.text("to"),
						link: row.object("link", ["path", "symbol"], readLink),
						effects: row.items("effects", 0, (value, where) => {
							const found = EFFECTS.find((effect) => effect === value);
							if (found === undefined)
								row.report(where, `must be one of ${EFFECTS.join(", ")}`);
							return found ?? "env";
						}),
					}),
				),
				composites: category.objects(
					"composites",
					0,
					["arrows", "op"],
					(row) => ({
						arrows: row.texts("arrows", 2),
						op: row.oneOf("op", ["o", ">=>"] as const),
					}),
				),
				equality: category.text("equality"),
				laws: category.items("laws", 1, (value, where) =>
					readLaw(category, value, where),
				),
				typedWitness: category.path("typedWitness"),
			}),
		),
		abstraction: fields.object(
			"abstraction",
			[
				"hides",
				"callersKnow",
				"deletionTest",
				"alternatives",
				"relation",
				"omitted",
			],
			(abstraction) => ({
				hides: abstraction.text("hides"),
				callersKnow: abstraction.texts("callersKnow", 1),
				deletionTest: abstraction.text("deletionTest"),
				alternatives: abstraction.objects(
					"alternatives",
					1,
					["name", "rejectedBecause"],
					(row) => ({
						name: row.text("name"),
						rejectedBecause: row.text("rejectedBecause"),
					}),
				),
				relation: abstraction.objects(
					"relation",
					1,
					["concrete", "modelAction"],
					(row) => ({
						concrete: row.object("concrete", ["path", "symbol"], readLink),
						modelAction: row.text("modelAction", TLA_NAME, "a TLA+ name"),
					}),
				),
				omitted: abstraction.texts("omitted", 0),
			}),
		),
		model: fields.object(
			"model",
			[
				"module",
				"config",
				"dependencies",
				"bounds",
				"fairness",
				"invariants",
				"properties",
			],
			(model) => ({
				module: model.path("module", ".tla"),
				config: model.path("config", ".cfg"),
				dependencies: model.paths("dependencies", 0, ".tla"),
				bounds: model.texts("bounds", 1),
				fairness: model.texts("fairness", 0),
				invariants: model.texts("invariants", 1, TLA_NAME, "a TLA+ name"),
				properties: model.texts("properties", 0, TLA_NAME, "a TLA+ name"),
			}),
		),
		negative: fields.object(
			"negative",
			["file", "action", "original", "replacement", "defect", "expect"],
			(negative) => ({
				file: negative.path("file", ".tla"),
				action: negative.text("action", TLA_NAME, "a TLA+ name"),
				original: negative.text("original"),
				replacement: negative.string("replacement"),
				defect: negative.text("defect"),
				expect: negative.object("expect", ["kind", "name"], readExpectation),
			}),
		),
		limits: fields.texts("limits", 1),
	};
}

function duplicate(values: readonly string[]): string | undefined {
	return values.find((value, index) => values.indexOf(value) !== index);
}

function firstOf(
	checks: readonly (() => string | undefined)[],
): string | undefined {
	for (const check of checks) {
		const found = check();
		if (found !== undefined) return found;
	}
	return undefined;
}

function repeated(
	what: string,
	values: readonly string[],
): () => string | undefined {
	return () => {
		const found = duplicate(values);
		return found === undefined
			? undefined
			: `${what} holds ${JSON.stringify(found)} twice`;
	};
}

function domainProblem(proof: ChangeProof): string | undefined {
	const { domain, model } = proof;
	const checked = [...model.invariants, ...model.properties];
	return firstOf([
		repeated("domain.terms", domain.terms),
		repeated(
			"domain.invariants",
			domain.invariants.map((row) => row.name),
		),
		repeated(
			"domain.adrs",
			domain.adrs.map((row) => `${row.file} ${row.decision}`),
		),
		repeated("domain.controls.criteria", domain.controls.criteria),
		() =>
			domain.invariants
				.filter((row) => !checked.includes(row.modelRef))
				.map(
					(row) =>
						`domain invariant "${row.name}" names ${row.modelRef}, which the model does not check`,
				)[0],
	]);
}

function lawProblem(record: CompositionRecord): string | undefined {
	const entry = (law: Law): LawEntry | undefined =>
		record.laws.find((row) => row.law === law);
	const witnessed = (law: Law): boolean => entry(law)?.status === "witnessed";
	const missing = LAWS.find((law) => entry(law) === undefined);
	if (missing !== undefined) return `category.laws has no entry for ${missing}`;
	const { kind } = record.carrier;
	const monadic = kind === "result" || kind === "promise-result";
	return firstOf([
		repeated(
			"category.laws",
			record.laws.map((row) => row.law),
		),
		() =>
			record.composites.length > 0
				? CATEGORY_LAWS.filter((law) => !witnessed(law)).map(
						(law) =>
							`category law ${law} applies to the declared composites, so it needs a witness`,
					)[0]
				: undefined,
		() =>
			monadic
				? MONAD_LAWS.filter((law) => !witnessed(law)).map(
						(law) => `carrier ${kind} needs a witness for ${law}`,
					)[0]
				: MONAD_LAWS.filter(witnessed).map(
						(law) => `carrier ${kind} cannot claim ${law}`,
					)[0],
		() =>
			FUNCTOR_LAWS.some(witnessed) && !FUNCTOR_LAWS.every(witnessed)
				? "a functor claim needs witnesses for both functor-id and functor-comp"
				: undefined,
	]);
}

function arrowProblem(record: CompositionRecord): string | undefined {
	const objects = record.objects.map((object) => object.name);
	const arrows = new Map(record.arrows.map((arrow) => [arrow.name, arrow]));
	const monadic =
		record.carrier.kind === "result" ||
		record.carrier.kind === "promise-result";
	return firstOf([
		repeated("category.objects", objects),
		repeated(
			"category.arrows",
			record.arrows.map((arrow) => arrow.name),
		),
		() =>
			record.arrows
				.flatMap((arrow) =>
					[arrow.from, arrow.to]
						.filter((end) => !objects.includes(end))
						.map(
							(end) => `arrow ${arrow.name} names the unknown object ${end}`,
						),
				)
				.at(0),
		() =>
			record.arrows
				.flatMap((arrow) => {
					const twice = duplicate(arrow.effects);
					if (twice !== undefined)
						return [`arrow ${arrow.name} lists the effect ${twice} twice`];
					return record.carrier.kind === "pure" && arrow.effects.length > 0
						? [`arrow ${arrow.name} declares effects, but the carrier is pure`]
						: [];
				})
				.at(0),
		() => {
			for (const composite of record.composites) {
				const expected: CompositionOp = monadic ? ">=>" : "o";
				if (composite.op !== expected)
					return `composite ${composite.arrows.join(` ${composite.op} `)} uses ${composite.op}, but carrier ${record.carrier.kind} composes with ${expected}`;
				const unknown = composite.arrows.find((name) => !arrows.has(name));
				if (unknown !== undefined)
					return `a composite names the unknown arrow ${unknown}`;
				const order =
					composite.op === "o"
						? [...composite.arrows].reverse()
						: composite.arrows;
				for (let at = 1; at < order.length; at++) {
					const first = arrows.get(order[at - 1] ?? "");
					const then = arrows.get(order[at] ?? "");
					if (
						first !== undefined &&
						then !== undefined &&
						first.to !== then.from
					)
						return `arrows ${first.name} and ${then.name} do not compose: ${first.name} ends at ${first.to}, ${then.name} starts at ${then.from}`;
				}
			}
			return undefined;
		},
	]);
}

function modelProblem(proof: ChangeProof): string | undefined {
	const { model, negative } = proof;
	const files = [model.module, ...model.dependencies];
	const names = [model.config, ...files].map((path) =>
		path.slice(path.lastIndexOf("/") + 1),
	);
	return firstOf([
		repeated("model.dependencies", model.dependencies),
		repeated("the model file names", names),
		repeated("model.invariants and model.properties", [
			...model.invariants,
			...model.properties,
		]),
		() =>
			files.includes(negative.file)
				? undefined
				: `negative.file ${negative.file} is not the model module or a declared dependency`,
		() =>
			(negative.expect.kind === "invariant"
				? model.invariants
				: model.properties
			).includes(negative.expect.name)
				? undefined
				: `negative.expect names ${negative.expect.name}, which is not a configured ${negative.expect.kind === "invariant" ? "invariant" : "property"}`,
		() =>
			negative.expect.kind === "temporal" && model.properties.length !== 1
				? `a temporal negative needs exactly one configured property, not ${model.properties.length}`
				: undefined,
		() =>
			negative.original === negative.replacement
				? "negative.replacement must differ from negative.original"
				: undefined,
	]);
}

function scopeProblem(proof: ChangeProof): string | undefined {
	return firstOf([
		repeated(
			"scope paths",
			proof.scope.map((row) => row.path),
		),
		() =>
			proof.scope
				.filter(
					(row) => !proof.domain.controls.criteria.includes(row.obligation),
				)
				.map(
					(row) =>
						`scope row ${row.path} names obligation ${row.obligation}, which domain.controls.criteria does not list`,
				)[0],
	]);
}

export function parseChangeProof(text: string): Result<ChangeProof, Rejection> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return rejection("schema", "the proof is not valid JSON");
	}
	const sink: Sink = { first: undefined };
	const proof = readProof(
		openFields(sink, parsed, "the proof", [
			"version",
			"change",
			"base",
			"scope",
			"domain",
			"category",
			"abstraction",
			"model",
			"negative",
			"limits",
		]),
	);
	if (sink.first !== undefined) return rejection("schema", sink.first);
	const checks: readonly [Stage, string | undefined][] = [
		["domain", domainProblem(proof)],
		["category", arrowProblem(proof.category) ?? lawProblem(proof.category)],
		["controls", scopeProblem(proof)],
		["model", modelProblem(proof)],
	];
	for (const [stage, problem] of checks)
		if (problem !== undefined) return rejection(stage, problem);
	return ok(proof);
}
