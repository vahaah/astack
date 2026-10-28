import { resolve } from "node:path";
import { type ParseArgsOptionsConfig, parseArgs } from "node:util";
import type { Io } from "../cli/io.ts";
import { err, ok, type Result } from "../result.ts";
import {
	type Counts,
	type Frontier,
	type InboxPointer,
	NotFoundError,
	type OpenGate,
	openStore,
	parseForge,
	parseVerdict,
	type StandingLine,
	type StatusReport,
	type Store,
	type Unit,
	UsageError,
} from "./store.ts";

export const ORCH_USAGE = "orch [--store <dir>] [--json] [--force] <command>";

const DISPLAY_LIMIT = 4;

type Option =
	| { readonly kind: "flag"; readonly name: string; readonly summary: string }
	| {
			readonly kind: "value";
			readonly name: string;
			readonly placeholder: string;
			readonly summary: string;
			readonly env?: string;
	  };

type Output = { readonly compact: string; readonly json: unknown };

type Call = {
	readonly store: Store;
	readonly cwd: string;
	readonly arg: (name: string) => string;
	readonly text: (name: string) => string | undefined;
	readonly required: (name: string) => string;
	readonly flag: (name: string) => boolean;
};

type Leaf = {
	readonly path: readonly string[];
	readonly args: readonly string[];
	readonly summary: string;
	readonly options: readonly Option[];
	readonly run: (call: Call) => Promise<Output>;
};

type Args = {
	readonly values: Readonly<Record<string, unknown>>;
	readonly positionals: readonly string[];
};

type Request = {
	readonly leaf: Leaf;
	readonly args: readonly string[];
	readonly values: Readonly<Record<string, unknown>>;
};

type Parsed =
	| { readonly kind: "help"; readonly text: string }
	| { readonly kind: "usage"; readonly message: string; readonly help: string }
	| { readonly kind: "run"; readonly request: Request };

function flag(name: string, summary: string): Option {
	return { kind: "flag", name, summary };
}

function value(
	name: string,
	placeholder: string,
	summary: string,
	env?: string,
): Option {
	return { kind: "value", name, placeholder, summary, env };
}

function flagText(option: Option): string {
	return option.kind === "flag"
		? `--${option.name}`
		: `--${option.name} ${option.placeholder}`;
}

function positive(text: string, label: string): number {
	const parsed = Number(text);
	if (!/^[1-9]\d*$/.test(text) || !Number.isSafeInteger(parsed))
		throw new UsageError(`${label} must be a positive integer`);
	return parsed;
}

function prList(text: string): readonly number[] {
	const parts = text.split(",");
	if (parts.some((part) => part.length === 0))
		throw new UsageError("--prs requires a comma-separated PR list");
	return parts.map((part) => positive(part, "--prs"));
}

function countLine(counts: Counts): string {
	const entries = Object.entries(counts);
	return entries.length === 0
		? "none"
		: entries.map(([name, count]) => `${name}=${count}`).join(", ");
}

function unitLine(unit: Unit): string {
	return [
		unit.id,
		unit.track,
		unit.state,
		unit.branch,
		unit.pr,
		unit.sha,
		unit.brief,
	].join("\t");
}

function pointerLine(pointer: InboxPointer): string {
	return [
		pointer.ts,
		pointer.agent,
		pointer.unit,
		pointer.status,
		pointer.report,
	].join("\t");
}

function gateLine(gate: OpenGate): string {
	return [gate.id, gate.question, gate.options, gate.defaultAnswer].join("\t");
}

function standingLine(item: StandingLine): string {
	return `${item.number}. ${item.line}`;
}

function frontierLine(frontier: Frontier): string {
	const prs =
		frontier.prs.length === 0
			? "none"
			: frontier.prs
					.map((row) => `${row.branches}#${row.pr}@${row.sha}:${row.state}`)
					.join(",");
	return `generation=${frontier.generation} prs=${prs} lowest-unmerged=${frontier.lowestUnmerged ?? "none"}`;
}

function statusLines(report: StatusReport): string {
	const ids = report.summary.openGateIds;
	const visible = ids.slice(0, DISPLAY_LIMIT);
	const more =
		ids.length > DISPLAY_LIMIT ? `,+${ids.length - DISPLAY_LIMIT} more` : "";
	return [
		`counts: units=${report.units.length}; states=${countLine(report.summary.unitStates)}; ledger=${countLine(report.summary.ledgerVerdicts)}`,
		`changed: ${report.changed}`,
		`gates open: ${ids.length}${visible.length > 0 ? `; ids=${visible.join(",")}${more}` : ""}`,
	].join("\n");
}

function row<T>(item: T, line: (item: T) => string): Output {
	return { compact: line(item), json: item };
}

