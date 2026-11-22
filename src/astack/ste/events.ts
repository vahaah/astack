import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
	type Context,
	combineAll,
	type EventKind,
	type Verdict,
} from "../hook/events.ts";
import { stateDir } from "../state.ts";
import { appendEvents, currentTurn, sessionDir } from "./state.ts";

export const EVENT_OUTCOMES = [
	"deny",
	"demoted",
	"advise",
	"quiet",
	"masked",
	"rewrite",
	"pending",
] as const;

export type EventOutcome = (typeof EVENT_OUTCOMES)[number];

export type Shown = Extract<
	EventOutcome,
	"deny" | "demoted" | "advise" | "quiet"
>;

export type FindingCheck = "ste" | "comments";

export type Observation = {
	readonly check: FindingCheck;
	readonly surface: string;
	readonly rule: string;
	readonly fingerprint: string;
	readonly shown: Shown;
};

export type Judged = {
	readonly verdict: Verdict;
	readonly observed: readonly Observation[];
};

export type FindingEvent = {
	readonly time: string;
	readonly turn: number;
	readonly release: string;
	readonly pid: number;
	readonly handler: string;
	readonly check: FindingCheck;
	readonly event: EventKind;
	readonly surface: string;
	readonly rule: string;
	readonly outcome: EventOutcome;
	readonly fingerprint: string;
};

export type EventEntry = Pick<
	FindingEvent,
	"handler" | "check" | "event" | "surface" | "rule" | "outcome" | "fingerprint"
>;

export const UNKNOWN_RELEASE = "unknown";

const MANIFESTS = [".claude-plugin/plugin.json", ".cursor-plugin/plugin.json"];

export function judged(
	verdict: Verdict,
	observed: readonly Observation[] = [],
): Judged {
	return { verdict, observed };
}

export function combineJudged(runs: readonly Judged[]): Judged {
	return {
		verdict: combineAll(runs.map((run) => run.verdict)),
		observed: runs.flatMap((run) => run.observed),
	};
}

export function outcomeIn(
	observation: Observation,
	runDenies: boolean,
): EventOutcome {
	switch (observation.shown) {
		case "deny":
		case "quiet":
			return observation.shown;
		case "demoted":
		case "advise":
			return runDenies ? "masked" : observation.shown;
	}
}

export function steSessionDir(
	context: Context,
	session = context.session,
): string | undefined {
	const root = stateDir(context.env);
	return root && session ? sessionDir(root, session) : undefined;
}

function manifestVersion(path: string): string | undefined {
	try {
		const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
		const version =
			typeof parsed === "object" && parsed !== null
				? Reflect.get(parsed, "version")
				: undefined;
		return typeof version === "string" && version !== "" ? version : undefined;
	} catch {
		return undefined;
	}
}

export function releaseOf(scriptPath: string | undefined): string {
	if (scriptPath === undefined) return UNKNOWN_RELEASE;
	const root = resolve(dirname(scriptPath), "..");
	for (const manifest of MANIFESTS) {
		const version = manifestVersion(join(root, manifest));
		if (version !== undefined) return version;
	}
	return UNKNOWN_RELEASE;
}

export function eventLine(
	entry: EventEntry,
	stamp: Pick<FindingEvent, "time" | "turn" | "release" | "pid">,
): string {
	const line: FindingEvent = {
		time: stamp.time,
		turn: stamp.turn,
		release: stamp.release,
		pid: stamp.pid,
		handler: entry.handler,
		check: entry.check,
		event: entry.event,
		surface: entry.surface,
		rule: entry.rule,
		outcome: entry.outcome,
		fingerprint: entry.fingerprint,
	};
	return `${JSON.stringify(line)}\n`;
}

export function writeEvents(
	dir: string | undefined,
	entries: readonly EventEntry[],
): void {
	if (dir === undefined || entries.length === 0) return;
	const stamp = {
		time: new Date().toISOString(),
		turn: currentTurn(dir),
		release: releaseOf(process.argv[1]),
		pid: process.pid,
	};
	appendEvents(
		dir,
		entries.map((entry) => eventLine(entry, stamp)),
	);
}

export function logRun(
	context: Context,
	handler: string,
	event: EventKind,
	run: Judged,
): Verdict {
	if (context.refresh !== true) {
		const runDenies = run.verdict.kind === "deny";
		writeEvents(
			steSessionDir(context),
			run.observed.map((observation) => ({
				handler,
				check: observation.check,
				event,
				surface: observation.surface,
				rule: observation.rule,
				outcome: outcomeIn(observation, runDenies),
				fingerprint: observation.fingerprint,
			})),
		);
	}
	return run.verdict;
}
