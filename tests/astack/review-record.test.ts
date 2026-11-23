import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { ok } from "../../src/astack/result.ts";
import {
	deltaBase,
	type ReviewedHead,
	type ReviewRecord,
	STOP_DECISIONS,
	withHead,
} from "../../src/astack/review-record.ts";
import { loadRecord, saveRecord } from "../../src/astack/review-store.ts";

const RUNS = { numRuns: 200 };
const root = mkdtempSync(join(tmpdir(), "astack-review-record-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const SHAS = ["a", "b", "c", "d"].map((digit) => digit.repeat(40));
const sha = fc.constantFrom(...SHAS);
const head: fc.Arbitrary<ReviewedHead> = fc.record({
	sha,
	decision: fc.constantFrom(...STOP_DECISIONS),
	launches: fc.nat({ max: 12 }),
});
const record: fc.Arbitrary<ReviewRecord> = fc.record({
	baseSha: sha,
	firstReviewedHead: sha,
	heads: fc.array(head, { maxLength: 6 }),
});

describe("the review record", () => {
	test("[control:review-record-append] withHead keeps both first-review fields and puts the new head last", () => {
		fc.assert(
			fc.property(record, head, (before, added) => {
				expect(withHead(before, added)).toEqual({
					baseSha: before.baseSha,
					firstReviewedHead: before.firstReviewedHead,
					heads: [...before.heads, added],
				});
			}),
			RUNS,
		);
	});

	test("[control:review-delta-base] deltaBase gives the last stop_clean head that HEAD holds, else a full run", () => {
		fc.assert(
			fc.property(record, fc.subarray(SHAS), (subject, ancestors) => {
				const held = subject.heads.map(
					(one) => one.decision === "stop_clean" && ancestors.includes(one.sha),
				);
				const result = deltaBase(subject, ancestors);
				if (result.kind === "full") {
					expect(held).not.toContain(true);
					return;
				}
				expect(held.lastIndexOf(true)).not.toBe(-1);
				expect(subject.heads[held.lastIndexOf(true)]?.sha).toBe(result.sha);
			}),
			RUNS,
		);
	});

	test("a record with no clean head, or with clean heads that HEAD does not hold, names the reason of its full run", () => {
		const [a = "", b = ""] = SHAS;
		const base = { baseSha: a, firstReviewedHead: b };
		expect([
			deltaBase(
				{
					...base,
					heads: [{ sha: b, decision: "stop_recurring", launches: 3 }],
				},
				[b],
			),
			deltaBase(
				{ ...base, heads: [{ sha: b, decision: "stop_clean", launches: 3 }] },
				[],
			),
		]).toEqual([
			{ kind: "full", reason: "the record holds no stop_clean head" },
			{ kind: "full", reason: "HEAD holds no stop_clean head of the record" },
		]);
	});
});

describe("the review store", () => {
	test("[control:review-store-roundtrip] a saveRecord and then a loadRecord of one path give an equal record", () => {
		const path = join(
			root,
			"roundtrip",
			"pr-review-hardening",
			"b.review.json",
		);
		fc.assert(
			fc.property(record, record, (first, last) => {
				expect(saveRecord(first, path)).toEqual(ok(undefined));
				expect(saveRecord(last, path)).toEqual(ok(undefined));
				expect(loadRecord(path)).toEqual(ok(last));
			}),
			RUNS,
		);
	});

	test("[control:review-store-atomic] a save that cannot write its temporary file fails and keeps the old record", () => {
		const path = join(root, "atomic.review.json");
		const [a = "", b = ""] = SHAS;
		const old: ReviewRecord = {
			baseSha: a,
			firstReviewedHead: b,
			heads: [{ sha: b, decision: "stop_clean", launches: 2 }],
		};
		expect(saveRecord(old, path)).toEqual(ok(undefined));
		mkdirSync(`${path}.${process.pid}.tmp`);
		const next = withHead(old, { sha: a, decision: "stop_clean", launches: 1 });
		expect(saveRecord(next, path).ok).toBe(false);
		expect(loadRecord(path)).toEqual(ok(old));
	});

	const A = "a".repeat(40);
	const B = "b".repeat(40);
	test.each([
		[
			"a record of an older run with no heads reads with an empty list",
			`{"baseSha":"${A}","firstReviewedHead":"${B}"}`,
			{ heads: [] },
		],
		["a file that is not JSON is unreadable", "{", { message: "not JSON" }],
		[
			"a head with a decision that the engine has no word for is unreadable",
			`{"baseSha":"${A}","firstReviewedHead":"${B}","heads":[{"sha":"${B}","decision":"clean","launches":1}]}`,
			{ message: "heads[0].decision is not a stop decision" },
		],
	])("%s", (name, text, expected) => {
		const path = join(root, `${name.length}.review.json`);
		writeFileSync(path, text);
		expect(loadRecord(path)).toEqual(
			"heads" in expected
				? ok({ baseSha: A, firstReviewedHead: B, heads: expected.heads })
				: {
						ok: false,
						error: { kind: "unreadable", path, message: expected.message },
					},
		);
	});

	test("a path with no file is a missing record", () => {
		const path = join(root, "none.review.json");
		expect(loadRecord(path)).toEqual({
			ok: false,
			error: { kind: "missing", path },
		});
	});
});