function rows<T>(
	items: readonly T[],
	line: (item: T) => string,
	empty: string,
	limit: number,
): Output {
	if (items.length === 0) return { compact: empty, json: items };
	const lines = items.slice(0, limit).map(line);
	if (items.length > limit)
		lines.push(`... ${items.length - limit} more; use --json`);
	return { compact: lines.join("\n"), json: items };
}

const GLOBAL_OPTIONS: readonly Option[] = [
	value("store", "<dir>", "store directory (or ORCH_STORE)", "ORCH_STORE"),
	flag("json", "print complete rows as JSON"),
	flag("force", "steal an existing store lock"),
];

const LEAVES: readonly Leaf[] = [
	{
		path: ["init"],
		args: [],
		summary: "initialize the store",
		options: [],
		run: async ({ store }) => {
			const result = await store.init();
			return { compact: `initialized ${result.store}`, json: result };
		},
	},
	{
		path: ["unit", "add"],
		args: ["id"],
		summary: "add a unit",
		options: [
			value("track", "<track>", "unit track"),
			value("brief", "<path>", "brief path"),
		],
		run: async (call) =>
			row(
				await call.store.units.add({
					id: call.arg("id"),
					track: call.required("track"),
					brief: call.text("brief"),
				}),
				unitLine,
			),
	},
	{
		path: ["unit", "set"],
		args: ["id"],
		summary: "update a unit",
		options: [
			value("state", "<state>", "unit state"),
			value("branch", "<branch>", "branch name"),
			value("pr", "<number>", "pull request number"),
			value("sha", "<sha>", "commit SHA"),
		],
		run: async (call) => {
			const pr = call.text("pr");
			return row(
				await call.store.units.set({
					id: call.arg("id"),
					state: call.required("state"),
					branch: call.text("branch"),
					pr: pr === undefined ? undefined : positive(pr, "--pr"),
					sha: call.text("sha"),
				}),
				unitLine,
			);
		},
	},
	{
		path: ["unit", "get"],
		args: ["id"],
		summary: "get a unit",
		options: [],
		run: async (call) =>
			row(await call.store.units.get(call.arg("id")), unitLine),
	},
	{
		path: ["unit", "list"],
		args: [],
		summary: "list units",
		options: [
			value("state", "<state>", "filter by state"),
			value("track", "<track>", "filter by track"),
		],
		run: async (call) =>
			rows(
				await call.store.units.list({
					state: call.text("state"),
					track: call.text("track"),
				}),
				unitLine,
				"(no units)",
				DISPLAY_LIMIT,
			),
	},
	{
		path: ["unit", "counts"],
		args: [],
		summary: "count units by state",
		options: [],
		run: async (call) => row(await call.store.units.counts(), countLine),
	},
	{
		path: ["ledger", "record"],
		args: ["pr", "sha", "verdict"],
		summary: "record a verification verdict",
		options: [
			value("evidence", "<path>", "evidence path"),
			value("verifier", "<name>", "verifier name"),
		],
		run: async (call) =>
			row(
				await call.store.ledger.record({
					pr: positive(call.arg("pr"), "pr"),
					sha: call.arg("sha"),
					verdict: parseVerdict(call.arg("verdict")),
					evidence: call.required("evidence"),
					verifier: call.text("verifier"),
				}),
				(entry) => `${entry.pr}\t${entry.sha}\t${entry.verdict}`,
			),
	},
	{
		path: ["ledger", "check"],
		args: ["pr", "sha"],
		summary: "check a verification verdict",
		options: [],
		run: async (call) =>
			row(
				await call.store.ledger.check({
					pr: positive(call.arg("pr"), "pr"),
					sha: call.arg("sha"),
				}),
				(entry) => entry.verdict,
			),
	},
	{
		path: ["ledger", "summary"],
		args: [],
		summary: "count verification verdicts",
		options: [],
		run: async (call) => row(await call.store.ledger.summary(), countLine),
	},
	{
		path: ["inbox", "push"],
		args: ["agent", "unit", "status"],
		summary: "push an inbox pointer",
		options: [value("report", "<path>", "report path")],
		run: async (call) => {
			const { pointer, filename } = await call.store.inbox.push({
				agent: call.arg("agent"),
				unit: call.arg("unit"),
				status: call.arg("status"),
				report: call.text("report"),
			});
			return {
				compact: `${pointer.unit}\t${pointer.status}\t${filename}`,
				json: pointer,
			};
		},
	},
	{
		path: ["inbox", "drain"],
		args: [],
		summary: "drain inbox pointers",
		options: [flag("peek", "read without draining")],
		run: async (call) =>
			rows(
				call.flag("peek")
					? await call.store.inbox.peek()
					: await call.store.inbox.drain(),
				pointerLine,
				"(empty)",
				Number.POSITIVE_INFINITY,
			),
	},
	{
		path: ["inbox", "count"],
		args: [],
		summary: "count inbox pointers",
		options: [],
		run: async (call) => {
			const count = await call.store.inbox.count();
			return { compact: String(count), json: { count } };
		},
	},
	{
		path: ["gate", "park"],
		args: ["id"],
		summary: "park a decision gate",
		options: [
			value("question", "<question>", "gate question"),
			value("options", "<options>", "gate options"),
			value("default", "<answer>", "default answer"),
		],
		run: async (call) =>
			row(
				await call.store.gates.park({
					id: call.arg("id"),
					question: call.required("question"),
					options: call.required("options"),
					defaultAnswer: call.required("default"),
				}),
				(gate) => `${gate.id}\topen`,
			),
	},
	{
		path: ["gate", "list"],
		args: [],
		summary: "list open decision gates",
		options: [],
		run: async (call) =>
			rows(
				await call.store.gates.list(),
				gateLine,
				"(no open gates)",
				DISPLAY_LIMIT,
			),
	},
	{
		path: ["gate", "resolve"],
		args: ["id"],
		summary: "resolve a decision gate",
		options: [value("answer", "<answer>", "chosen answer")],
		run: async (call) =>
			row(
				await call.store.gates.resolve({
					id: call.arg("id"),
					answer: call.required("answer"),
				}),
				(gate) => `${gate.id}\tresolved\t${gate.answer}`,
			),
	},
	{
		path: ["frontier", "set"],
		args: [],
		summary: "resolve the pull request base chain and set the frontier",
		options: [
			value(
				"repo",
				"<dir>",
				"repository directory (or ORCH_REPO)",
				"ORCH_REPO",
			),
			value("forge", "<forge>", "pull request forge, only gh (default gh)"),
			value("prs", "<n,...>", "optional expected pull request order pin"),
		],
		run: async (call) => {
			const forge = parseForge(call.text("forge") ?? "gh");
			const pin = call.text("prs");
			return row(
				await call.store.frontier.set({
					repo: resolve(call.cwd, call.required("repo")),
					forge,
					prs: pin === undefined ? undefined : prList(pin),
				}),
				frontierLine,
			);
		},
	},
	{
		path: ["frontier", "show"],
		args: [],
		summary: "show the frontier",
		options: [],
		run: async (call) => row(await call.store.frontier.show(), frontierLine),
	},
	{
		path: ["status"],
		args: [],
		summary: "render status.md and print a summary",
		options: [],
		run: async (call) => row(await call.store.status.render(), statusLines),
	},
	{
		path: ["standing", "show"],
		args: [],
		summary: "show standing orders",
		options: [],
		run: async (call) =>
			rows(
				await call.store.standing.show(),
				standingLine,
				"(no standing orders)",
				DISPLAY_LIMIT,
			),
	},
	{
		path: ["standing", "add"],
		args: ["line"],
		summary: "add a standing order",
		options: [],
		run: async (call) =>
			row(
				await call.store.standing.add({ line: call.arg("line") }),
				standingLine,
			),
	},
];

