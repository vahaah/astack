import { basename } from "node:path";
import {
	actionName,
	EXACT_VERSION,
	exactVersionInFile,
	TOOL_ACTIONS,
	type Tool,
} from "../../src/astack/ci-pins.ts";
import {
	type CiEnvEntry,
	type GateTool,
	isGateTool,
	type ProfileGate,
	runsTool,
} from "../../src/astack/pr-review-profile.ts";
import { err, ok, type Result } from "../../src/astack/result.ts";
import {
	canRun,
	outputsRead,
	pullRequestScenarios,
	type Scenario,
} from "./ci-condition.ts";

export type CiEnv = Readonly<Record<string, string>>;

export type EnvFileWrites = {
	readonly names: CiEnv;
	readonly unread: boolean;
};

export type CiStep = {
	readonly label: string;
	readonly command: string;
	readonly env?: CiEnv;
	readonly writes?: EnvFileWrites;
};

export type CiService = {
	readonly id: string;
	readonly env: CiEnv;
	readonly ports: readonly string[];
};

export type CiPaths =
	| { readonly kind: "any" }
	| {
			readonly kind: "only";
			readonly globs: readonly string[];
			readonly source: string;
	  }
	| {
			readonly kind: "except";
			readonly globs: readonly string[];
			readonly source: string;
	  };

export type ToolPin =
	| {
			readonly kind: "exact";
			readonly tool: Tool;
			readonly version: string;
			readonly file: string | undefined;
			readonly source: string;
	  }
	| {
			readonly kind: "unread";
			readonly tool: Tool;
			readonly source: string;
	  };

export type CiJob = {
	readonly id: string;
	readonly env: CiEnv;
	readonly services: readonly CiService[];
	readonly steps: readonly CiStep[];
	readonly pins: readonly ToolPin[];
	readonly needs: readonly string[];
	readonly continueOnError: boolean;
	readonly runsOnPullRequest: boolean;
	readonly aggregates: boolean;
	readonly paths: CiPaths;
};

export type CiWorkflow = {
	readonly file: string;
	readonly triggers: readonly string[];
	readonly jobs: readonly CiJob[];
};

export type CiParityConfig = {
	readonly setup: readonly { command: string; reason: string }[];
	readonly map: readonly {
		job: string;
		step?: string;
		gates: string[];
		reason: string;
		differs?: string;
	}[];
	readonly exclude: readonly { job: string; step?: string; reason: string }[];
	readonly narrow?: readonly { job: string; gates: string[]; reason: string }[];
};

export type JobVerdict =
	| { kind: "mapped"; job: string; via: "command"; gates: readonly string[] }
	| {
			kind: "mapped";
			job: string;
			via: "config";
			gates: readonly string[];
			reason: string;
	  }
	| { kind: "excluded"; job: string; proof: string; reason: string }
	| { kind: "unproven"; job: string; reason: string }
	| { kind: "unmapped"; job: string; uncovered: readonly string[] };

export type PathVerdict =
	| { kind: "allowed"; job: string; gate: string; reason: string }
	| {
			kind: "narrower";
			job: string;
			gate: string;
			jobPaths: CiPaths;
			gatePaths: readonly string[];
	  };

export type EnvOverride = Exclude<CiEnvEntry, { kind: "copy" }>;

export type EnvVerdict =
	| { kind: "copied"; gate: string; name: string }
	| { kind: "session"; gate: string; name: string }
	| { kind: "overridden"; gate: string; entry: EnvOverride }
	| { kind: "missing"; gate: string; name: string; source: string; ci: string }
	| {
			kind: "differs";
			gate: string;
			name: string;
			value: string;
			source: string;
			ci: string;
	  }
	| { kind: "stale"; gate: string; name: string };

type ExactPin = Extract<ToolPin, { kind: "exact" }>;

export type ToolchainVerdict =
	| { kind: "pinned"; gate: string; job: string; pin: ExactPin }
	| { kind: "unpinned"; gate: string; job: string; pin: ExactPin }
	| {
			kind: "differs";
			gate: string;
			job: string;
			pin: ExactPin;
			recorded: string;
	  }
	| { kind: "stale"; gate: string; tool: GateTool; version: string }
	| {
			kind: "borrowed";
			gate: string;
			tool: GateTool;
			version: string;
			job: string;
	  }
	| {
			kind: "unmatched";
			gate: string;
			tool: GateTool;
			version: string;
			example: { job: string; version: string };
	  }
	| { kind: "unread"; job: string; pin: Extract<ToolPin, { kind: "unread" }> };

export type StepVerdict =
	| {
			kind: "differs";
			job: string;
			step: string;
			gates: readonly string[];
			missing: readonly string[];
			reason: string;
	  }
	| {
			kind: "unrecorded";
			job: string;
			step: string;
			gates: readonly string[];
			missing: readonly string[];
	  };

export type OrderVerdict =
	| { kind: "reversed"; job: string; first: string; second: string }
	| { kind: "test-last"; job: string; test: string; later: string };

export type ExportVerdict =
	| { kind: "reviewed"; job: string; step: string; reason: string }
	| { kind: "unread"; job: string; step: string };

export type ServiceVerdict =
	| {
			kind: "checked";
			job: string;
			service: string;
			port: string;
			gate: string;
	  }
	| { kind: "unchecked"; job: string; service: string; port: string };

export type ParityReport = {
	readonly pullRequest: readonly string[];
	readonly other: readonly { file: string; triggers: readonly string[] }[];
	readonly jobs: readonly JobVerdict[];
	readonly steps: readonly StepVerdict[];
	readonly order: readonly OrderVerdict[];
	readonly paths: readonly PathVerdict[];
	readonly env: readonly EnvVerdict[];
	readonly exports: readonly ExportVerdict[];
	readonly services: readonly ServiceVerdict[];
	readonly toolchain: readonly ToolchainVerdict[];
	readonly problems: readonly string[];
};

export const PULL_REQUEST_TRIGGERS: readonly string[] = [
	"pull_request",
	"pull_request_target",
	"merge_group",
];

export const SETUP_ACTIONS: readonly string[] = [
	"actions/cache",
	"actions/checkout",
	"actions/download-artifact",
	"actions/setup-node",
	"actions/upload-artifact",
	"oven-sh/setup-bun",
	"superfly/flyctl-actions/setup-flyctl",
	"supabase/setup-cli",
];

export const PATH_FILTER_ACTIONS: readonly string[] = ["dorny/paths-filter"];

