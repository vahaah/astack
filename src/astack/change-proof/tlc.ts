import { err, ok, type Result } from "../result.ts";
import type { Expectation } from "./contract.ts";

export type TlcRecord = {
	readonly code: number;
	readonly severity: number;
	readonly body: string;
};

export type RunEnd =
	| {
			readonly kind: "exited";
			readonly code: number;
			readonly stdout: string;
			readonly stderr: string;
	  }
	| { readonly kind: "signalled"; readonly signal: string }
	| { readonly kind: "timeout"; readonly ms: number }
	| { readonly kind: "output-cap"; readonly bytes: number }
	| { readonly kind: "failed"; readonly message: string };

export type Counts = {
	readonly generated: number;
	readonly distinct: number;
	readonly queued: number;
};

export type Violation = { readonly name: string; readonly states: number };

export type RunLabel = "positive" | "negative" | "restored";

const CODE = {
	invariantInitial: 2107,
	invariantBehavior: 2110,
	behaviorHeader: 2121,
	temporal: 2116,
	temporalCounterexample: 2264,
	mode: 2187,
	success: 2193,
	stats: 2199,
	finished: 2186,
	temporalStart: 2192,
	temporalDone: 2267,
} as const;

const SEVERITY = { error: 1, bug: 2, warning: 3, state: 4 } as const;

export function parseTlcRecords(
	output: string,
): Result<readonly TlcRecord[], string> {
	const records: TlcRecord[] = [];
	let open: { code: number; severity: number; lines: string[] } | undefined;
	for (const line of output.split("\n")) {
		const start = /^@!@!@STARTMSG (\d+):(\d+) @!@!@$/.exec(line);
		const end = /^@!@!@ENDMSG (\d+) @!@!@$/.exec(line);
		if (start !== null) {
			if (open !== undefined)
				return err(`record ${open.code} has no end before record ${start[1]}`);
			open = { code: Number(start[1]), severity: Number(start[2]), lines: [] };
		} else if (end !== null) {
			if (open === undefined || open.code !== Number(end[1]))
				return err(`an end of record ${end[1]} has no matching start`);
			records.push({
				code: open.code,
				severity: open.severity,
				body: open.lines.join("\n"),
			});
			open = undefined;
		} else if (open !== undefined) open.lines.push(line);
	}
	if (open !== undefined) return err(`record ${open.code} has no end`);
	return ok(records);
}

function interrupted(label: RunLabel, end: RunEnd): string | undefined {
	switch (end.kind) {
		case "exited":
			return undefined;
		case "signalled":
			return `the ${label} run stopped on signal ${end.signal}`;
		case "timeout":
			return `the ${label} run passed the ${end.ms} ms deadline and was stopped`;
		case "output-cap":
			return `the ${label} run printed more than ${end.bytes} bytes and was stopped`;
		case "failed":
			return `the ${label} run could not start: ${end.message}`;
		default: {
			const unreachable: never = end;
			return unreachable;
		}
	}
}

function errorCodes(records: readonly TlcRecord[]): string {
	const codes = [
		...new Set(
			records
				.filter((record) => record.severity === SEVERITY.error)
				.map((record) => record.code),
		),
	];
	return codes.length === 0 ? "no error record" : `error ${codes.join(", ")}`;
}

function only(
	records: readonly TlcRecord[],
	code: number,
): TlcRecord | undefined {
	const found = records.filter((record) => record.code === code);
	return found.length === 1 ? found[0] : undefined;
}

function counted(value: string | undefined): number {
	return Number((value ?? "").replaceAll(",", ""));
}

function statistics(records: readonly TlcRecord[]): Counts | undefined {
	const stats = only(records, CODE.stats);
	const match =
		/^([\d,]+) states generated, ([\d,]+) distinct states found, ([\d,]+) states left on queue\.$/.exec(
			stats?.body.trim() ?? "",
		);
	return match === null
		? undefined
		: {
				generated: counted(match[1]),
				distinct: counted(match[2]),
				queued: counted(match[3]),
			};
}

type Exited = Extract<RunEnd, { kind: "exited" }>;

function exitedRecords(
	label: RunLabel,
	end: RunEnd,
): Result<{ run: Exited; records: readonly TlcRecord[] }, string> {
	const stopped = interrupted(label, end);
	if (stopped !== undefined || end.kind !== "exited")
		return err(stopped ?? `the ${label} run did not exit`);
	const records = parseTlcRecords(end.stdout);
	if (!records.ok)
		return err(`the ${label} run printed malformed output: ${records.error}`);
	return ok({ run: end, records: records.value });
}