const HELP_ROW = ["-h, --help", "print help"] as const;

function table(lines: readonly (readonly [string, string])[]): string {
	const width = Math.max(...lines.map(([left]) => left.length));
	return lines
		.map(([left, right]) => `  ${left.padEnd(width)}  ${right}`)
		.join("\n");
}

function optionRow(option: Option): readonly [string, string] {
	return [flagText(option), option.summary];
}

function commandOf(leaf: Leaf): string {
	return [...leaf.path, ...leaf.args.map((name) => `<${name}>`)].join(" ");
}

const PROGRAM_HELP = [
	`usage: astack ${ORCH_USAGE}`,
	"",
	"Plain-file orchestrate bookkeeping.",
	"",
	"Options:",
	table([...GLOBAL_OPTIONS.map(optionRow), HELP_ROW]),
	"",
	"Commands:",
	table(LEAVES.map((leaf) => [commandOf(leaf), leaf.summary])),
	"",
].join("\n");

function leafHelp(leaf: Leaf): string {
	const options = leaf.options.length > 0 ? " [options]" : "";
	return [
		`usage: astack orch ${commandOf(leaf)}${options}`,
		"",
		leaf.summary,
		"",
		"Options:",
		table([...leaf.options.map(optionRow), HELP_ROW]),
		"",
	].join("\n");
}

function parseConfig(): ParseArgsOptionsConfig {
	const config: ParseArgsOptionsConfig = {
		help: { type: "boolean", short: "h" },
	};
	for (const option of [
		...GLOBAL_OPTIONS,
		...LEAVES.flatMap((leaf) => leaf.options),
	])
		config[option.name] = {
			type: option.kind === "flag" ? "boolean" : "string",
		};
	return config;
}

