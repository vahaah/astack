export type ProfileIssue = { path: string; message: string };

export type ProfileBlock = { language: "yaml" | "json"; source: string };

export type ParsedProfile = { data: unknown; issues: ProfileIssue[] };

type Check = {
	(value: unknown, path: string, issues: ProfileIssue[]): void;
	readonly keys?: readonly string[];
};

const FENCE = /^(`{3,}|~{3,})\s*([\w-]*)/;

export function extractProfileBlock(markdown: string): ProfileBlock | null {
	const lines = markdown.split("\n");
	let index = 0;
	while (index < lines.length) {
		const open = FENCE.exec(lines[index] ?? "");
		index += 1;
		if (!open) continue;
		const marker = open[1] ?? "```";
		const info = (open[2] ?? "").toLowerCase();
		const body: string[] = [];
		while (index < lines.length) {
			const line = lines[index] ?? "";
			index += 1;
			if (isClosingFence(line, marker)) break;
			body.push(line);
		}
		if (info === "yaml" || info === "yml")
			return { language: "yaml", source: body.join("\n") };
		if (info === "json") return { language: "json", source: body.join("\n") };
	}
	return null;
}

function isClosingFence(line: string, marker: string): boolean {
	const trimmed = line.trimEnd();
	const char = marker[0] ?? "`";
	return (
		trimmed.length >= marker.length && [...trimmed].every((c) => c === char)
	);
}