function noiseProblem(
	label: RunLabel,
	run: Exited,
	records: readonly TlcRecord[],
): string | undefined {
	const noisy = records.find(
		(record) =>
			record.severity === SEVERITY.warning || record.severity === SEVERITY.bug,
	);
	if (noisy !== undefined)
		return `the ${label} run printed ${noisy.severity === SEVERITY.bug ? "checker bug" : "warning"} ${noisy.code}`;
	if (run.stderr.trim() !== "")
		return `the ${label} run wrote to stderr: ${run.stderr.trim().split("\n")[0] ?? ""}`;
	if (records.at(-1)?.code !== CODE.finished)
		return `the ${label} run has no final finished record ${CODE.finished}`;
	return undefined;
}

export function judgePositive(
	label: RunLabel,
	end: RunEnd,
	temporal: boolean,
): Result<Counts, string> {
	const exited = exitedRecords(label, end);
	if (!exited.ok) return exited;
	const { run, records } = exited.value;
	if (run.code !== 0)
		return err(
			`the ${label} run exited ${run.code} with ${errorCodes(records)}`,
		);
	const noise = noiseProblem(label, run, records);
	if (noise !== undefined) return err(noise);
	if (records.some((record) => record.severity === SEVERITY.error))
		return err(`the ${label} run reported ${errorCodes(records)}`);
	const temporalRecords: readonly (readonly [number, string])[] = [
		[CODE.temporalStart, "temporal check"],
		[CODE.temporalDone, "temporal check completion"],
	];
	const required: readonly (readonly [number, string])[] = [
		[CODE.mode, "model-check mode"],
		[CODE.success, "success"],
		...(temporal ? temporalRecords : []),
	];
	const missing = required.find(([code]) => only(records, code) === undefined);
	if (missing !== undefined)
		return err(
			`the ${label} run has no single ${missing[1]} record ${missing[0]}`,
		);
	if (
		!only(records, CODE.success)?.body.startsWith(
			"Model checking completed. No error has been found.",
		)
	)
		return err(`the ${label} run has a success record with other text`);
	const counts = statistics(records);
	if (counts === undefined)
		return err(
			`the ${label} run has no single final statistics record ${CODE.stats}`,
		);
	if (counts.distinct === 0)
		return err(`the ${label} run found 0 distinct states`);
	if (counts.queued !== 0)
		return err(`the ${label} run left ${counts.queued} states on the queue`);
	return ok(counts);
}

export function judgeNegative(
	end: RunEnd,
	expect: Expectation,
): Result<Violation, string> {
	const exited = exitedRecords("negative", end);
	if (!exited.ok) return exited;
	const { run, records } = exited.value;
	const temporal = expect.kind === "temporal";
	const wanted = temporal
		? "temporal property violation"
		: "invariant violation";
	if (run.code !== (temporal ? 13 : 12))
		return err(
			`the negative run exited ${run.code} with ${errorCodes(records)}, not the expected ${wanted}`,
		);
	const noise = noiseProblem("negative", run, records);
	if (noise !== undefined) return err(noise);
	const allowed: readonly number[] = temporal
		? [CODE.temporal, CODE.temporalCounterexample]
		: [CODE.invariantInitial, CODE.invariantBehavior, CODE.behaviorHeader];
	const unrelated = records.find(
		(record) =>
			record.severity === SEVERITY.error && !allowed.includes(record.code),
	);
	if (unrelated !== undefined)
		return err(
			`the negative run reported the unrelated error ${unrelated.code}`,
		);
	const states = records.filter(
		(record) => record.severity === SEVERITY.state,
	).length;
	if (states === 0)
		return err("the negative run printed no counterexample state");
	if (temporal) {
		if (only(records, CODE.temporal) === undefined)
			return err(
				`the negative run has no single temporal violation record ${CODE.temporal}`,
			);
		return ok({ name: expect.name, states });
	}
	const violations = records.filter(
		(record) =>
			record.code === CODE.invariantInitial ||
			record.code === CODE.invariantBehavior,
	);
	const [violation] = violations;
	if (violations.length !== 1 || violation === undefined)
		return err(
			`the negative run has ${violations.length} invariant violation records, not 1`,
		);
	const name = /^Invariant ([A-Za-z_][A-Za-z0-9_]*) is violated/.exec(
		violation.body.trim(),
	)?.[1];
	if (name !== expect.name)
		return err(
			`the negative run violated ${name ?? "an unnamed invariant"}, not the expected invariant ${expect.name}`,
		);
	return ok({ name, states });
}