const PARSE_CONFIG = parseConfig();

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function readArgs(argv: readonly string[]): Result<Args, string> {
	try {
		return ok(
			parseArgs({
				args: [...argv],
				options: PARSE_CONFIG,
				strict: true,
				allowPositionals: true,
			}),
		);
	} catch (error) {
		return err(message(error));
	}
}

function classify({ values, positionals }: Args): Parsed {
	const leaf = LEAVES.find((candidate) =>
		candidate.path.every((word, index) => positionals[index] === word),
	);
	if (values.help === true)
		return {
			kind: "help",
			text: leaf === undefined ? PROGRAM_HELP : leafHelp(leaf),
		};
	if (leaf === undefined)
		return {
			kind: "usage",
			message:
				positionals.length === 0
					? "a valid command is required"
					: `unknown command '${positionals.slice(0, 2).join(" ")}'`,
			help: PROGRAM_HELP,
		};
	const name = leaf.path.join(" ");
	const usage = (text: string): Parsed => ({
		kind: "usage",
		message: text,
		help: leafHelp(leaf),
	});
	const known = new Set([
		"help",
		...[...GLOBAL_OPTIONS, ...leaf.options].map((option) => option.name),
	]);
	const foreign = Object.keys(values).find((key) => !known.has(key));
	if (foreign !== undefined)
		return usage(`unknown option '--${foreign}' for '${name}'`);
	const args = positionals.slice(leaf.path.length);
	const missing = leaf.args[args.length];
	if (missing !== undefined)
		return usage(`missing required argument '${missing}'`);
	if (args.length > leaf.args.length)
		return usage(`too many arguments for '${name}'`);
	return { kind: "run", request: { leaf, args, values } };
}

function emit(io: Io, json: boolean, output: Output): void {
	const rendered = json ? JSON.stringify(output.json, null, 2) : output.compact;
	io.out(rendered.endsWith("\n") ? rendered : `${rendered}\n`);
}

function failure(io: Io, error: unknown, json: boolean, help: string): number {
	if (error instanceof NotFoundError) {
		if (error.output === undefined) io.err(`error: ${error.message}\n`);
		else emit(io, json, error.output);
		return 2;
	}
	io.err(`error: ${message(error)}\n`);
	if (error instanceof UsageError) io.err(help);
	return 1;
}

async function execute(
	{ leaf, args, values }: Request,
	io: Io,
): Promise<number> {
	const optionOf = (name: string): Option => {
		const option = [...GLOBAL_OPTIONS, ...leaf.options].find(
			(candidate) => candidate.name === name,
		);
		if (option === undefined)
			throw new Error(`orch ${leaf.path.join(" ")} has no option --${name}`);
		return option;
	};
	const text = (name: string): string | undefined => {
		const option = optionOf(name);
		const given = values[name];
		if (typeof given === "string") return given;
		return option.kind === "value" && option.env !== undefined
			? io.env[option.env]
			: undefined;
	};
	const required = (name: string): string => {
		const found = text(name);
		if (found !== undefined && found.trim().length > 0) return found;
		const option = optionOf(name);
		throw new UsageError(
			option.kind === "value" && option.env !== undefined
				? `set ${flagText(option)} or ${option.env}`
				: `required option '${flagText(option)}' not specified`,
		);
	};
	const arg = (name: string): string => {
		const found = args[leaf.args.indexOf(name)];
		if (found === undefined)
			throw new UsageError(`missing required argument '${name}'`);
		return found;
	};
	const isSet = (name: string): boolean =>
		optionOf(name).kind === "flag" && values[name] === true;
	const json = isSet("json");
	try {
		const store = openStore(resolve(io.cwd, required("store")), {
			force: isSet("force"),
			onLockStolen: (holder) =>
				io.err(`stealing store lock held by pid ${holder}\n`),
			onStaleLock: (holder) =>
				io.err(`replacing stale store lock (pid ${holder} is dead)\n`),
		});
		try {
			emit(
				io,
				json,
				await leaf.run({
					store,
					cwd: io.cwd,
					arg,
					text,
					required,
					flag: isSet,
				}),
			);
			return 0;
		} finally {
			await store.close();
		}
	} catch (error) {
		return failure(io, error, json, leafHelp(leaf));
	}
}

export async function runOrch(
	argv: readonly string[],
	io: Io,
): Promise<number> {
	const args = readArgs(argv);
	const parsed: Parsed = args.ok
		? classify(args.value)
		: { kind: "usage", message: args.error, help: PROGRAM_HELP };
	switch (parsed.kind) {
		case "help":
			io.out(parsed.text);
			return 0;
		case "usage":
			io.err(`error: ${parsed.message}\n${parsed.help}`);
			return 1;
		case "run":
			return execute(parsed.request, io);
	}
}
