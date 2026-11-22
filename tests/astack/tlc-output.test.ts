import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runModel } from "../../src/astack/change-proof/runner.ts";
import {
	judgeNegative,
	judgePositive,
	parseTlcRecords,
	type RunEnd,
} from "../../src/astack/change-proof/tlc.ts";
import { ok } from "../../src/astack/result.ts";
import { scratchDir } from "./change-proof-fixture.ts";

const FIXTURES = join(import.meta.dir, "../fixtures/tlc");

function stdout(name: string): string {
	return readFileSync(join(FIXTURES, name, "stdout.txt"), "utf8");
}

function exited(code: number, output: string): RunEnd {
	return { kind: "exited", code, stdout: output, stderr: "" };
}

const crlf = (text: string): string => text.replaceAll("\n", "\r\n");

const GROW_TRACE =
	"1: <Initial predicate> x = 0; 2: <Step line 5, col 9 to line 5, col 18 of module Grow> x = 1; 3: <Step line 5, col 9 to line 5, col 18 of module Grow> x = 2";

const LOOP_TRACE =
	"1: <Initial predicate> x = 0; 2: <Next line 5, col 9 to line 5, col 24 of module Loop> x = 1; 3: <Next line 5, col 9 to line 5, col 24 of module Loop> x = 2; back to state 1: <Next line 5, col 9 to line 5, col 24 of module Loop>";

type Judge = (output: string) => unknown;

const recordCount: Judge = (output) => {
	const parsed = parseTlcRecords(output);
	return parsed.ok && parsed.value.records.length;
};

describe("TLC output with CRLF line ends", () => {
	test.each<[string, string, Judge, unknown]>([
		["the records of a positive run", "counter", recordCount, 17],
		["the records of a violation", "grow", recordCount, 17],
		[
			"the counts of a positive run",
			"counter",
			(output) => judgePositive("positive", exited(0, output), ["Returns"]),
			ok({ generated: 4, distinct: 3, queued: 0 }),
		],
		[
			"an invariant violation",
			"grow",
			(output) =>
				judgeNegative(exited(12, output), { kind: "invariant", name: "Small" }),
			ok({ name: "Small", states: 3, trace: GROW_TRACE }),
		],
	])(
		"[control:tlc-line-ends] the CRLF and LF copies give %s",
		(_name, fixture, judge, expected) => {
			expect(judge(stdout(fixture))).toEqual(expected);
			expect(judge(crlf(stdout(fixture)))).toEqual(expected);
		},
	);
});

const SANY_ONLY_RECORDS = [
	"@!@!@STARTMSG 3002:1 @!@!@",
	"Parsing or semantic analysis failed.",
	"@!@!@ENDMSG 3002 @!@!@",
	"@!@!@STARTMSG 2186:0 @!@!@",
	"Finished in 89ms",
	"@!@!@ENDMSG 2186 @!@!@",
	"",
].join("\n");

const positive150: Judge = (output) =>
	judgePositive("positive", exited(150, output), []);

describe("SANY errors", () => {
	test.each<[string, string, Judge, string]>([
		[
			"a parse error",
			stdout("parse-error"),
			positive150,
			'the positive run exited 150 with error 3002. SANY reports module M, line 5, column 1: Encountered "====" at line 5, column 1 and token "="',
		],
		[
			"a parse error in a dependency module",
			stdout("dependency-parse-error"),
			positive150,
			'the positive run exited 150 with error 3002. SANY reports module Dep, line 5, column 1: Encountered "====" at line 5, column 1 and token "="',
		],
		[
			"a semantic error",
			stdout("semantic-error"),
			positive150,
			"the positive run exited 150 with error 3002. SANY reports module M, line 4, column 11: Unknown operator: `q'.",
		],
		[
			"a 3002 record with no SANY location",
			SANY_ONLY_RECORDS,
			positive150,
			"the positive run exited 150 with error 3002",
		],
		[
			"a parse error in the negative run",
			stdout("parse-error"),
			(output) =>
				judgeNegative(exited(150, output), {
					kind: "invariant",
					name: "Small",
				}),
			'the negative run exited 150 with error 3002, not the expected invariant violation. SANY reports module M, line 5, column 1: Encountered "====" at line 5, column 1 and token "="',
		],
	])(
		"[control:tlc-sany-location] %s names its module, line and column",
		(_name, output, judge, message) => {
			expect(judge(output)).toEqual({ ok: false, error: message });
		},
	);
});

