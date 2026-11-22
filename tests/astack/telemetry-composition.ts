import { type SteEvents, sumSteEvents } from "../../src/astack/doctor.ts";
import type {
	Context,
	EventKind,
	Verdict,
} from "../../src/astack/hook/events.ts";
import {
	type EventEntry,
	type EventOutcome,
	type Judged,
	logRun,
	type Observation,
	outcomeIn,
	writeEvents,
} from "../../src/astack/ste/events.ts";
import type { Finding, Surface } from "../../src/astack/ste/types.ts";
import {
	type Outcome,
	outcomeOf,
	withLedger,
} from "../../src/astack/ste/verdict.ts";

export const telemetryArrows = {
	outcomeOf: outcomeOf satisfies (
		subject: string,
		surface: Surface,
		findings: readonly Finding[],
		skip: ReadonlySet<string>,
	) => Outcome,
	outcomeIn: outcomeIn satisfies (
		observation: Observation,
		runDenies: boolean,
	) => EventOutcome,
	withLedger: withLedger satisfies (
		context: Context,
		build: (skip: ReadonlySet<string>) => readonly Outcome[],
	) => Judged,
	logRun: logRun satisfies (
		context: Context,
		handler: string,
		event: EventKind,
		run: Judged,
	) => Verdict,
	writeEvents: writeEvents satisfies (
		dir: string | undefined,
		entries: readonly EventEntry[],
	) => void,
	sumSteEvents: sumSteEvents satisfies (
		logs: readonly string[],
		now: Date,
	) => SteEvents,
};
