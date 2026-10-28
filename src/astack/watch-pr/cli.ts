import { setTimeout as delay } from "node:timers/promises";
import { parseArgs } from "node:util";
import type { Io } from "../cli/io.ts";
import { err, ok, type Result } from "../result.ts";
import {
	discoverStack,
	GhGitHubReader,
	resolveContext,
	WatcherQueryError,
} from "./github.ts";
import {
	runQueued,
	runSimple,
	statusQueryVerdict,
	verdictFactory,
	type WatchClock,
} from "./policy.ts";
import { renderJson, renderPretty } from "./render.ts";
import type * as T from "./types.ts";
import { isPrNumber, nonEmpty } from "./types.ts";

export interface CliOptions {
	readonly owner: string | null;
	readonly repo: string | null;
	readonly pr: T.PrNumber | null;
	readonly mode: T.WatchMode;
	readonly stackPrs: readonly T.PrNumber[];
	readonly statusOnly: boolean;
	readonly pretty: boolean;
	readonly polling: T.PollingOptions;
}

export type WatchArgs =
	| { readonly kind: "help" }
	| { readonly kind: "watch"; readonly options: CliOptions };

const FLAGS = {
	owner: { type: "string", arg: "<owner>", help: "GitHub repository owner" },
	repo: { type: "string", arg: "<repo>", help: "GitHub repository name" },
	pr: { type: "string", arg: "<number>", help: "pull request number" },
	stack: { type: "boolean", help: "watch the connected open stack" },
	"queued-stack": {
		type: "boolean",
		help: "watch the captured stack until all PRs merge",
	},
	"stack-prs": {
		type: "string",
		arg: "<n,...>",
		help: "frozen bottom-to-top queue (queued mode only)",
	},
	interval: {
		type: "string",
		arg: "<seconds>",
		help: "poll interval",
		default: "60",
	},
	"sweep-interval": {
		type: "string",
		arg: "<seconds>",
		help: "whole-stack sweep interval",
		default: "300",
	},
	timeout: {
		type: "string",
		arg: "<seconds>",
		help: "deadline; 0 disables it",
		default: "0",
	},
	"max-query-errors": {
		type: "string",
		arg: "<count>",
		help: "consecutive query-error budget",
		default: "5",
	},
	"status-only": { type: "boolean", help: "print one status table and exit 0" },
	"allow-draft": {
		type: "boolean",
		help: "do not treat a draft as a merge gate",
	},
	pretty: { type: "boolean", help: "render human text instead of JSON" },
	help: { type: "boolean", short: "h", help: "display help for command" },
} as const;

type ValueFlag = {
	[K in keyof typeof FLAGS]: (typeof FLAGS)[K] extends { readonly arg: string }
		? K
		: never;
}[keyof typeof FLAGS];

function flagLine(
	name: string,
	flag: (typeof FLAGS)[keyof typeof FLAGS],
): string {
	const short = "short" in flag ? `-${flag.short}, ` : "";
	const arg = "arg" in flag ? ` ${flag.arg}` : "";
	const fallback = "default" in flag ? ` (default: ${flag.default})` : "";
	return `  ${`${short}--${name}${arg}`.padEnd(28)}${flag.help}${fallback}`;
}

const HELP = [
	"Usage: astack watch-pr [options]",
	"",
	"Watch one pull request, a connected stack, or an immutable queued stack.",
	"JSON (NDJSON while polling) is the default; --pretty renders human text.",
	"",
	"Options:",
	...Object.entries(FLAGS).map(([name, flag]) => flagLine(name, flag)),
	"",
].join("\n");

type Parse<V> = (raw: string) => Result<V, string>;

const positiveNumber: Parse<number> = (raw) => {
	const parsed = Number(raw);
	return Number.isFinite(parsed) && parsed > 0
		? ok(parsed)
		: err("must be greater than zero");
};

const nonNegativeNumber: Parse<number> = (raw) => {
	const parsed = Number(raw);
	return Number.isFinite(parsed) && parsed >= 0
		? ok(parsed)
		: err("must be zero or greater");
};

const positiveInteger: Parse<number> = (raw) => {
	const parsed = Number(raw);
	return Number.isInteger(parsed) && parsed > 0
		? ok(parsed)
		: err("must be a positive integer");
};