const record = (code: number, severity: number, body: string): string =>
	`@!@!@STARTMSG ${code}:${severity} @!@!@\n${body}\n@!@!@ENDMSG ${code} @!@!@\n`;

const LONG_STATE = `x = ${"7".repeat(300)}`;

const LONG_TRACE = [
	record(2110, 1, "Invariant Small is violated."),
	record(2121, 1, "The behavior up to this point is:"),
	...Array.from({ length: 25 }, (_, at) =>
		record(2217, 4, `${at + 1}: <Step>\n${LONG_STATE}`),
	),
	record(2186, 0, "Finished in 1s"),
].join("");

describe("violation traces", () => {
	test.each<[string, () => unknown, unknown]>([
		[
			"a positive run with a broken invariant",
			() => judgePositive("positive", exited(12, stdout("grow")), []),
			{
				ok: false,
				error: `the positive run exited 12 with error 2110, 2121. It broke invariant Small with a trace of 3 states: ${GROW_TRACE}`,
			},
		],
		[
			"a positive run with a broken temporal property and a loop back",
			() => judgePositive("positive", exited(13, stdout("loop")), ["Ends"]),
			{
				ok: false,
				error: `the positive run exited 13 with error 2116, 2264. It broke the temporal property Ends with a trace of 3 states: ${LOOP_TRACE}`,
			},
		],
		[
			"a positive run with a trace of 25 long states",
			() => judgePositive("positive", exited(12, LONG_TRACE), []),
			{
				ok: false,
				error: `the positive run exited 12 with error 2110, 2121. It broke invariant Small with a trace of 25 states: ${Array.from(
					{ length: 20 },
					(_, at) => `${`${at + 1}: <Step> ${LONG_STATE}`.slice(0, 197)}...`,
				).join("; ")}; and 5 more steps`,
			},
		],
		[
			"a temporal countermodel, whose loop back is no state",
			() =>
				judgeNegative(exited(13, stdout("loop")), {
					kind: "temporal",
					name: "Ends",
				}),
			ok({ name: "Ends", states: 3, trace: LOOP_TRACE }),
		],
	])(
		"[control:tlc-violation-trace] %s names its claim and prints its steps",
		(_name, run, expected) => {
			expect(run()).toEqual(expected);
		},
	);
});

const PROGRESS = (time: string, distinct: string): string =>
	record(
		2200,
		0,
		`Progress(3) at ${time}: 9 states generated (1,702 s/min), ${distinct} distinct states found (1,276 ds/min), 4 states left on queue.`,
	);

const scratch = scratchDir("astack-tlc-output-");
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("a run past the deadline", () => {
	test.each([
		[
			"two progress records and an open record",
			`${PROGRESS("2026-11-22 11:57:50", "3")}${PROGRESS("2026-11-22 11:58:50", "1,234")}@!@!@STARTMSG 2200:0 @!@!@\nProgress(3) at 2026-11-22 11:59:50: 12`,
			"the positive run passed the 3000 ms deadline and was stopped. It found at least 1234 distinct states by 2026-11-22 11:58:50",
		],
		[
			"no progress record",
			record(
				2190,
				0,
				"Finished computing initial states: 1 distinct state generated.",
			),
			"the positive run passed the 3000 ms deadline and was stopped",
		],
	])(
		"[control:proof-timeout-progress] with %s names its last progress",
		(_name, stdout, message) => {
			expect(
				judgePositive("positive", { kind: "timeout", ms: 3000, stdout }, []),
			).toEqual({ ok: false, error: message });
		},
	);

	test("[control:proof-timeout-stdout] keeps the stdout that the checker printed before the kill", async () => {
		const java = join(scratch, "slow-java.sh");
		const progress = PROGRESS("2026-11-22 11:57:50", "3");
		writeFileSync(
			java,
			`#!/bin/sh\nprintf '%s' '${progress}'\nexec sleep 30\n`,
		);
		chmodSync(java, 0o755);
		const run = await runModel(
			{ PATH: process.env.PATH ?? "", TMPDIR: scratch },
			{ jar: new Uint8Array(), java, javaVersion: "17" },
			[],
			"M.tla",
			"M.cfg",
			500,
		);
		expect(run).toEqual({
			end: { kind: "timeout", ms: 500, stdout: progress },
			cleanup: ok(undefined),
		});
	});
});