export function parseProfile(markdown: string): ParsedProfile {
	const block = extractProfileBlock(markdown);
	if (!block) {
		return {
			data: null,
			issues: [{ path: "", message: "no fenced yaml or json block" }],
		};
	}
	let data: unknown;
	try {
		data =
			block.language === "json"
				? JSON.parse(block.source)
				: Bun.YAML.parse(block.source);
	} catch (error) {
		return {
			data: null,
			issues: [
				{
					path: "",
					message: `${block.language} does not parse: ${String(error)}`,
				},
			],
		};
	}
	return { data, issues: validateProfile(data) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

const text: Check = (value, path, issues) => {
	if (typeof value !== "string" || value.trim() === "")
		issues.push({ path, message: "must be a non-empty string" });
};

const string: Check = (value, path, issues) => {
	if (typeof value !== "string")
		issues.push({ path, message: "must be a string" });
};

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

const envName: Check = (value, path, issues) => {
	if (typeof value !== "string" || !ENV_NAME.test(value))
		issues.push({ path, message: "must be an environment variable name" });
};

const flag: Check = (value, path, issues) => {
	if (typeof value !== "boolean")
		issues.push({ path, message: "must be true or false" });
};

const integer =
	(min: number): Check =>
	(value, path, issues) => {
		if (typeof value !== "number" || !Number.isInteger(value) || value < min) {
			issues.push({ path, message: `must be an integer of at least ${min}` });
		}
	};

const percent: Check = (value, path, issues) => {
	if (typeof value !== "number" || value < 0 || value > 100)
		issues.push({ path, message: "must be a number from 0 to 100" });
};

const pattern: Check = (value, path, issues) => {
	text(value, path, issues);
	if (typeof value !== "string") return;
	try {
		new RegExp(value);
	} catch {
		issues.push({ path, message: "must be a valid regular expression" });
	}
};

const oneOf =
	(...allowed: string[]): Check =>
	(value, path, issues) => {
		if (typeof value !== "string" || !allowed.includes(value)) {
			issues.push({ path, message: `must be one of ${allowed.join(", ")}` });
		}
	};

const list = (item: Check): Check =>
	Object.assign(
		(value: unknown, path: string, issues: ProfileIssue[]) => {
			if (!Array.isArray(value)) {
				issues.push({ path, message: "must be a list" });
				return;
			}
			value.forEach((entry, position) => {
				item(entry, `${path}[${position}]`, issues);
			});
		},
		{ keys: (item.keys ?? []).map((key) => `[].${key}`) },
	);

const nullable = (check: Check): Check =>
	Object.assign(
		(value: unknown, path: string, issues: ProfileIssue[]) => {
			if (value !== null) check(value, path, issues);
		},
		{ keys: check.keys ?? [] },
	);

const object = (shape: Record<string, Check>, required: string[] = []): Check =>
	Object.assign(
		(value: unknown, path: string, issues: ProfileIssue[]) => {
			if (!isRecord(value)) {
				issues.push({ path, message: "must be a mapping" });
				return;
			}
			for (const key of required) {
				if (!(key in value))
					issues.push({ path: join(path, key), message: "is required" });
			}
			for (const [key, entry] of Object.entries(value)) {
				const check = shape[key];
				if (check) check(entry, join(path, key), issues);
				else
					issues.push({ path: join(path, key), message: "is not a known key" });
			}
		},
		{
			keys: Object.entries(shape).flatMap(([key, check]) => [
				key,
				...(check.keys ?? []).map((child) =>
					child.startsWith("[]") ? `${key}${child}` : `${key}.${child}`,
				),
			]),
		},
	);

function join(path: string, key: string): string {
	return path === "" ? key : `${path}.${key}`;
}

const prerequisite = object(
	{
		name: text,
		check: text,
		on_missing: oneOf("stop", "start"),
		start: text,
	},
	["name", "check", "on_missing"],
);

export const GATE_TOOLS = ["bun", "supabase"] as const;

export type GateTool = (typeof GATE_TOOLS)[number];

export type ToolVersion = { readonly tool: GateTool; readonly version: string };

export function isGateTool(tool: string): tool is GateTool {
	return GATE_TOOLS.some((entry) => entry === tool);
}

export function runsTool(text: string, tool: string): boolean {
	return new RegExp(String.raw`(?<![\w./-])${tool}(?![\w./-])`).test(text);
}

const EXACT_VERSION = /^\d+\.\d+\.\d+$/;

const exactVersion: Check = (value, path, issues) => {
	if (typeof value !== "string" || !EXACT_VERSION.test(value))
		issues.push({ path, message: "must be an exact version, such as 1.3.14" });
};

function isRepoFile(value: string): boolean {
	return (
		value !== "" &&
		!value.startsWith("/") &&
		!/[*?[\]{}]/.test(value) &&
		!value.split("/").includes("..")
	);
}

const repoFile: Check = (value, path, issues) => {
	if (typeof value !== "string" || !isRepoFile(value))
		issues.push({
			path,
			message: "must be a file path in the repo, with no glob",
		});
};

const gate = object(
	{
		name: pattern,
		command: text,
		env: list(object({ name: text, why: text }, ["name", "why"])),
		requires: list(prerequisite),
		setup: list(text),
		when_changed: list(text),
		ci_env: list(object({ name: envName, value: string, why: text }, ["name"])),
		optional: flag,
		side_effects: text,
		after: list(text),
		tools: object(
			Object.fromEntries(GATE_TOOLS.map((tool) => [tool, exactVersion])),
		),
		rewrites: list(object({ path: repoFile, why: text }, ["path", "why"])),
	},
	["name", "command"],
);

const profileShape = object(
	{
		version: (value, path, issues) => {
			if (value !== 1) issues.push({ path, message: "must be 1" });
		},
		base: object({
			default: text,
			from_pr: flag,
			sync: oneOf("none", "merge"),
		}),
		iterations: object({ min: integer(1), max: integer(1) }),
		after_create_pr: oneOf("harden", "none"),
		push: oneOf("when-authorised", "each-commit", "never"),
		guardrails: list(text),
		gates: list(gate),
		test: gate,
		metrics: nullable(
			object({ command: text, never_increase: list(text), fallback: text }, [
				"command",
				"never_increase",
			]),
		),
		type_coverage: nullable(
			object({ command: text, min_percent: percent }, ["command"]),
		),
		typescript: nullable(
			object({ rules: flag, boundary_cast_marker: nullable(text) }),
		),
		reviewers: object({
			select: oneOf("applicable", "all"),
			agents: list(
				oneOf(
					"code-reviewer",
					"silent-failure-hunter",
					"pr-test-analyzer",
					"comment-analyzer",
					"type-design-analyzer",
				),
			),
			extra: list(
				object({ name: text, invoke: text, when: text }, [
					"name",
					"invoke",
					"when",
				]),
			),
			checklists: list(object({ path: text, use: text }, ["path", "use"])),
			notes: list(text),
		}),
		test_adequacy: oneOf("changed-behaviour", "control-per-clause"),
		ledger: object({ carry_over: flag }),
		prepasses: list(
			object(
				{
					name: oneOf("contract-coverage", "claims-audit"),
					when: text,
					sources: list(text),
				},
				["name", "when"],
			),
		),
		comments: object({ keep_patterns: list(pattern) }),
		forbidden: object({
			commands: list(pattern),
			code: list(pattern),
			paths: list(text),
			gate_flags: list(text),
		}),
		conventions: object({
			branch: object({ create: text, pattern: nullable(pattern) }),
			commit: object({ subject: text, trailers: list(text) }),
			pr: object({
				title: text,
				body_first_line: text,
				forbidden_body_words: list(text),
			}),
			ticket: object({ key_pattern: pattern }),
		}),
		proof: object({
			pr_comment: nullable(
				object({ heading: text, extra: list(text) }, ["heading"]),
			),
			on_unclean: nullable(
				object({
					draft: flag,
					label: text,
					post_to: list(oneOf("pr", "issue")),
				}),
			),
		}),
		threads: object({ answer: flag }),
		merge: object({
			after_clean_stop: oneOf("report", "merge"),
			command: text,
			fallback: text,
			conditions: list(text),
		}),
	},
	["version", "gates", "test"],
);

export const PROFILE_KEYS: readonly string[] = profileShape.keys ?? [];

export const PROFILE_LEAF_KEYS: readonly string[] = PROFILE_KEYS.filter(
	(key) =>
		!PROFILE_KEYS.some(
			(other) => other.startsWith(`${key}.`) || other.startsWith(`${key}[].`),
		),
);

export const DEFAULT_MAX_ITERATIONS = 2;

export const FALLBACK_KEYS: readonly string[] = [
	"base.default",
	"base.from_pr",
	"base.sync",
	"iterations.min",
	"iterations.max",
	"push",
	"guardrails",
	"gates",
	"gates[].name",
	"gates[].command",
	"gates[].env",
	"gates[].requires",
	"gates[].setup",
	"gates[].when_changed",
	"gates[].ci_env",
	"gates[].after",
	"gates[].tools",
	"gates[].rewrites",
	"test",
	"test.name",
	"test.command",
	"test.env",
	"test.requires",
	"test.setup",
	"test.when_changed",
	"test.ci_env",
	"test.after",
	"test.tools",
	"test.rewrites",
	"metrics",
	"metrics.command",
	"metrics.never_increase",
	"reviewers.select",
	"reviewers.agents",
	"reviewers.checklists",
	"reviewers.notes",
	"typescript.rules",
	"test_adequacy",
	"ledger.carry_over",
	"prepasses",
	"prepasses[].when",
	"prepasses[].sources",
	"comments.keep_patterns",
	"forbidden.commands",
	"forbidden.paths",
	"conventions.branch.create",
	"conventions.branch.pattern",
	"conventions.commit.subject",
	"conventions.commit.trailers",
	"proof.pr_comment",
	"proof.on_unclean",
	"threads.answer",
	"merge.after_clean_stop",
	"merge.conditions",
];

function definesKey(data: unknown, key: string): boolean {
	const [head = "", ...rest] = key.split(".");
	if (data === null) return true;
	if (head.endsWith("[]")) {
		const items = isRecord(data) ? data[head.slice(0, -2)] : undefined;
		if (!Array.isArray(items)) return false;
		return items.every((item) => definesKey(item, rest.join(".")));
	}
	if (!isRecord(data) || !(head in data)) return false;
	return rest.length === 0 || definesKey(data[head], rest.join("."));
}

export function missingFallbackKeys(data: unknown): string[] {
	return FALLBACK_KEYS.filter((key) => !definesKey(data, key));
}

type UnreadKey = {
	readonly key: string;
	readonly fallback: "absent" | { readonly value: unknown };
};

export const FALLBACK_UNREAD: readonly UnreadKey[] = [
	{ key: "type_coverage", fallback: { value: null } },
	{ key: "typescript.boundary_cast_marker", fallback: { value: null } },
	{ key: "reviewers.extra", fallback: { value: [] } },
	{ key: "prepasses[].name", fallback: { value: "contract-coverage" } },
	{ key: "forbidden.code", fallback: { value: [] } },
	{ key: "forbidden.gate_flags", fallback: { value: [] } },
	{ key: "gates[].optional", fallback: { value: false } },
	{ key: "test.optional", fallback: { value: false } },
	{ key: "metrics.fallback", fallback: "absent" },
	{ key: "merge.fallback", fallback: "absent" },
];

type ExemptKey = { readonly key: string; readonly reason: string };

export const FALLBACK_EXEMPT: readonly ExemptKey[] = [
	{
		key: "version",
		reason:
			"validateProfile reads the schema version. No step of the run reads it.",
	},
	{
		key: "after_create_pr",
		reason:
			"The create-pr playbook reads it to start one run. No step of the run reads it.",
	},
	{
		key: "conventions.pr",
		reason: "No step of the engine or the stub edits the PR title or body.",
	},
	{
		key: "conventions.ticket",
		reason: "No step of the engine or the stub reads a ticket key.",
	},
	{
		key: "gates[].side_effects",
		reason:
			"It tells the reader of the profile what a gate changes outside the tree. validateProfile requires it with a setup or a start, and no step of the run reads it.",
	},
	{
		key: "test.side_effects",
		reason:
			"It tells the reader of the profile what the test gate changes outside the tree. validateProfile requires it with a setup or a start, and no step of the run reads it.",
	},
	{
		key: "merge.command",
		reason:
			"The stub runs it only when merge.after_clean_stop is merge, and validateProfile requires it then. A profile that only reports leaves it out.",
	},
];

function valuesAt(data: unknown, key: string): unknown[] {
	const [head = "", ...rest] = key.split(".");
	if (head.endsWith("[]")) {
		const items = isRecord(data) ? data[head.slice(0, -2)] : undefined;
		return Array.isArray(items)
			? items.flatMap((item) => valuesAt(item, rest.join(".")))
			: [];
	}
	if (!isRecord(data) || !(head in data)) return [];
	return rest.length === 0
		? [data[head]]
		: valuesAt(data[head], rest.join("."));
}

export function unreadFallbackKeys(data: unknown): string[] {
	return FALLBACK_UNREAD.filter(({ key, fallback }) =>
		valuesAt(data, key).some(
			(value) =>
				fallback === "absent" ||
				JSON.stringify(value) !== JSON.stringify(fallback.value),
		),
	).map(({ key }) => key);
}

export function validateProfile(data: unknown): ProfileIssue[] {
	const issues: ProfileIssue[] = [];
	profileShape(data, "", issues);
	if (!isRecord(data)) return issues;
	checkIterations(data.iterations, issues);
	checkGateNames(data, issues);
	checkGateRuns(data, issues);
	checkGateOrder(data, issues);
	issues.push(...gateFixers(data));
	issues.push(...gateForbiddenCommands(data));
	checkBoundaryCastMarker(data, issues);
	checkMerge(data.merge, issues);
	return issues;
}

type FixerFlag = { readonly flag: string; readonly pattern: RegExp };

function flagPattern(flag: string): RegExp {
	const word = flag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`(?<![\\w-])${word}(?![\\w-])`);
}

export const FIXER_FLAGS: readonly FixerFlag[] = [
	...["--write", "--fix", "--unsafe", "--suppress", "--update-snapshots"].map(
		(flag) => ({ flag, pattern: flagPattern(flag) }),
	),
	{ flag: "--apply", pattern: /(?<![\w-])--apply(?:-unsafe)?(?![\w-])/ },
	{
		flag: "-u",
		pattern: /\b(?:test|vitest|jest|playwright|e2e)\b[^;&|\n]*\s-u(?![\w-])/,
	},
	{ flag: "biome init", pattern: /\bbiome\s+init\b/ },
	{ flag: "biome migrate", pattern: /\bbiome\s+migrate\b/ },
	{ flag: "manypkg fix", pattern: /\bmanypkg(?:\/cli)?\s+fix\b/ },
];

export function gateFixers(data: unknown): ProfileIssue[] {
	if (!isRecord(data)) return [];
	const forbidden = isRecord(data.forbidden) ? data.forbidden : {};
	const flags = [
		...FIXER_FLAGS,
		...strings(forbidden.gate_flags).map((flag) => ({
			flag,
			pattern: flagPattern(flag),
		})),
	];
	return gateEntries(data).flatMap(([path, entry]) => {
		const setup = Array.isArray(entry.setup) ? entry.setup : [];
		const requires = Array.isArray(entry.requires) ? entry.requires : [];
		const texts: [string, unknown][] = [
			[`${path}.command`, entry.command],
			...setup.map((text, index): [string, unknown] => [
				`${path}.setup[${index}]`,
				text,
			]),
			...requires.flatMap((item, index): [string, unknown][] =>
				isRecord(item)
					? [
							[`${path}.requires[${index}].check`, item.check],
							[`${path}.requires[${index}].start`, item.start],
						]
					: [],
			),
		];
		return texts.flatMap(([at, text]) =>
			typeof text === "string"
				? flags
						.filter(({ pattern }) => pattern.test(text))
						.map(({ flag }) => ({
							path: at,
							message: `runs ${flag}, a flag that changes files, so the gate can fix the tree and hide a red`,
						}))
				: [],
		);
	});
}

const OWNER_HINT = /\s--(?:reset|restart) "[^"]*"/g;