const prNumber: Parse<T.PrNumber> = (raw) => {
	const parsed = Number(raw.trim().replace(/^#/, ""));
	return isPrNumber(parsed) ? ok(parsed) : err("must be a positive integer");
};

const stackPrList: Parse<T.NonEmpty<T.PrNumber>> = (raw) => {
	const numbers: T.PrNumber[] = [];
	for (const part of raw.split(",")) {
		const parsed = prNumber(part);
		if (!parsed.ok) return parsed;
		numbers.push(parsed.value);
	}
	if (new Set(numbers).size !== numbers.length)
		return err("contains a duplicate PR");
	const list = nonEmpty(numbers);
	return list === null ? err("cannot be empty") : ok(list);
};

function flagValue<V>(
	name: ValueFlag,
	raw: string,
	parse: Parse<V>,
): Result<V, string> {
	const parsed = parse(raw);
	return parsed.ok
		? parsed
		: err(
				`error: option '--${name} ${FLAGS[name].arg}' argument '${raw}' is invalid. ${parsed.error}`,
			);
}

function isFlagError(error: unknown): error is TypeError {
	return (
		error instanceof TypeError &&
		"code" in error &&
		typeof error.code === "string" &&
		error.code.startsWith("ERR_PARSE_ARGS_")
	);
}

function readFlags(argv: readonly string[]) {
	try {
		return ok(parseArgs({ args: [...argv], options: FLAGS, strict: true }));
	} catch (error) {
		if (!isFlagError(error)) throw error;
		return err(`error: ${error.message}`);
	}
}

export function parseWatchArgs(
	argv: readonly string[],
): Result<WatchArgs, string> {
	const read = readFlags(argv);
	if (!read.ok) return read;
	const values = read.value.values;
	if (values.help) return ok({ kind: "help" });
	if (values.stack && values["queued-stack"])
		return err(
			"error: option '--stack' cannot be used with option '--queued-stack'",
		);
	if (values["stack-prs"] !== undefined && !values["queued-stack"])
		return err("error: --stack-prs requires --queued-stack");
	const pr =
		values.pr === undefined ? ok(null) : flagValue("pr", values.pr, prNumber);
	if (!pr.ok) return pr;
	const stackPrs =
		values["stack-prs"] === undefined
			? ok([])
			: flagValue("stack-prs", values["stack-prs"], stackPrList);
	if (!stackPrs.ok) return stackPrs;
	const interval = flagValue("interval", values.interval, positiveNumber);
	if (!interval.ok) return interval;
	const sweepInterval = flagValue(
		"sweep-interval",
		values["sweep-interval"],
		positiveNumber,
	);
	if (!sweepInterval.ok) return sweepInterval;
	const timeout = flagValue("timeout", values.timeout, nonNegativeNumber);
	if (!timeout.ok) return timeout;
	const maxQueryErrors = flagValue(
		"max-query-errors",
		values["max-query-errors"],
		positiveInteger,
	);
	if (!maxQueryErrors.ok) return maxQueryErrors;
	return ok({
		kind: "watch",
		options: {
			owner: values.owner ?? null,
			repo: values.repo ?? null,
			pr: pr.value,
			mode: values["queued-stack"]
				? "queued-stack"
				: values.stack
					? "stack"
					: "single",
			stackPrs: stackPrs.value,
			statusOnly: values["status-only"] ?? false,
			pretty: values.pretty ?? false,
			polling: {
				interval: interval.value,
				sweepInterval: sweepInterval.value,
				timeout: timeout.value,
				maxQueryErrors: maxQueryErrors.value,
				allowDraft: values["allow-draft"] ?? false,
			},
		},
	});
}

export interface CliRuntime {
	readonly reader: T.GitHubReader;
	readonly clock: WatchClock;
	readonly stdout: (value: string) => void;
	readonly stderr: (value: string) => void;
}

export function ghRuntime(io: Pick<Io, "out" | "err">): CliRuntime {
	return {
		reader: new GhGitHubReader(),
		clock: {
			now: () => performance.now() / 1_000,
			observedAt: () => new Date().toISOString(),
			sleep: async (seconds) => {
				await delay(seconds * 1_000);
			},
		},
		stdout: io.out,
		stderr: io.err,
	};
}

export async function main(
	argv: readonly string[],
	runtime: CliRuntime,
): Promise<number> {
	const parsed = parseWatchArgs(argv);
	if (!parsed.ok) {
		runtime.stderr(`${parsed.error}\n`);
		return 64;
	}
	if (parsed.value.kind === "help") {
		runtime.stdout(HELP);
		return 0;
	}
	const options = parsed.value.options;
	const render = options.pretty ? renderPretty : renderJson;
	const emit = (verdict: T.ProgressVerdict): void =>
		runtime.stdout(render(verdict));
	let contexts: T.NonEmpty<T.PrContext>;
	try {
		const seed = await resolveContext({
			reader: runtime.reader,
			owner: options.owner,
			repo: options.repo,
			pr: options.pr ?? options.stackPrs[0] ?? null,
		});
		contexts =
			nonEmpty(options.stackPrs.map((number) => ({ ...seed, number }))) ??
			(options.mode === "single"
				? [seed]
				: await discoverStack(runtime.reader, seed));
	} catch (error) {
		if (!(error instanceof WatcherQueryError)) throw error;
		const verdict = statusQueryVerdict(
			verdictFactory(runtime.clock, options.mode),
			1,
			error.failure,
		);
		runtime.stdout(render(verdict));
		return verdict.exitCode;
	}
	const dependencies = { reader: runtime.reader, clock: runtime.clock, emit };
	const verdict =
		options.mode === "queued-stack" && !options.statusOnly
			? await runQueued({ dependencies, contexts, options: options.polling })
			: await runSimple({
					dependencies,
					contexts,
					mode: options.mode,
					statusOnly: options.statusOnly,
					options: options.polling,
				});
	runtime.stdout(render(verdict));
	return verdict.exitCode;
}
