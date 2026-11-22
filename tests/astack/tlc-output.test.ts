import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	judgeNegative,
	judgePositive,
	parseTlcRecords,
	type RunEnd,
} from "../../src/astack/change-proof/tlc.ts";
import { ok } from "../../src/astack/result.ts";

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

describe("TLC output with CRLF line ends", () => {
	test.each([
		["counter", 17],
		["grow", 17],
	])(
		"[control:tlc-line-ends] the CRLF copy of %s gives the records of its LF output",
		(name, count) => {
			const records = parseTlcRecords(stdout(name));
			expect(records.ok && records.value.records.length).toBe(count);
			expect(parseTlcRecords(crlf(stdout(name)))).toEqual(records);
		},
	);

	test("[control:tlc-line-ends] a CRLF positive run gives the counts of its LF run", () => {
		expect(
			judgePositive("positive", exited(0, crlf(stdout("counter"))), [
				"Returns",
			]),
		).toEqual(ok({ generated: 4, distinct: 3, queued: 0 }));
	});

	test("[control:tlc-line-ends] a CRLF invariant violation names its invariant and states", () => {
		expect(
			judgeNegative(exited(12, crlf(stdout("grow"))), {
				kind: "invariant",
				name: "Small",
			}),
		).toEqual(ok({ name: "Small", states: 3, trace: GROW_TRACE }));
	});
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

describe("SANY errors", () => {
	test.each([
		[
			"a parse error",
			stdout("parse-error"),
			'the positive run exited 150 with error 3002. SANY reports module M, line 5, column 1: Encountered "====" at line 5, column 1 and token "="',
		],
		[
			"a parse error in a dependency module",
			stdout("dependency-parse-error"),
			'the positive run exited 150 with error 3002. SANY reports module Dep, line 5, column 1: Encountered "====" at line 5, column 1 and token "="',
		],
		[
			"a semantic error",
			stdout("semantic-error"),
			"the positive run exited 150 with error 3002. SANY reports module M, line 4, column 11: Unknown operator: `q'.",
		],
		[
			"a 3002 record with no SANY location",
			SANY_ONLY_RECORDS,
			"the positive run exited 150 with error 3002",
		],
	])(
		"[control:tlc-sany-location] %s names its module, line and column",
		(_name, output, message) => {
			expect(judgePositive("positive", exited(150, output), [])).toEqual({
				ok: false,
				error: message,
			});
		},
	);

	test("[control:tlc-sany-location] a negative run with a parse error names the SANY location after the expected violation", () => {
		expect(
			judgeNegative(exited(150, stdout("parse-error")), {
				kind: "invariant",
				name: "Small",
			}),
		).toEqual({
			ok: false,
			error:
				'the negative run exited 150 with error 3002, not the expected invariant violation. SANY reports module M, line 5, column 1: Encountered "====" at line 5, column 1 and token "="',
		});
	});
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
	test.each<[string, string, number, readonly string[], string]>([
		[
			"a broken invariant",
			stdout("grow"),
			12,
			[],
			`the positive run exited 12 with error 2110, 2121. It broke invariant Small with a trace of 3 states: ${GROW_TRACE}`,
		],
		[
			"a broken temporal property with a loop back",
			stdout("loop"),
			13,
			["Ends"],
			`the positive run exited 13 with error 2116, 2264. It broke the temporal property Ends with a trace of 3 states: ${LOOP_TRACE}`,
		],
		[
			"a trace of 25 states with long states",
			LONG_TRACE,
			12,
			[],
			`the positive run exited 12 with error 2110, 2121. It broke invariant Small with a trace of 25 states: ${Array.from(
				{ length: 20 },
				(_, at) => `${`${at + 1}: <Step> ${LONG_STATE}`.slice(0, 197)}...`,
			).join("; ")}; and 5 more steps`,
		],
	])(
		"[control:tlc-violation-trace] a positive run with %s names it and prints its steps",
		(_name, output, code, properties, message) => {
			expect(
				judgePositive("positive", exited(code, output), properties),
			).toEqual({ ok: false, error: message });
		},
	);

	test("[control:tlc-violation-trace] a temporal countermodel counts its states without the loop back", () => {
		expect(
			judgeNegative(exited(13, stdout("loop")), {
				kind: "temporal",
				name: "Ends",
			}),
		).toEqual(ok({ name: "Ends", states: 3, trace: LOOP_TRACE }));
	});
});
