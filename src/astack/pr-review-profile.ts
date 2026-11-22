import { parse as parseYaml } from "yaml";
import { proofGateIssues } from "./change-proof/profile.ts";

export type ProfileIssue = { path: string; message: string };

export type ProfileBlock = { language: "yaml" | "json"; source: string };

export type ParsedProfile = { data: unknown; issues: ProfileIssue[] };

type Check = (value: unknown, path: string, issues: ProfileIssue[]) => void;

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

const NO_BLOCK = "no fenced yaml or json block";

type ParsedBlock =
	| { readonly kind: "data"; readonly data: unknown }
	| { readonly kind: "syntax"; readonly message: string };

function parseBlock(block: ProfileBlock): ParsedBlock {
	try {
		return {
			kind: "data",
			data:
				block.language === "json"
					? JSON.parse(block.source)
					: parseYaml(block.source, { merge: true, uniqueKeys: false }),
		};
	} catch (error) {
		return {
			kind: "syntax",
			message: `${block.language} does not parse: ${String(error)}`,
		};
	}
}

export function parseProfile(markdown: string): ParsedProfile {
	const block = extractProfileBlock(markdown);
	if (!block) return { data: null, issues: [{ path: "", message: NO_BLOCK }] };
	const parsed = parseBlock(block);
	return parsed.kind === "syntax"
		? { data: null, issues: [{ path: "", message: parsed.message }] }
		: { data: parsed.data, issues: validateProfile(parsed.data) };
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

const list =
	(item: Check): Check =>
	(value, path, issues) => {
		if (!Array.isArray(value)) {
			issues.push({ path, message: "must be a list" });
			return;
		}
		value.forEach((entry, position) => {
			item(entry, `${path}[${position}]`, issues);
		});
	};

const nullable =
	(check: Check): Check =>
	(value, path, issues) => {
		if (value !== null) check(value, path, issues);
	};

const object =
	(shape: Record<string, Check>, required: string[] = []): Check =>
	(value, path, issues) => {
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
	};

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

export const DEFAULT_MAX_ITERATIONS = 2;

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

export type Prerequisite = {
	readonly name: string;
	readonly check: string;
	readonly start: string | undefined;
};

export type ProfileGate = {
	readonly name: string;
	readonly test: boolean;
	readonly command: string;
	readonly preparation: readonly string[];
	readonly checks: readonly string[];
	readonly requires: readonly Prerequisite[];
	readonly setup: readonly string[];
	readonly after: readonly string[];
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
				requires: requires.flatMap(prerequisiteOf),
				setup: strings(entry.setup),
				after: strings(entry.after),
				whenChanged: strings(entry.when_changed),
				sessionEnv: sessionEnvNames(entry),
				ciEnv: records(entry.ci_env).flatMap(ciEnvEntry),
				tools: toolVersions(entry.tools),
				rewrites: strings(records(entry.rewrites).map((item) => item.path)),
			},
		];
	});
}

function prerequisiteOf(
	item: Readonly<Record<string, unknown>>,
): Prerequisite[] {
	const { name, check, on_missing, start } = item;
	if (typeof name !== "string" || typeof check !== "string") return [];
	return [
		{
			name,
			check,
			start:
				on_missing === "start" && typeof start === "string" ? start : undefined,
		},
	];
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

function unkeptMarker(
	data: unknown,
	keep: readonly RegExp[],
): ProfileIssue | undefined {
	if (!isRecord(data) || !isRecord(data.typescript)) return undefined;
	const marker = data.typescript.boundary_cast_marker;
	if (typeof marker !== "string") return undefined;
	return keep.some((pattern) => pattern.test(`${marker} reason`))
		? undefined
		: {
				path: "typescript.boundary_cast_marker",
				message: `no commentKeep pattern of the repo matches ${JSON.stringify(marker)}`,
			};
}

const CHECKS_CI_ON_HEAD = (condition: string): boolean =>
	/\bCI\b/.test(condition) && /\bhead\b/i.test(condition);

function mergesWithoutCi(data: unknown): boolean {
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

export type ReviewProfileProblem = ProfileIssue & { readonly repair: string };

const REFERENCE = "references/profile.md of the pr-review-hardening skill";

export const MISSING_PROFILE_REPAIR = `Draft a profile as the Draft a profile section of ${REFERENCE} says`;

export const NO_BLOCK_REPAIR = `Put the keys in one fenced yaml block, as the Template section of ${REFERENCE} shows`;

function schemaRepair(issue: ProfileIssue): string {
	return issue.path === "merge.conditions"
		? "Add a condition that checks CI on the head SHA, or set merge.after_clean_stop to report"
		: `Change it as ${REFERENCE} says`;
}

export function reviewProfileProblems(
	markdown: string,
	keep: readonly RegExp[],
): ReviewProfileProblem[] {
	const block = extractProfileBlock(markdown);
	if (!block) return [{ path: "", message: NO_BLOCK, repair: NO_BLOCK_REPAIR }];
	const parsed = parseBlock(block);
	if (parsed.kind === "syntax")
		return [
			{
				path: "",
				message: parsed.message,
				repair: "Fix the syntax of the fenced block",
			},
		];
	const { data } = parsed;
	const marker = unkeptMarker(data, keep);
	return [
		...validateProfile(data).map((issue) => ({
			...issue,
			repair: schemaRepair(issue),
		})),
		...(marker === undefined
			? []
			: [
					{
						...marker,
						repair:
							"Add a pattern that matches the marker to commentKeep in .astack/profile.json. Apply writes that list from keepPatterns of the project config",
					},
				]),
		...proofGateIssues(data).map((issue) => ({
			...issue,
			repair: `Copy the change-proof gate from the Template section of ${REFERENCE}`,
		})),
	];
}

export function problemText(problem: ReviewProfileProblem): string {
	return `${problem.path === "" ? "" : `${problem.path}: `}${problem.message}. ${problem.repair}`;
}

export type ReviewProfileState =
	| { readonly kind: "missing"; readonly path: string }
	| { readonly kind: "no-block"; readonly path: string }
	| {
			readonly kind: "checked";
			readonly path: string;
			readonly problems: readonly ReviewProfileProblem[];
	  };

export function reviewProfileState(
	path: string,
	text: string | undefined,
	keep: readonly RegExp[],
): ReviewProfileState {
	if (text === undefined) return { kind: "missing", path };
	if (extractProfileBlock(text) === null) return { kind: "no-block", path };
	return { kind: "checked", path, problems: reviewProfileProblems(text, keep) };
}
