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
			expect(records.ok && records.value.length).toBe(count);
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