const COMMAND_SEPARATOR = /&&|\|\||[;|()\n]/;

function compiled(source: string): RegExp[] {
	try {
		return [new RegExp(source)];
	} catch {
		return [];
	}
}

export function gateForbiddenCommands(data: unknown): ProfileIssue[] {
	if (!isRecord(data)) return [];
	const forbidden = isRecord(data.forbidden) ? data.forbidden : {};
	const patterns = strings(forbidden.commands).flatMap(compiled);
	if (patterns.length === 0) return [];
	return gateEntries(data).flatMap(([path, entry]) => {
		const requires = records(entry.requires);
		const texts: [string, unknown][] = [
			[`${path}.command`, entry.command],
			...strings(entry.setup).map((text, index): [string, unknown] => [
				`${path}.setup[${index}]`,
				text,
			]),
			...requires.flatMap((item, index): [string, unknown][] => [
				[`${path}.requires[${index}].check`, item.check],
				[`${path}.requires[${index}].start`, item.start],
			]),
		];
		return texts.flatMap(([at, text]) =>
			typeof text === "string"
				? text
						.replace(OWNER_HINT, "")
						.split(COMMAND_SEPARATOR)
						.map((segment) => segment.trim())
						.filter((segment) =>
							patterns.some((pattern) => pattern.test(segment)),
						)
						.map((segment) => ({
							path: at,
							message: `runs \`${segment}\`, which forbidden.commands of the profile forbids`,
						}))
				: [],
		);
	});
}

