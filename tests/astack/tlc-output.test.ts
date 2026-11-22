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
			judgePositive("positive", exited(0, crlf(stdout("counter"))), true),
		).toEqual(ok({ generated: 4, distinct: 3, queued: 0 }));
	});

	test("[control:tlc-line-ends] a CRLF invariant violation names its invariant and states", () => {
		expect(
			judgeNegative(exited(12, crlf(stdout("grow"))), {
				kind: "invariant",
				name: "Small",
			}),
		).toEqual(ok({ name: "Small", states: 3 }));
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
			expect(judgePositive("positive", exited(150, output), false)).toEqual({
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