const BUN_COMMANDS: ReadonlySet<string> = new Set([
	"a",
	"add",
	"audit",
	"build",
	"c",
	"create",
	"exec",
	"i",
	"info",
	"init",
	"install",
	"link",
	"outdated",
	"patch",
	"pm",
	"publish",
	"remove",
	"repl",
	"rm",
	"run",
	"test",
	"unlink",
	"update",
	"upgrade",
	"why",
	"x",
]);

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOf(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function scriptForm(command: string): string {
	return command
		.replace(/^bun x /, "bunx ")
		.replace(/^bun ([a-z][\w:-]*)(?=\s|$)/i, (whole, word: string) =>
			BUN_COMMANDS.has(word) ? whole : `bun run ${word}`,
		);
}

function normalizeLine(line: string): string {
	return line
		.split("&&")
		.map((part) => scriptForm(part.trim().replace(/\s+/g, " ")))
		.join(" && ");
}

function directory(workingDirectory: string | undefined): string | undefined {
	const path = workingDirectory
		?.trim()
		.replace(/^\.\//, "")
		.replace(/\/+$/, "");
	return path === undefined || path === "" || path === "." ? undefined : path;
}

export function normalizeCommand(
	run: string,
	workingDirectory?: string,
): string {
	const lines = run
		.replace(/\\\n\s*/g, " ")
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line !== "" && !line.startsWith("#"))
		.map(normalizeLine);
	const cd = directory(workingDirectory);
	const body = lines.join("\n");
	return cd === undefined ? body : `cd ${cd} && ${body}`;
}

const ENV_FILE = String.raw`"?\$(?:GITHUB_ENV|\{GITHUB_ENV\})"?`;

const WRITES_ENV_FILE = new RegExp(
	String.raw`(?:>>?\s*|\btee\s+(?:-a\s+)?)${ENV_FILE}`,
);

const TO_ENV_FILE = new RegExp(
	String.raw`\s*(?:>>?\s*|\|\s*tee\s+(?:-a\s+)?)${ENV_FILE}$`,
);

const GROUP_TO_ENV_FILE = new RegExp(String.raw`^\}\s*>>?\s*${ENV_FILE}$`);

const ECHO_ASSIGNMENT =
	/^echo\s+(["']?)(?<name>[A-Za-z_][A-Za-z0-9_]*)=(?<value>.*)\1$/;

const ASSIGNMENT = /^(?<name>[A-Za-z_][A-Za-z0-9_]*)=(?<value>.*)$/;

const HEREDOC = /^cat\b.*<<-?\s*(["']?)(\w+)\1/;

type EnvFileState =
	| { readonly kind: "script" }
	| { readonly kind: "group"; readonly lines: readonly string[] }
	| {
			readonly kind: "heredoc";
			readonly end: string;
			readonly toEnvFile: boolean;
	  };

function envFileWrites(command: string): EnvFileWrites | undefined {
	const names: Record<string, string> = {};
	let unread = false;
	let wrote = false;
	const assign = (line: string, pattern: RegExp) => {
		const groups = pattern.exec(line)?.groups;
		const name = groups?.name;
		if (name === undefined) unread = true;
		else names[name] = groups?.value ?? "";
	};
	const write = (part: string) => {
		wrote = true;
		assign(part.replace(TO_ENV_FILE, ""), ECHO_ASSIGNMENT);
	};
	let state: EnvFileState = { kind: "script" };
	const parts = command.split("\n").flatMap((line) => line.split(" && "));
	for (const part of parts) {
		switch (state.kind) {
			case "script": {
				const heredoc = HEREDOC.exec(part);
				if (part === "{") state = { kind: "group", lines: [] };
				else if (heredoc !== null) {
					const toEnvFile = WRITES_ENV_FILE.test(part);
					wrote = wrote || toEnvFile;
					state = { kind: "heredoc", end: heredoc[2] ?? "", toEnvFile };
				} else if (WRITES_ENV_FILE.test(part)) write(part);
				break;
			}
			case "group":
				if (GROUP_TO_ENV_FILE.test(part)) {
					wrote = true;
					for (const line of state.lines) assign(line, ECHO_ASSIGNMENT);
					state = { kind: "script" };
				} else if (part.startsWith("}")) state = { kind: "script" };
				else if (WRITES_ENV_FILE.test(part)) write(part);
				else state = { kind: "group", lines: [...state.lines, part] };
				break;
			case "heredoc":
				if (part === state.end) state = { kind: "script" };
				else if (state.toEnvFile) assign(part, ASSIGNMENT);
				break;
			default: {
				const unhandled: never = state;
				return unhandled;
			}
		}
	}
	return wrote ? { names, unread } : undefined;
}

function envOf(node: unknown): Record<string, string> {
	const env = isRecord(node) ? node.env : undefined;
	if (!isRecord(env)) return {};
	return Object.fromEntries(
		Object.entries(env).flatMap(([name, value]): [string, string][] => {
			if (value === null) return [[name, ""]];
			return typeof value === "string" ||
				typeof value === "number" ||
				typeof value === "boolean"
				? [[name, String(value)]]
				: [];
		}),
	);
}

function portsOf(service: unknown): string[] {
	const ports = isRecord(service) ? service.ports : undefined;
	if (!Array.isArray(ports)) return [];
	return ports.flatMap((port): string[] => {
		if (typeof port !== "string" && typeof port !== "number") return [];
		const parts = String(port)
			.replace(/\/\w+$/, "")
			.split(":");
		const host = (
			parts.length > 1 ? parts[parts.length - 2] : parts[0]
		)?.trim();
		return host !== undefined && /^\d+$/.test(host) ? [host] : [];
	});
}

function servicesOf(node: Readonly<Record<string, unknown>>): CiService[] {
	const services = node.services;
	if (!isRecord(services)) return [];
	return Object.entries(services).map(([id, service]) => ({
		id,
		env: envOf(service),
		ports: portsOf(service),
	}));
}

function triggersOf(on: unknown): string[] {
	if (typeof on === "string") return [on];
	if (Array.isArray(on))
		return on.filter((item): item is string => typeof item === "string");
	return isRecord(on) ? Object.keys(on) : [];
}

function defaultDirectory(node: unknown): string | undefined {
	const defaults = isRecord(node) ? node.defaults : undefined;
	const run = isRecord(defaults) ? defaults.run : undefined;
	return isRecord(run) ? textOf(run["working-directory"]) : undefined;
}

type ActionReader = (path: string) => string | undefined;

type LocalAction =
	| { kind: "composite"; steps: readonly unknown[] }
	| { kind: "opaque"; note: string };

function localAction(uses: string, read: ActionReader): LocalAction {
	const dir = uses.replace(/^\.\//, "").replace(/\/+$/, "");
	const text = read(`${dir}/action.yml`) ?? read(`${dir}/action.yaml`);
	if (text === undefined) return { kind: "opaque", note: "" };
	let parsed: unknown;
	try {
		parsed = Bun.YAML.parse(text);
	} catch (error) {
		return {
			kind: "opaque",
			note: ` (its action file does not parse: ${String(error)})`,
		};
	}
	const runs = isRecord(parsed) ? parsed.runs : undefined;
	if (!isRecord(runs) || runs.using !== "composite")
		return { kind: "opaque", note: "" };
	return {
		kind: "composite",
		steps: Array.isArray(runs.steps) ? runs.steps : [],
	};
}

type ReadStep = {
	readonly kind: "step";
	readonly step: CiStep;
	readonly readsResults: boolean;
};

type ReadEntry = ReadStep | { readonly kind: "pin"; readonly pin: ToolPin };

function pinOf(
	action: string,
	options: unknown,
	read: ActionReader,
): ToolPin | undefined {
	const known = TOOL_ACTIONS[action];
	if (known === undefined) return undefined;
	const given = isRecord(options) ? options : {};
	const literal = given[known.version];
	if (typeof literal === "string" || typeof literal === "number") {
		const version = String(literal).trim();
		return EXACT_VERSION.test(version)
			? {
					kind: "exact",
					tool: known.tool,
					version,
					file: undefined,
					source: `${known.version} of ${action}`,
				}
			: undefined;
	}
	const file = known.file === undefined ? undefined : textOf(given[known.file]);
	if (file === undefined) return undefined;
	const source = `${file}, the ${known.file} of ${action}`;
	const version = exactVersionInFile(known.tool, file, read(file));
	return version !== undefined
		? { kind: "exact", tool: known.tool, version, file, source }
		: { kind: "unread", tool: known.tool, source };
}

function lastPins(entries: readonly ReadEntry[]): ToolPin[] {
	const last = new Map<Tool, ToolPin>();
	for (const entry of entries)
		if (entry.kind === "pin") last.set(entry.pin.tool, entry.pin);
	return [...last.values()];
}

const NEEDS_RESULTS =
	/\$\{\{[^}]*(?:toJSON\(\s*needs\s*\)|\bneeds\.(?:[\w-]+|\*)\.result\b)/i;

function readsResults(step: Readonly<Record<string, unknown>>): boolean {
	return NEEDS_RESULTS.test(JSON.stringify([step.run, step.env, step.with]));
}

function stepsOf(
	steps: readonly unknown[],
	jobDirectory: string | undefined,
	read: ActionReader,
	seen: ReadonlySet<string>,
	runs: (condition: unknown) => boolean,
): ReadEntry[] {
	return steps.flatMap((step): ReadEntry[] => {
		if (!isRecord(step) || !runs(step.if)) return [];
		const name = textOf(step.name);
		const run = textOf(step.run);
		const env = envOf(step);
		const withEnv = Object.keys(env).length > 0 ? { env } : {};
		if (run !== undefined) {
			const command = normalizeCommand(
				run,
				textOf(step["working-directory"]) ?? jobDirectory,
			);
			const writes = envFileWrites(command);
			return [
				{
					kind: "step",
					step: {
						label: name ?? command.split("\n")[0] ?? command,
						command,
						...withEnv,
						...(writes === undefined ? {} : { writes }),
					},
					readsResults: readsResults(step),
				},
			];
		}
		const uses = textOf(step.uses);
		if (uses === undefined) return [];
		const action = actionName(uses);
		if (
			SETUP_ACTIONS.includes(action) ||
			PATH_FILTER_ACTIONS.includes(action)
		) {
			const pin = pinOf(action, step.with, read);
			return pin === undefined ? [] : [{ kind: "pin", pin }];
		}
		const opaque = (note: string): ReadStep => ({
			kind: "step",
			step: {
				label: `${name ?? uses}${note}`,
				command: `uses ${uses}`,
				...withEnv,
			},
			readsResults: readsResults(step),
		});
		if (!uses.startsWith("./") || seen.has(uses)) return [opaque("")];
		const local = localAction(uses, read);
		return local.kind === "opaque"
			? [opaque(local.note)]
			: stepsOf(local.steps, undefined, read, new Set([...seen, uses]), runs);
	});
}

function listAt(
	node: unknown,
	key: string,
	field: string,
): readonly string[] | undefined {
	const config = isRecord(node) ? node[key] : undefined;
	const list = isRecord(config) ? config[field] : undefined;
	return Array.isArray(list)
		? list.filter((item): item is string => typeof item === "string")
		: undefined;
}

function workflowPaths(on: unknown, triggers: readonly string[]): CiPaths {
	if (triggers.length === 0) return { kind: "any" };
	const only = triggers.map((event) => listAt(on, event, "paths"));
	const selects = only.flatMap((globs) =>
		(globs ?? []).filter((glob) => !glob.startsWith("!")),
	);
	if (only.every((globs) => globs !== undefined) && selects.length > 0)
		return {
			kind: "only",
			globs: [...new Set(selects)],
			source: `on.${triggers.join(", on.")} paths`,
		};
	const [event] = triggers;
	const ignore = listAt(on, event ?? "", "paths-ignore");
	return triggers.length === 1 && ignore !== undefined
		? { kind: "except", globs: ignore, source: `on.${event} paths-ignore` }
		: { kind: "any" };
}

function filterGlobs(rule: unknown): readonly string[] | undefined {
	const items: readonly unknown[] = Array.isArray(rule) ? rule : [rule];
	const globs = items.flatMap((item): unknown[] =>
		isRecord(item)
			? Object.values(item).flatMap((value) =>
					Array.isArray(value) ? value : [value],
				)
			: [item],
	);
	if (!globs.every((glob): glob is string => typeof glob === "string"))
		return undefined;
	return globs.some((glob) => glob.startsWith("!")) ? undefined : globs;
}

function filtersOf(step: Readonly<Record<string, unknown>>): unknown {
	const filters = isRecord(step.with) ? step.with.filters : undefined;
	if (typeof filters !== "string") return filters;
	try {
		return Bun.YAML.parse(filters);
	} catch {
		return undefined;
	}
}

type FilterOutputs = ReadonlyMap<string, readonly string[] | undefined>;

function filterOutputs(job: unknown): FilterOutputs {
	if (!isRecord(job) || !isRecord(job.outputs)) return new Map();
	const steps = Array.isArray(job.steps) ? job.steps.filter(isRecord) : [];
	return new Map(
		Object.entries(job.outputs).flatMap(
			([output, value]): [string, readonly string[] | undefined][] => {
				const source =
					typeof value === "string"
						? /^\$\{\{\s*steps\.([\w-]+)\.outputs\.([\w-]+)\s*\}\}$/.exec(
								value.trim(),
							)
						: null;
				const filter = steps.find(
					(step) =>
						step.id === source?.[1] &&
						typeof step.uses === "string" &&
						PATH_FILTER_ACTIONS.includes(actionName(step.uses)),
				);
				if (source === null || filter === undefined) return [];
				const rules = filtersOf(filter);
				const name = source[2] ?? "";
				return [
					[output, isRecord(rules) ? filterGlobs(rules[name]) : undefined],
				];
			},
		),
	);
}

function filteredPaths(
	condition: unknown,
	outputs: ReadonlyMap<string, FilterOutputs>,
	scenarios: readonly Scenario[],
): CiPaths | undefined {
	const reads = outputsRead(condition).flatMap((read) => {
		const globs = outputs.get(read.job);
		return globs?.has(read.output)
			? [{ ...read, globs: globs.get(read.output) }]
			: [];
	});
	if (reads.length === 0) return undefined;
	const assumptions = Object.fromEntries(
		reads.map((read) => [`needs.${read.job}.outputs.${read.output}`, "false"]),
	);
	if (canRun(condition, scenarios, assumptions)) return undefined;
	const globs = reads.flatMap((read) => read.globs ?? []);
	return reads.every((read) => read.globs !== undefined)
		? {
				kind: "only",
				globs: [...new Set(globs)],
				source: reads
					.map((read) => `needs.${read.job}.outputs.${read.output}`)
					.join(", "),
			}
		: { kind: "any" };
}

function needsOf(job: Readonly<Record<string, unknown>>): string[] {
	const needs = job.needs;
	if (typeof needs === "string") return [needs];
	return Array.isArray(needs)
		? needs.filter((item): item is string => typeof item === "string")
		: [];
}

function readWorkflow(
	path: string,
	text: string,
	read: ActionReader,
): Result<CiWorkflow, string> {
	let parsed: unknown;
	try {
		parsed = Bun.YAML.parse(text);
	} catch (error) {
		return err(`${path} does not parse: ${String(error)}`);
	}
	if (!isRecord(parsed)) return err(`${path} is not a mapping`);
	const file = basename(path);
	const jobs = isRecord(parsed.jobs) ? parsed.jobs : {};
	const workflowEnv = envOf(parsed);
	const workflowDirectory = defaultDirectory(parsed);
	const triggers = triggersOf(parsed.on);
	const prTriggers = triggers.filter((trigger) =>
		PULL_REQUEST_TRIGGERS.includes(trigger),
	);
	const scenarios = pullRequestScenarios(parsed.on, prTriggers);
	const runs = (condition: unknown) =>
		scenarios.length === 0 || canRun(condition, scenarios);
	const paths = workflowPaths(parsed.on, prTriggers);
	const outputs = new Map(
		Object.entries(jobs).map(([id, job]) => [id, filterOutputs(job)]),
	);
	return ok({
		file,
		triggers,
		jobs: Object.entries(jobs).map(([id, job]): CiJob => {
			const node = isRecord(job) ? job : {};
			const entries = Array.isArray(node.steps)
				? stepsOf(
						node.steps,
						defaultDirectory(node) ?? workflowDirectory,
						read,
						new Set(),
						runs,
					)
				: [];
			const steps = entries.flatMap((entry) =>
				entry.kind === "step" ? [entry] : [],
			);
			return {
				id: `${file}#${id}`,
				env: { ...envOf(node.container), ...workflowEnv, ...envOf(node) },
				services: servicesOf(node),
				steps: steps.map((entry) => entry.step),
				pins: lastPins(entries),
				needs: needsOf(node).map((need) => `${file}#${need}`),
				continueOnError: node["continue-on-error"] === true,
				runsOnPullRequest: scenarios.length > 0 && canRun(node.if, scenarios),
				aggregates:
					steps.length > 0 && steps.every((entry) => entry.readsResults),
				paths: filteredPaths(node.if, outputs, scenarios) ?? paths,
			};
		}),
	});
}

export function readWorkflows(
	files: readonly { path: string; text: string }[],
	readAction: ActionReader,
): { workflows: CiWorkflow[]; problems: string[] } {
	const read = files.map((file) =>
		readWorkflow(file.path, file.text, readAction),
	);
	return {
		workflows: read.flatMap((entry) => (entry.ok ? [entry.value] : [])),
		problems: read.flatMap((entry) => (entry.ok ? [] : [entry.error])),
	};
}

function stepName(step: CiStep): string {
	const lines = step.command.split("\n").length;
	return lines === 1
		? step.command
		: `${step.label} (a script of ${lines} lines)`;
}

function namesStep(entry: { step?: string }, step: CiStep): boolean {
	return entry.step === step.label || entry.step === step.command;
}

const STACK_START = /^astack stack start .* --run "([^"]+)"$/;

const DISCARDED_STDOUT = /\s+1?>\s*\/dev\/null$/;

function preparedCommand(entry: string): string {
	const run = STACK_START.exec(entry)?.[1] ?? entry;
	return run
		.split("&&")
		.map((part) => part.trim().replace(DISCARDED_STDOUT, ""))
		.join(" && ");
}

type MapEntry = CiParityConfig["map"][number];

type StepRoute =
	| { kind: "excluded"; reason: string }
	| { kind: "mapped"; entry: MapEntry }
	| { kind: "gates"; gates: readonly string[] }
	| { kind: "prepares" }
	| { kind: "uncovered" };

function routeGates(route: StepRoute): readonly string[] {
	switch (route.kind) {
		case "mapped":
			return route.entry.gates;
		case "gates":
			return route.gates;
		case "excluded":
		case "prepares":
		case "uncovered":
			return [];
		default: {
			const unhandled: never = route;
			return unhandled;
		}
	}
}

function stepRoute(
	job: CiJob,
	step: CiStep,
	gates: readonly ProfileGate[],
	config: CiParityConfig,
	setup: ReadonlySet<string>,
): StepRoute {
	const ofStep = (entry: { job: string; step?: string }) =>
		entry.job === job.id && namesStep(entry, step);
	const exclusion = config.exclude.find(ofStep);
	if (exclusion !== undefined)
		return { kind: "excluded", reason: exclusion.reason };
	const mapping = config.map.find(ofStep);
	if (mapping !== undefined) return { kind: "mapped", entry: mapping };
	const gate = gates.find(
		(entry) => normalizeCommand(entry.command) === step.command,
	);
	if (gate !== undefined) return { kind: "gates", gates: [gate.name] };
	const prepares =
		setup.has(step.command) ||
		gates.some((entry) =>
			entry.preparation.some(
				(command) =>
					normalizeCommand(preparedCommand(command)) === step.command,
			),
		);
	return prepares ? { kind: "prepares" } : { kind: "uncovered" };
}

function verdictByCommand(
	job: CiJob,
	gates: readonly ProfileGate[],
	config: CiParityConfig,
	setup: ReadonlySet<string>,
): JobVerdict {
	const matched: string[] = [];
	const uncovered: string[] = [];
	for (const step of job.steps) {
		const route = stepRoute(job, step, gates, config, setup);
		switch (route.kind) {
			case "excluded":
			case "prepares":
				break;
			case "mapped":
			case "gates":
				for (const name of routeGates(route))
					if (!matched.includes(name)) matched.push(name);
				break;
			case "uncovered":
				uncovered.push(stepName(step));
				break;
			default: {
				const unhandled: never = route;
				return unhandled;
			}
		}
	}
	return uncovered.length === 0 && matched.length > 0
		? { kind: "mapped", job: job.id, via: "command", gates: matched }
		: { kind: "unmapped", job: job.id, uncovered };
}

const RUNNER_ENV: CiEnv = { CI: "true" };

type EnvSource = {
	readonly gate: string;
	readonly name: string;
	readonly value: string;
	readonly source: string;
};

function envSources(
	job: CiJob,
	verdict: JobVerdict,
	gates: readonly ProfileGate[],
	config: CiParityConfig,
	setup: ReadonlySet<string>,
): EnvSource[] {
	if (verdict.kind !== "mapped") return [];
	const routed = (gate: string): readonly CiStep[] =>
		job.steps.filter((step) => {
			const route = stepRoute(job, step, gates, config, setup);
			return route.kind === "uncovered" || routeGates(route).includes(gate);
		});
	return verdict.gates.flatMap((gate) => {
		const steps = routed(gate).flatMap((step) =>
			Object.entries(step.env ?? {}).map(([name, value]) => ({
				gate,
				name,
				value,
				source: `${job.id} step "${step.label}"`,
			})),
		);
		const fromSteps = new Set(steps.map((entry) => entry.name));
		const jobLevel: EnvSource[] = [
			...Object.entries({ ...RUNNER_ENV, ...job.env }).map(([name, value]) => ({
				gate,
				name,
				value,
				source: job.id,
			})),
			...job.steps.flatMap((step) =>
				Object.entries(step.writes?.names ?? {}).map(([name, value]) => ({
					gate,
					name,
					value,
					source: `${job.id} step "${step.label}" through $GITHUB_ENV`,
				})),
			),
		];
		const fromJob = [
			...new Map(jobLevel.map((entry) => [entry.name, entry])).values(),
		].filter((entry) => !fromSteps.has(entry.name));
		const fromServices = job.services.flatMap((service) =>
			Object.entries(service.env).map(([name, value]) => ({
				gate,
				name,
				value,
				source: `${job.id} service "${service.id}"`,
			})),
		);
		return [...fromJob, ...steps, ...fromServices];
	});
}

const SHELL_OPTIONS = /^set(?:\s+[-+][A-Za-z]+(?:\s+[a-z]+)?)+$/;

const KEYWORD_OPENER = /^(?:then|do|else)\s+/;

const BRACKETS: readonly (readonly [string, string])[] = [
	["(", ")"],
	["{", "}"],
];

function count(text: string, char: string): number {
	return text.split(char).length - 1;
}

function stripBrackets(text: string): string {
	return BRACKETS.reduce((current, [open, close]) => {
		const extra = count(current, open) - count(current, close);
		if (extra > 0 && current.startsWith(open)) return current.slice(1);
		if (extra < 0 && current.endsWith(close)) return current.slice(0, -1);
		return current;
	}, text);
}

const KEYWORDS: ReadonlySet<string> = new Set([
	"then",
	"do",
	"else",
	"fi",
	"done",
	"esac",
]);

function pieceCore(piece: string): string {
	const text = piece.trim();
	const next = stripBrackets(text.replace(KEYWORD_OPENER, ""))
		.replace(DISCARDED_STDOUT, "")
		.trim();
	if (next !== text) return pieceCore(next);
	return KEYWORDS.has(text) ? "" : text;
}

type Quote = "'" | '"' | undefined;

function lineCommands(line: string): string[] {
	const pieces: string[] = [];
	let current = "";
	let quote: Quote;
	for (let index = 0; index < line.length; index += 1) {
		const char = line[index] ?? "";
		const next = line[index + 1] ?? "";
		if (char === "\\" && quote !== "'") {
			current += char + next;
			index += 1;
		} else if (quote !== undefined) {
			current += char;
			if (char === quote) quote = undefined;
		} else if (char === "'" || char === '"') {
			current += char;
			quote = char;
		} else if (char === ";" || (char === "&" && next === "&")) {
			pieces.push(current);
			current = "";
			if (char === "&") index += 1;
		} else current += char;
	}
	return [...pieces, current];
}

function commandPieces(command: string): string[] {
	return normalizeCommand(STACK_START.exec(command)?.[1] ?? command)
		.split("\n")
		.flatMap(lineCommands)
		.map((piece) => scriptForm(pieceCore(piece)))
		.filter((piece) => piece !== "" && !SHELL_OPTIONS.test(piece));
}

function missingPieces(
	step: CiStep,
	names: readonly string[],
	gates: readonly ProfileGate[],
	config: CiParityConfig,
): string[] {
	const run = new Set(
		[
			...config.setup.map((entry) => entry.command),
			...gates
				.filter((gate) => names.includes(gate.name))
				.flatMap((gate) => [gate.command, ...gate.preparation]),
		].flatMap(commandPieces),
	);
	return [
		...new Set(commandPieces(step.command).filter((piece) => !run.has(piece))),
	];
}

function mappedSteps(
	job: CiJob,
	verdict: JobVerdict,
	gates: readonly ProfileGate[],
	config: CiParityConfig,
	setup: ReadonlySet<string>,
): { entry: MapEntry; step: CiStep }[] {
	if (verdict.kind === "mapped" && verdict.via === "config") {
		const entry = config.map.find(
			(item) => item.job === job.id && item.step === undefined,
		);
		if (entry === undefined) return [];
		return job.steps
			.filter(
				(step) =>
					stepRoute(job, step, gates, config, setup).kind === "uncovered",
			)
			.map((step) => ({ entry, step }));
	}
	if (verdict.kind !== "mapped" && verdict.kind !== "unmapped") return [];
	return job.steps.flatMap((step) => {
		const route = stepRoute(job, step, gates, config, setup);
		return route.kind === "mapped" ? [{ entry: route.entry, step }] : [];
	});
}

function stepVerdicts(
	jobs: readonly CiJob[],
	verdicts: readonly JobVerdict[],
	gates: readonly ProfileGate[],
	config: CiParityConfig,
	setup: ReadonlySet<string>,
): { verdicts: StepVerdict[]; staleDiffers: readonly MapEntry[] } {
	const live = new Set<MapEntry>();
	const differing = new Set<MapEntry>();
	const found = jobs.flatMap((job, index): StepVerdict[] => {
		const verdict = verdicts[index];
		if (verdict === undefined) return [];
		if (verdict.kind === "mapped" && verdict.via === "config")
			for (const entry of config.map)
				if (entry.job === job.id && entry.step === undefined) live.add(entry);
		const pairs = mappedSteps(job, verdict, gates, config, setup);
		for (const { entry } of pairs) live.add(entry);
		return pairs.flatMap(({ entry, step }): StepVerdict[] => {
			const missing = missingPieces(step, entry.gates, gates, config);
			if (missing.length === 0) return [];
			differing.add(entry);
			const shared = {
				job: job.id,
				step: step.label,
				gates: entry.gates,
				missing,
			};
			return [
				entry.differs === undefined
					? { kind: "unrecorded", ...shared }
					: { kind: "differs", ...shared, reason: entry.differs },
			];
		});
	});
	const staleDiffers = config.map.filter(
		(entry) =>
			entry.differs !== undefined && live.has(entry) && !differing.has(entry),
	);
	return { verdicts: found, staleDiffers };
}

function orderVerdicts(
	jobs: readonly CiJob[],
	verdicts: readonly JobVerdict[],
	gates: readonly ProfileGate[],
	config: CiParityConfig,
	setup: ReadonlySet<string>,
): OrderVerdict[] {
	const position = (name: string) =>
		gates.findIndex((gate) => gate.name === name);
	return jobs.flatMap((job, index): OrderVerdict[] => {
		const verdict = verdicts[index];
		if (verdict?.kind !== "mapped" || verdict.via !== "command") return [];
		const last = new Map<string, number>();
		job.steps.forEach((step, at) => {
			for (const name of routeGates(stepRoute(job, step, gates, config, setup)))
				last.set(name, at);
		});
		const ran = [...last.entries()].filter(([name]) => position(name) >= 0);
		return ran.flatMap(([first, firstAt]) =>
			ran.flatMap(([second, secondAt]): OrderVerdict[] => {
				if (firstAt >= secondAt || position(first) < position(second))
					return [];
				const test = gates.find((gate) => gate.name === first)?.test === true;
				return [
					test
						? { kind: "test-last", job: job.id, test: first, later: second }
						: { kind: "reversed", job: job.id, first, second },
				];
			}),
		);
	});
}

function exportVerdicts(
	jobs: readonly CiJob[],
	verdicts: readonly JobVerdict[],
	gates: readonly ProfileGate[],
	config: CiParityConfig,
	setup: ReadonlySet<string>,
): ExportVerdict[] {
	return jobs.flatMap((job, index) => {
		const verdict = verdicts[index];
		if (verdict?.kind !== "mapped") return [];
		return job.steps.flatMap((step): ExportVerdict[] => {
			if (step.writes?.unread !== true) return [];
			const route = stepRoute(job, step, gates, config, setup);
			const reason =
				route.kind === "mapped"
					? route.entry.reason
					: route.kind === "excluded"
						? route.reason
						: verdict.via === "config"
							? verdict.reason
							: undefined;
			const shared = { job: job.id, step: step.label };
			return [
				reason === undefined
					? { kind: "unread", ...shared }
					: { kind: "reviewed", ...shared, reason },
			];
		});
	});
}

function namesPort(gate: ProfileGate, port: string): boolean {
	const pattern = new RegExp(`\\b${port}\\b`);
	const whys = gate.ciEnv.flatMap((entry) =>
		entry.kind === "copy" ? [] : [entry.why],
	);
	return [gate.command, ...gate.preparation, ...whys].some((text) =>
		pattern.test(text),
	);
}

function serviceVerdicts(
	jobs: readonly CiJob[],
	verdicts: readonly JobVerdict[],
	gates: readonly ProfileGate[],
): ServiceVerdict[] {
	return jobs.flatMap((job, index) => {
		const verdict = verdicts[index];
		if (verdict?.kind !== "mapped") return [];
		const own = gates.filter((gate) => verdict.gates.includes(gate.name));
		return job.services.flatMap((service) =>
			service.ports.map((port): ServiceVerdict => {
				const shared = { job: job.id, service: service.id, port };
				const gate = own.find((entry) => namesPort(entry, port));
				return gate === undefined
					? { kind: "unchecked", ...shared }
					: { kind: "checked", ...shared, gate: gate.name };
			}),
		);
	});
}

function gateEnvVerdicts(
	gate: ProfileGate,
	sources: readonly EnvSource[],
): EnvVerdict[] {
	const names = [...new Set(sources.map((entry) => entry.name))];
	const verdicts = names.flatMap((name): EnvVerdict[] => {
		const ci = sources.filter((entry) => entry.name === name);
		const copied: EnvVerdict[] = [{ kind: "copied", gate: gate.name, name }];
		const entry = gate.ciEnv.find((item) => item.name === name);
		if (entry !== undefined && entry.kind !== "copy")
			return [{ kind: "overridden", gate: gate.name, entry }];
		if (entry !== undefined) {
			const differ = ci.filter((item) => item.value !== entry.value);
			if (differ.length === 0) return copied;
			return differ.map((item) => ({
				kind: "differs",
				gate: gate.name,
				name,
				value: entry.value,
				source: item.source,
				ci: item.value,
			}));
		}
		if (gate.sessionEnv.includes(name))
			return [{ kind: "session", gate: gate.name, name }];
		const runner = RUNNER_ENV[name];
		if (runner !== undefined && ci.every((item) => item.value === runner))
			return copied;
		return ci.map((item) => ({
			kind: "missing",
			gate: gate.name,
			name,
			source: item.source,
			ci: item.value,
		}));
	});
	const stale = gate.ciEnv
		.filter((entry) => entry.kind === "copy" && !names.includes(entry.name))
		.map(
			(entry): EnvVerdict => ({
				kind: "stale",
				gate: gate.name,
				name: entry.name,
			}),
		);
	return [...verdicts, ...stale];
}

const GLOB_CHARACTERS = /[*?[\]{}!]/;

function isLiteral(glob: string): boolean {
	return !GLOB_CHARACTERS.test(glob);
}

function covers(outer: string, inner: string): boolean {
	if (outer === inner || outer === "**") return true;
	if (isLiteral(inner)) return new Bun.Glob(outer).match(inner);
	const base = outer.endsWith("/**") ? outer.slice(0, -2) : undefined;
	return base !== undefined && isLiteral(base) && inner.startsWith(base);
}

function disjoint(left: string, right: string): boolean {
	const a = left.split("/");
	const b = right.split("/");
	const depth = Math.min(a.length, b.length);
	for (let index = 0; index < depth; index += 1) {
		const x = a[index] ?? "";
		const y = b[index] ?? "";
		if (x === "**" || y === "**") return false;
		if (isLiteral(x) && isLiteral(y) && x !== y) return true;
	}
	return false;
}

function overlaps(left: string, right: string): boolean {
	if (isLiteral(right)) return new Bun.Glob(left).match(right);
	if (isLiteral(left)) return new Bun.Glob(right).match(left);
	return !disjoint(left, right);
}

export function gateCovers(
	whenChanged: readonly string[],
	job: CiPaths,
): boolean {
	if (whenChanged.length === 0) return true;
	const selects = whenChanged.filter((glob) => !glob.startsWith("!"));
	const skips = whenChanged
		.filter((glob) => glob.startsWith("!"))
		.map((glob) => glob.slice(1));
	switch (job.kind) {
		case "any":
			return selects.includes("**") && skips.length === 0;
		case "only":
			return job.globs.every(
				(glob) =>
					selects.some((select) => covers(select, glob)) &&
					!skips.some((skip) => overlaps(skip, glob)),
			);
		case "except":
			return (
				selects.includes("**") &&
				skips.every((skip) =>
					job.globs.some((ignored) => covers(ignored, skip)),
				)
			);
		default: {
			const unhandled: never = job;
			return unhandled;
		}
	}
}

function exclusionProof(
	job: CiJob,
	mapped: ReadonlySet<string>,
): string | undefined {
	if (job.continueOnError) return "continue-on-error is true";
	if (!job.runsOnPullRequest)
		return "its if condition is false on a pull request that has no label";
	if (job.steps.length === 0) return "it runs no command";
	const aggregatesMapped =
		job.aggregates &&
		job.needs.length > 0 &&
		job.needs.every((need) => mapped.has(need));
	return aggregatesMapped
		? `it only reads the results of ${job.needs.join(", ")}, which map to gates`
		: undefined;
}

function pathVerdicts(
	jobs: readonly CiJob[],
	verdicts: readonly JobVerdict[],
	gates: readonly ProfileGate[],
	narrow: NonNullable<CiParityConfig["narrow"]>,
): PathVerdict[] {
	return verdicts.flatMap((verdict): PathVerdict[] => {
		const job = jobs.find((entry) => entry.id === verdict.job);
		if (verdict.kind !== "mapped" || job === undefined) return [];
		return verdict.gates.flatMap((name): PathVerdict[] => {
			const gate = gates.find((entry) => entry.name === name);
			if (gate === undefined || gateCovers(gate.whenChanged, job.paths))
				return [];
			const allowed = narrow.find(
				(entry) => entry.job === job.id && entry.gates.includes(name),
			);
			return [
				allowed === undefined
					? {
							kind: "narrower",
							job: job.id,
							gate: name,
							jobPaths: job.paths,
							gatePaths: gate.whenChanged,
						}
					: {
							kind: "allowed",
							job: job.id,
							gate: name,
							reason: allowed.reason,
						},
			];
		});
	});
}

function configProblems(
	config: CiParityConfig,
	jobs: readonly CiJob[],
	verdicts: readonly JobVerdict[],
	gates: readonly ProfileGate[],
	paths: readonly PathVerdict[],
	staleDiffers: readonly MapEntry[],
): string[] {
	const ids = new Set(jobs.map((job) => job.id));
	const allSteps = jobs.flatMap((job) => job.steps);
	const gateNames = new Set(gates.map((gate) => gate.name));
	const problems: string[] = [];
	for (const entry of config.setup) {
		const command = normalizeCommand(entry.command);
		if (!allSteps.some((step) => step.command === command))
			problems.push(`the setup command ${entry.command} matches no CI step`);
	}
	const stale = (job: string) => {
		if (!ids.has(job))
			problems.push(`${job} is not a job of a pull request workflow`);
	};
	for (const entry of config.map) {
		stale(entry.job);
		for (const gate of entry.gates)
			if (!gateNames.has(gate))
				problems.push(
					`${entry.job} names ${gate}, which the profile does not define`,
				);
	}
	const jobExclusions = config.exclude.filter(
		(entry) => entry.step === undefined,
	);
	for (const entry of jobExclusions) stale(entry.job);
	const seen = new Set<string>();
	const jobEntries = [...config.map, ...jobExclusions].filter(
		(entry) => entry.step === undefined,
	);
	for (const { job } of jobEntries) {
		if (seen.has(job)) problems.push(`${job} has more than one entry`);
		seen.add(job);
	}
	const readByCommand = new Set(
		verdicts
			.filter(
				(verdict) =>
					verdict.kind === "unmapped" ||
					(verdict.kind === "mapped" && verdict.via === "command"),
			)
			.map((verdict) => verdict.job),
	);
	const stepEntries = [
		...config.map.map((entry) => ({ ...entry, kind: "mapping" })),
		...config.exclude.map((entry) => ({ ...entry, kind: "exclusion" })),
	];
	for (const entry of stepEntries) {
		if (entry.step === undefined) continue;
		const steps = jobs.find((job) => job.id === entry.job)?.steps ?? [];
		const live =
			readByCommand.has(entry.job) &&
			steps.some((step) => namesStep(entry, step));
		if (!live)
			problems.push(
				`the ${entry.kind} of step ${entry.step} in ${entry.job} matches no step that the check reads`,
			);
	}
	for (const entry of staleDiffers)
		problems.push(
			`the differs reason of ${entry.step === undefined ? entry.job : `step ${entry.step} in ${entry.job}`} matches no step whose commands its gates do not run`,
		);
	for (const entry of config.narrow ?? []) {
		stale(entry.job);
		for (const gate of entry.gates) {
			const allowed = paths.some(
				(verdict) =>
					verdict.kind === "allowed" &&
					verdict.job === entry.job &&
					verdict.gate === gate,
			);
			if (!allowed)
				problems.push(
					`the narrow entry of ${gate} in ${entry.job} matches no gate of the job that runs on fewer paths than the job`,
				);
		}
	}
	return problems.map((problem) => `projects config: ${problem}`);
}

function checksPin(gate: ProfileGate, pin: ExactPin): boolean {
	const runs = new RegExp(`\\b${pin.tool}(?:\\s+--version|@)`);
	return [gate.command, ...gate.preparation].some(
		(text) =>
			runs.test(text) &&
			(text.includes(pin.version) ||
				(pin.file !== undefined && text.includes(pin.file))),
	);
}

function bareVersion(version: string): string {
	return version.replace(/^v/, "");
}

function pinVerdict(
	gate: ProfileGate,
	job: string,
	pin: ExactPin,
): ToolchainVerdict {
	const { tool } = pin;
	if (!isGateTool(tool))
		return checksPin(gate, pin)
			? { kind: "pinned", gate: gate.name, job, pin }
			: { kind: "unpinned", gate: gate.name, job, pin };
	const recorded = gate.tools.find((entry) => entry.tool === tool);
	if (recorded === undefined)
		return { kind: "unpinned", gate: gate.name, job, pin };
	return recorded.version === bareVersion(pin.version)
		? { kind: "pinned", gate: gate.name, job, pin }
		: {
				kind: "differs",
				gate: gate.name,
				job,
				pin,
				recorded: recorded.version,
			};
}

function staleTools(
	jobs: readonly CiJob[],
	verdicts: readonly JobVerdict[],
	gates: readonly ProfileGate[],
): ToolchainVerdict[] {
	const mapped = jobs.flatMap((job, index) => {
		const verdict = verdicts[index];
		return verdict?.kind === "mapped"
			? verdict.gates.map((gate) => ({ gate, job }))
			: [];
	});
	const pinned = new Set(
		mapped.flatMap(({ gate, job }) =>
			job.pins.map((pin) => `${gate} ${pin.tool}`),
		),
	);
	const profilePins = mapped.flatMap(({ job }) =>
		job.pins.flatMap((pin) =>
			pin.kind === "exact"
				? [{ job: job.id, tool: pin.tool, version: bareVersion(pin.version) }]
				: [],
		),
	);
	return gates
		.filter((gate) => mapped.some((entry) => entry.gate === gate.name))
		.flatMap((gate) =>
			gate.tools.flatMap((entry): ToolchainVerdict[] => {
				if (pinned.has(`${gate.name} ${entry.tool}`)) return [];
				const stale: ToolchainVerdict = {
					kind: "stale",
					gate: gate.name,
					...entry,
				};
				if (!gate.preparation.some((text) => runsTool(text, entry.tool)))
					return [stale];
				const same = profilePins.find(
					(pin) => pin.tool === entry.tool && pin.version === entry.version,
				);
				if (same !== undefined)
					return [
						{ kind: "borrowed", gate: gate.name, ...entry, job: same.job },
					];
				const other = profilePins.find((pin) => pin.tool === entry.tool);
				return other === undefined
					? [stale]
					: [
							{
								kind: "unmatched",
								gate: gate.name,
								...entry,
								example: { job: other.job, version: other.version },
							},
						];
			}),
		);
}

function toolchainVerdicts(
	jobs: readonly CiJob[],
	verdicts: readonly JobVerdict[],
	gates: readonly ProfileGate[],
): ToolchainVerdict[] {
	const seen = new Set<string>();
	const pins = jobs.flatMap((job, index) => {
		const verdict = verdicts[index];
		if (verdict?.kind !== "mapped") return [];
		return job.pins.flatMap((pin): ToolchainVerdict[] => {
			if (pin.kind === "unread") return [{ kind: "unread", job: job.id, pin }];
			return verdict.gates.flatMap((name): ToolchainVerdict[] => {
				const gate = gates.find((entry) => entry.name === name);
				const key = `${name} ${pin.tool} ${pin.version}`;
				if (gate === undefined || seen.has(key)) return [];
				seen.add(key);
				return [pinVerdict(gate, job.id, pin)];
			});
		});
	});
	return [...pins, ...staleTools(jobs, verdicts, gates)];
}

export function checkCiParity(input: {
	workflows: readonly CiWorkflow[];
	readProblems: readonly string[];
	gates: readonly ProfileGate[];
	config: CiParityConfig;
}): ParityReport {
	const { workflows, gates, config } = input;
	const pullRequest = workflows.filter((workflow) =>
		workflow.triggers.some((trigger) =>
			PULL_REQUEST_TRIGGERS.includes(trigger),
		),
	);
	const jobs = pullRequest.flatMap((workflow) => workflow.jobs);
	const setup = new Set(
		config.setup.map((entry) => normalizeCommand(entry.command)),
	);
	const exclusionOf = (job: CiJob) =>
		config.exclude.find(
			(entry) => entry.job === job.id && entry.step === undefined,
		);
	const mapVerdict = (job: CiJob): JobVerdict => {
		const mapped = config.map.find(
			(entry) => entry.job === job.id && entry.step === undefined,
		);
		if (mapped !== undefined)
			return {
				kind: "mapped",
				job: job.id,
				via: "config",
				gates: mapped.gates,
				reason: mapped.reason,
			};
		return verdictByCommand(job, gates, config, setup);
	};
	const mapped = new Set(
		jobs
			.filter((job) => exclusionOf(job) === undefined)
			.map(mapVerdict)
			.flatMap((verdict) => (verdict.kind === "mapped" ? [verdict.job] : [])),
	);
	const verdicts = jobs.map((job): JobVerdict => {
		const excluded = exclusionOf(job);
		if (excluded === undefined) return mapVerdict(job);
		const proof = exclusionProof(job, mapped);
		return proof === undefined
			? { kind: "unproven", job: job.id, reason: excluded.reason }
			: { kind: "excluded", job: job.id, proof, reason: excluded.reason };
	});
	const paths = pathVerdicts(jobs, verdicts, gates, config.narrow ?? []);
	const steps = stepVerdicts(jobs, verdicts, gates, config, setup);
	const sources = jobs.flatMap((job, index) => {
		const verdict = verdicts[index];
		return verdict === undefined
			? []
			: envSources(job, verdict, gates, config, setup);
	});
	return {
		pullRequest: pullRequest.map((workflow) => workflow.file),
		other: workflows
			.filter((workflow) => !pullRequest.includes(workflow))
			.map((workflow) => ({
				file: workflow.file,
				triggers: workflow.triggers,
			})),
		jobs: verdicts,
		steps: steps.verdicts,
		order: orderVerdicts(jobs, verdicts, gates, config, setup),
		paths,
		env: gates.flatMap((gate) =>
			gateEnvVerdicts(
				gate,
				sources.filter((entry) => entry.gate === gate.name),
			),
		),
		exports: exportVerdicts(jobs, verdicts, gates, config, setup),
		services: serviceVerdicts(jobs, verdicts, gates),
		toolchain: toolchainVerdicts(jobs, verdicts, gates),
		problems: [
			...input.readProblems,
			...configProblems(
				config,
				jobs,
				verdicts,
				gates,
				paths,
				steps.staleDiffers,
			),
		],
	};
}

function describePaths(paths: CiPaths): string {
	switch (paths.kind) {
		case "any":
			return "every pull request";
		case "only":
			return `a change to ${paths.globs.join(", ")} (${paths.source})`;
		case "except":
			return `a change outside ${paths.globs.join(", ")} (${paths.source})`;
		default: {
			const unhandled: never = paths;
			return unhandled;
		}
	}
}

const EXPRESSION = /\$(?:\{\{|\{?[A-Za-z_]|\()/;

function shown(value: string): string {
	return value === "" ? '""' : value;
}

function ciValue(value: string): string {
	return EXPRESSION.test(value) ? `from ${value}` : `to ${shown(value)}`;
}

function envFailure(verdict: EnvVerdict): string | undefined {
	switch (verdict.kind) {
		case "copied":
		case "session":
		case "overridden":
			return undefined;
		case "missing":
			return EXPRESSION.test(verdict.ci)
				? `${verdict.gate} does not set ${verdict.name}, which ${verdict.source} sets ${ciValue(verdict.ci)}. Add ${verdict.name} to the env of the gate, or give it a ci_env entry with a why.`
				: `${verdict.gate} does not set ${verdict.name}, which ${verdict.source} sets ${ciValue(verdict.ci)}. Copy the value into the ci_env of the gate, or give a why to leave it out.`;
		case "differs":
			return `${verdict.gate} sets ${verdict.name} to ${shown(verdict.value)}, but ${verdict.source} sets it ${ciValue(verdict.ci)}. Copy the CI value, or give a why.`;
		case "stale":
			return `${verdict.gate} sets ${verdict.name} with no why, but no CI job of the gate sets it. Remove it, or give a why.`;
		default: {
			const unhandled: never = verdict;
			return unhandled;
		}
	}
}

function quoted(commands: readonly string[]): string {
	return commands.map((command) => `\`${command}\``).join(", ");
}

function stepFailure(verdict: StepVerdict): string | undefined {
	switch (verdict.kind) {
		case "differs":
			return undefined;
		case "unrecorded":
			return `${verdict.job} step "${verdict.step}" maps to ${verdict.gates.join(", ")} in the project config, but no mapped gate runs ${quoted(verdict.missing)}. Run the same commands in a gate, or give the map entry a differs reason.`;
		default: {
			const unhandled: never = verdict;
			return unhandled;
		}
	}
}

function stepLine(verdict: StepVerdict): string {
	switch (verdict.kind) {
		case "differs":
			return `- DIFFERS ${verdict.job} step "${verdict.step}", mapped to ${verdict.gates.join(", ")}. No mapped gate runs ${quoted(verdict.missing)}. ${verdict.reason}`;
		case "unrecorded":
			return `- UNRECORDED ${stepFailure(verdict)}`;
		default: {
			const unhandled: never = verdict;
			return unhandled;
		}
	}
}

function orderFailure(verdict: OrderVerdict): string | undefined {
	switch (verdict.kind) {
		case "reversed":
			return `${verdict.job} runs ${verdict.first} before ${verdict.second}, but the profile lists ${verdict.second} first. Put ${verdict.first} before ${verdict.second} in the gates of the profile, so the run keeps the order of CI.`;
		case "test-last":
			return undefined;
		default: {
			const unhandled: never = verdict;
			return unhandled;
		}
	}
}

function orderLine(verdict: OrderVerdict): string {
	switch (verdict.kind) {
		case "reversed":
			return `- ORDER ${orderFailure(verdict)}`;
		case "test-last":
			return `- ${verdict.job} runs the test gate ${verdict.test} before ${verdict.later}, and the run always runs the test gate last.`;
		default: {
			const unhandled: never = verdict;
			return unhandled;
		}
	}
}

function exportFailure(verdict: ExportVerdict): string | undefined {
	switch (verdict.kind) {
		case "reviewed":
			return undefined;
		case "unread":
			return `${verdict.job} step "${verdict.step}" writes to $GITHUB_ENV with a command that the check cannot read. Write each name with echo "NAME=value", or map or exclude the step in the project config with a reason that says how each gate gets the names.`;
		default: {
			const unhandled: never = verdict;
			return unhandled;
		}
	}
}

function exportLine(verdict: ExportVerdict): string {
	switch (verdict.kind) {
		case "reviewed":
			return `- ${verdict.job} step "${verdict.step}" writes names to $GITHUB_ENV that the check cannot read. ${verdict.reason}`;
		case "unread":
			return `- ENV ${exportFailure(verdict)}`;
		default: {
			const unhandled: never = verdict;
			return unhandled;
		}
	}
}

function serviceFailure(verdict: ServiceVerdict): string | undefined {
	switch (verdict.kind) {
		case "checked":
			return undefined;
		case "unchecked":
			return `No gate of ${verdict.job} names port ${verdict.port} of its service "${verdict.service}". Give the gate that uses the service a prerequisite that checks the port, or name the port in the why of a ci_env entry.`;
		default: {
			const unhandled: never = verdict;
			return unhandled;
		}
	}
}

function serviceLine(verdict: ServiceVerdict): string {
	switch (verdict.kind) {
		case "checked":
			return `- ${verdict.gate} names port ${verdict.port} of the service "${verdict.service}" of ${verdict.job}.`;
		case "unchecked":
			return `- SERVICE ${serviceFailure(verdict)}`;
		default: {
			const unhandled: never = verdict;
			return unhandled;
		}
	}
}

function failuresOf<T>(
	verdicts: readonly T[],
	failure: (verdict: T) => string | undefined,
): string[] {
	return verdicts.flatMap((verdict) => {
		const text = failure(verdict);
		return text === undefined ? [] : [text];
	});
}

function recordPin(pin: ExactPin): string {
	return isGateTool(pin.tool)
		? `Record the pin in the tools of the gate as ${pin.tool}: "${bareVersion(pin.version)}".`
		: `Give the gate a prerequisite that checks it, such as test "$(${pin.tool} --version)" = v${bareVersion(pin.version)}.`;
}

function toolchainFailure(verdict: ToolchainVerdict): string | undefined {
	switch (verdict.kind) {
		case "pinned":
		case "borrowed":
			return undefined;
		case "unmatched":
			return `${verdict.gate} runs ${verdict.tool} ${verdict.version}, but no CI job of the profile pins that version. Record the version that a CI job pins, such as ${verdict.tool}: "${verdict.example.version}" from ${verdict.example.job}.`;
		case "unpinned":
			return `${verdict.gate} runs in ${verdict.job}, which pins ${verdict.pin.tool} ${verdict.pin.version} with the ${verdict.pin.source}. ${recordPin(verdict.pin)}`;
		case "differs":
			return `${verdict.gate} records ${verdict.pin.tool} ${verdict.recorded}, but ${verdict.job} pins ${verdict.pin.tool} ${verdict.pin.version} with the ${verdict.pin.source}. ${recordPin(verdict.pin)}`;
		case "stale":
			return `${verdict.gate} records ${verdict.tool} ${verdict.version}, but no CI job of the gate pins ${verdict.tool}. Remove it from the tools of the gate.`;
		case "unread":
			return `${verdict.job} pins ${verdict.pin.tool} with ${verdict.pin.source}, but the check cannot read an exact version from it.`;
		default: {
			const unhandled: never = verdict;
			return unhandled;
		}
	}
}

export function parityFailures(report: ParityReport): string[] {
	return [
		...report.jobs.flatMap((verdict) => {
			switch (verdict.kind) {
				case "mapped":
				case "excluded":
					return [];
				case "unproven":
					return [
						`${verdict.job} is excluded, but its workflow does not prove that it never blocks a pull request. A proof is continue-on-error, an if condition that is false on a pull request, no command, or an aggregate of mapped jobs.`,
					];
				case "unmapped":
					return verdict.uncovered.length === 0
						? [`${verdict.job} runs no gate of the profile`]
						: [
								`${verdict.job} has no gate for: ${verdict.uncovered.join("; ")}`,
							];
				default: {
					const unhandled: never = verdict;
					return unhandled;
				}
			}
		}),
		...failuresOf(report.steps, stepFailure),
		...failuresOf(report.order, orderFailure),
		...report.paths.flatMap((verdict) =>
			verdict.kind === "narrower"
				? [
						`${verdict.gate} runs on fewer paths than ${verdict.job}. The job runs on ${describePaths(verdict.jobPaths)}, and the gate runs only on ${verdict.gatePaths.join(", ")}.`,
					]
				: [],
		),
		...failuresOf(report.env, envFailure),
		...failuresOf(report.exports, exportFailure),
		...failuresOf(report.services, serviceFailure),
		...failuresOf(report.toolchain, toolchainFailure),
		...report.problems,
	];
}

function verdictLine(verdict: JobVerdict): string {
	switch (verdict.kind) {
		case "mapped":
			return verdict.via === "command"
				? `- ${verdict.job}: mapped by command to ${verdict.gates.join(", ")}`
				: `- ${verdict.job}: mapped by the project config to ${verdict.gates.join(", ")}. ${verdict.reason}`;
		case "excluded":
			return `- ${verdict.job}: excluded, because ${verdict.proof}. ${verdict.reason}`;
		case "unproven":
			return `- UNPROVEN ${verdict.job}. The workflow does not prove the exclusion. ${verdict.reason}`;
		case "unmapped":
			return verdict.uncovered.length === 0
				? `- UNMAPPED ${verdict.job}. No step runs a gate of the profile.`
				: `- UNMAPPED ${verdict.job}. No gate runs: ${verdict.uncovered.map((command) => `\`${command}\``).join(", ")}`;
		default: {
			const unhandled: never = verdict;
			return unhandled;
		}
	}
}

function pathLine(verdict: PathVerdict): string {
	switch (verdict.kind) {
		case "allowed":
			return `- ${verdict.job}: ${verdict.gate} runs on fewer paths than the job. ${verdict.reason}`;
		case "narrower":
			return `- NARROWER ${verdict.gate} in ${verdict.job}. The job runs on ${describePaths(verdict.jobPaths)}, and the gate runs only on ${verdict.gatePaths.join(", ")}.`;
		default: {
			const unhandled: never = verdict;
			return unhandled;
		}
	}
}

function overrideLine(gate: string, entry: EnvOverride): string {
	switch (entry.kind) {
		case "set":
			return `- ${gate}: ${entry.name} differs from CI. ${entry.why}`;
		case "leave":
			return `- ${gate}: leaves ${entry.name} as the session has it. ${entry.why}`;
		default: {
			const unhandled: never = entry;
			return unhandled;
		}
	}
}

function envLines(verdicts: readonly EnvVerdict[]): string[] {
	const gates = [...new Set(verdicts.map((verdict) => verdict.gate))];
	return gates.flatMap((gate) => {
		const own = verdicts.filter((verdict) => verdict.gate === gate);
		const copied = own.flatMap((verdict) =>
			verdict.kind === "copied" ? [verdict.name] : [],
		);
		const session = own.flatMap((verdict) =>
			verdict.kind === "session" ? [verdict.name] : [],
		);
		const summary = [
			...(copied.length > 0
				? [`runs with the CI value of ${copied.join(", ")}.`]
				: []),
			...(session.length > 0
				? [`The session sets ${session.join(", ")}.`]
				: []),
		];
		return [
			...(summary.length > 0 ? [`- ${gate} ${summary.join(" ")}`] : []),
			...own.flatMap((verdict) => {
				if (verdict.kind === "overridden")
					return [overrideLine(gate, verdict.entry)];
				const failure = envFailure(verdict);
				return failure === undefined ? [] : [`- ENV ${failure}`];
			}),
		];
	});
}

function toolchainLines(verdicts: readonly ToolchainVerdict[]): string[] {
	const gates = [
		...new Set(
			verdicts.flatMap((verdict) =>
				verdict.kind === "pinned" ? [verdict.gate] : [],
			),
		),
	];
	return [
		...gates.map((gate) => {
			const tools = verdicts.flatMap((verdict) =>
				verdict.kind === "pinned" && verdict.gate === gate
					? [`${verdict.pin.tool} ${verdict.pin.version}`]
					: [],
			);
			return `- ${gate} runs the CI version of ${tools.join(", ")}.`;
		}),
		...verdicts.flatMap((verdict) =>
			verdict.kind === "borrowed"
				? [
						`- ${verdict.gate} runs ${verdict.tool} ${verdict.version}, which ${verdict.job} pins, only in a prerequisite or a setup entry.`,
					]
				: [],
		),
		...verdicts.flatMap((verdict) => {
			const failure = toolchainFailure(verdict);
			return failure === undefined ? [] : [`- TOOLCHAIN ${failure}`];
		}),
	];
}

export function formatParity(report: ParityReport): string[] {
	return [
		`Pull request workflows: ${report.pullRequest.join(", ") || "none"}`,
		`Not run on a pull request: ${report.other.map((workflow) => `${workflow.file} (${workflow.triggers.join(", ")})`).join(", ") || "none"}`,
		"",
		...report.jobs.map(verdictLine),
		...report.steps.map(stepLine),
		...report.order.map(orderLine),
		...report.paths.map(pathLine),
		...envLines(report.env),
		...report.exports.map(exportLine),
		...report.services.map(serviceLine),
		...toolchainLines(report.toolchain),
		...report.problems.map((problem) => `- PROBLEM ${problem}`),
	];
}