function checkIterations(iterations: unknown, issues: ProfileIssue[]): void {
	if (!isRecord(iterations)) return;
	const min = typeof iterations.min === "number" ? iterations.min : 1;
	const max =
		typeof iterations.max === "number"
			? iterations.max
			: DEFAULT_MAX_ITERATIONS;
	if (min > max)
		issues.push({ path: "iterations", message: "min must not exceed max" });
}

function checkGateNames(
	data: Record<string, unknown>,
	issues: ProfileIssue[],
): void {
	const gates = Array.isArray(data.gates) ? data.gates : [];
	const names = [...gates, data.test].flatMap((entry) =>
		isRecord(entry) && typeof entry.name === "string" ? [entry.name] : [],
	);
	const seen = new Set<string>();
	for (const name of names) {
		if (!/^[a-z][a-z0-9-]*$/.test(name))
			issues.push({
				path: "gates",
				message: `gate name ${name} must be kebab-case`,
			});
		if (seen.has(name))
			issues.push({
				path: "gates",
				message: `gate name ${name} is used twice`,
			});
		seen.add(name);
	}
}

function gateEntries(
	data: Readonly<Record<string, unknown>>,
): [string, Readonly<Record<string, unknown>>][] {
	const gates = Array.isArray(data.gates) ? data.gates : [];
	const listed = gates.flatMap(
		(entry, index): [string, Readonly<Record<string, unknown>>][] =>
			isRecord(entry) ? [[`gates[${index}]`, entry]] : [],
	);
	return isRecord(data.test) ? [...listed, ["test", data.test]] : listed;
}

function records(value: unknown): Readonly<Record<string, unknown>>[] {
	return Array.isArray(value) ? value.filter(isRecord) : [];
}

function checkGateRuns(
	data: Readonly<Record<string, unknown>>,
	issues: ProfileIssue[],
): void {
	for (const [path, entry] of gateEntries(data)) {
		const prerequisites = Array.isArray(entry.requires) ? entry.requires : [];
		prerequisites.forEach((item, index) => {
			if (isRecord(item) && item.on_missing === "start" && !("start" in item))
				issues.push({
					path: `${path}.requires[${index}].start`,
					message: "is required when on_missing is start",
				});
		});
		const starts = records(entry.requires).some(
			(item) => item.on_missing === "start",
		);
		const setup = Array.isArray(entry.setup) && entry.setup.length > 0;
		if ((starts || setup) && !("side_effects" in entry))
			issues.push({
				path: `${path}.side_effects`,
				message:
					"is required when the gate runs setup commands or starts a prerequisite",
			});
		const globs = Array.isArray(entry.when_changed) ? entry.when_changed : [];
		const selects = globs.some(
			(glob) => typeof glob === "string" && !glob.startsWith("!"),
		);
		if (globs.length > 0 && !selects)
			issues.push({
				path: `${path}.when_changed`,
				message: "needs a glob that does not start with !",
			});
		checkCiEnv(entry, path, issues);
	}
}

function checkGateOrder(
	data: Readonly<Record<string, unknown>>,
	issues: ProfileIssue[],
): void {
	const earlier: Readonly<Record<string, unknown>>[] = [];
	for (const [path, entry] of gateEntries(data)) {
		strings(entry.after).forEach((name, index) => {
			const at = `${path}.after[${index}]`;
			const producer = earlier.find((gate) => gate.name === name);
			if (producer === undefined)
				issues.push({
					path: at,
					message: `${name} must be a gate that runs before this gate`,
				});
			else if (!sameGlobs(producer.when_changed, entry.when_changed))
				issues.push({
					path: at,
					message: `${name} must apply to every diff that this gate applies to, so its when_changed must be empty or the same`,
				});
		});
		earlier.push(entry);
	}
}

function sameGlobs(producer: unknown, dependent: unknown): boolean {
	const globs = strings(producer);
	const own = strings(dependent);
	return (
		globs.length === 0 ||
		(globs.length === own.length && globs.every((glob) => own.includes(glob)))
	);
}

const RUNNER_VARIABLE = /^(?:GITHUB|RUNNER)_/;

function checkCiEnv(
	entry: Readonly<Record<string, unknown>>,
	path: string,
	issues: ProfileIssue[],
): void {
	const session = new Set(sessionEnvNames(entry));
	const seen = new Set<string>();
	records(entry.ci_env).forEach((item, index) => {
		const at = `${path}.ci_env[${index}]`;
		if (!("value" in item) && !("why" in item))
			issues.push({ path: at, message: "needs a value or a why" });
		if (typeof item.name !== "string") return;
		const name = item.name;
		if ("value" in item && RUNNER_VARIABLE.test(name))
			issues.push({
				path: `${at}.name`,
				message:
					"the run never sets GITHUB_ACTIONS or another GITHUB_ or RUNNER_ variable",
			});
		if (seen.has(name))
			issues.push({
				path: `${at}.name`,
				message: `${name} is in ci_env twice`,
			});
		seen.add(name);
		if (session.has(name))
			issues.push({
				path: `${at}.name`,
				message: `${name} is in env and in ci_env. Keep it in one list`,
			});
	});
}

export type CiEnvEntry =
	| { readonly kind: "copy"; readonly name: string; readonly value: string }
	| {
			readonly kind: "set";
			readonly name: string;
			readonly value: string;
			readonly why: string;
	  }
	| { readonly kind: "leave"; readonly name: string; readonly why: string };

export type ProfileGate = {
	readonly name: string;
	readonly test: boolean;
	readonly command: string;
	readonly preparation: readonly string[];
	readonly checks: readonly string[];
	readonly whenChanged: readonly string[];
	readonly sessionEnv: readonly string[];
	readonly ciEnv: readonly CiEnvEntry[];
	readonly tools: readonly ToolVersion[];
	readonly rewrites: readonly string[];
};

function sessionEnvNames(entry: Readonly<Record<string, unknown>>): string[] {
	return strings(records(entry.env).map((item) => item.name));
}

function strings(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

export function profileGates(data: unknown): ProfileGate[] {
	if (!isRecord(data)) return [];
	return gateEntries(data).flatMap(([path, entry]): ProfileGate[] => {
		if (typeof entry.name !== "string" || typeof entry.command !== "string")
			return [];
		const requires = records(entry.requires);
		const prerequisites = requires.flatMap((item) =>
			strings([item.check, item.start]),
		);
		return [
			{
				name: entry.name,
				test: path === "test",
				command: entry.command,
				preparation: [...strings(entry.setup), ...prerequisites],
				checks: strings(requires.map((item) => item.check)),
				whenChanged: strings(entry.when_changed),
				sessionEnv: sessionEnvNames(entry),
				ciEnv: records(entry.ci_env).flatMap(ciEnvEntry),
				tools: toolVersions(entry.tools),
				rewrites: strings(records(entry.rewrites).map((item) => item.path)),
			},
		];
	});
}

function toolVersions(value: unknown): ToolVersion[] {
	if (!isRecord(value)) return [];
	return GATE_TOOLS.flatMap((tool): ToolVersion[] => {
		const version = value[tool];
		return typeof version === "string" ? [{ tool, version }] : [];
	});
}

function ciEnvEntry(item: Readonly<Record<string, unknown>>): CiEnvEntry[] {
	const { name, value, why } = item;
	if (typeof name !== "string") return [];
	if (typeof why === "string")
		return [
			typeof value === "string"
				? { kind: "set", name, value, why }
				: { kind: "leave", name, why },
		];
	return typeof value === "string" ? [{ kind: "copy", name, value }] : [];
}

function checkBoundaryCastMarker(
	data: Record<string, unknown>,
	issues: ProfileIssue[],
): void {
	const typescript = data.typescript;
	if (
		!isRecord(typescript) ||
		typeof typescript.boundary_cast_marker !== "string"
	)
		return;
	const marker = typescript.boundary_cast_marker;
	const comments = isRecord(data.comments) ? data.comments : {};
	const patterns = Array.isArray(comments.keep_patterns)
		? comments.keep_patterns
		: [];
	const kept = patterns.some(
		(entry) => typeof entry === "string" && safeTest(entry, `${marker} reason`),
	);
	if (!kept) {
		issues.push({
			path: "typescript.boundary_cast_marker",
			message: "needs a comments.keep_patterns entry that matches it",
		});
	}
}

function safeTest(source: string, sample: string): boolean {
	try {
		return new RegExp(source).test(sample);
	} catch {
		return false;
	}
}

const CHECKS_CI_ON_HEAD = (condition: string): boolean =>
	/\bCI\b/.test(condition) && /\bhead\b/i.test(condition);

export function mergesWithoutCi(data: unknown): boolean {
	if (!isRecord(data) || !isRecord(data.merge)) return false;
	return (
		data.merge.after_clean_stop === "merge" &&
		!strings(data.merge.conditions).some(CHECKS_CI_ON_HEAD)
	);
}

function checkMerge(merge: unknown, issues: ProfileIssue[]): void {
	if (!isRecord(merge) || merge.after_clean_stop !== "merge") return;
	if (typeof merge.command !== "string")
		issues.push({
			path: "merge.command",
			message: "is required when after_clean_stop is merge",
		});
	if (mergesWithoutCi({ merge }))
		issues.push({
			path: "merge.conditions",
			message:
				"needs a condition that checks CI on the head when after_clean_stop is merge, because a local version note is advisory only when CI gates the merge",
		});
}
