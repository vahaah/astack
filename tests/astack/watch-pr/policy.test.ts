import { describe, expect, test } from "bun:test";
import { WatcherQueryError } from "../../../src/astack/watch-pr/github.ts";
import {
	assessGitHubMerge,
	classifyPr,
	isReviewAutomationCheck,
	queryBackoffSeconds,
	readSnapshot,
	runSimple,
} from "../../../src/astack/watch-pr/policy.ts";
import type {
	GitHubReader,
	PollingOptions,
	PrContext,
	ProgressVerdict,
	PullRequestFacts,
	RollupState,
} from "../../../src/astack/watch-pr/types.ts";
import { parsePrNumber } from "../../../src/astack/watch-pr/types.ts";
import {
	failedCheck,
	fakeReader,
	passingCheck,
	pendingCheck,
} from "./fakes.ts";

const context = (number: number): PrContext => ({
	owner: "owner",
	repo: "repo",
	number: parsePrNumber(number),
});
const options = {
	interval: 10,
	timeout: 0,
	maxQueryErrors: 5,
	allowDraft: false,
} satisfies PollingOptions;

describe("readiness truth table", () => {
	test("covers every specified row and every UNKNOWN rollup value", () => {
		const cases: readonly [
			PullRequestFacts["mergeStateStatus"],
			RollupState,
			"allowed" | "refused",
		][] = [
			["BLOCKED", "FAILURE", "refused"],
			["BLOCKED", "ERROR", "refused"],
			["BLOCKED", "PENDING", "allowed"],
			["UNSTABLE", "FAILURE", "allowed"],
			["UNKNOWN", "ERROR", "allowed"],
			["UNKNOWN", "EXPECTED", "allowed"],
			["UNKNOWN", "FAILURE", "allowed"],
			["UNKNOWN", "PENDING", "allowed"],
			["UNKNOWN", "SUCCESS", "allowed"],
			["UNKNOWN", null, "allowed"],
			["CLEAN", "SUCCESS", "allowed"],
		];
		for (const [mergeStateStatus, headRollupState, expected] of cases) {
			expect(
				assessGitHubMerge({ mergeStateStatus, headRollupState }).kind,
			).toBe(expected);
		}
	});

	test("turns a clean visible list plus GitHub refusal into an explicit CI blocker", async () => {
		const reader = fakeReader({
			facts: { mergeStateStatus: "BLOCKED" },
			fastPath: { kind: "checks", checks: [passingCheck()] },
			commitRollups: [{ oid: "head", state: "FAILURE" }],
		});
		const snapshot = await readSnapshot({
			reader,
			context: context(1),
			allowDraft: false,
		});
		expect(snapshot.kind).toBe("open");
		if (snapshot.kind !== "open") throw new Error("expected open snapshot");
		expect(snapshot.ci.kind).toBe("ci-github-rejected");
		expect(classifyPr(snapshot)).toMatchObject({
			kind: "blocker",
			blocker: { kind: "failing-checks" },
		});
	});
});

describe("snapshot query planning", () => {
	test("queries rollups for settled and failed lists", async () => {
		const settled = fakeReader();
		await readSnapshot({
			reader: settled,
			context: context(3),
			allowDraft: false,
		});
		expect(settled.calls).toContain("commitRollups");

		const failed = fakeReader({
			fastPath: { kind: "checks", checks: [failedCheck()] },
		});
		await readSnapshot({
			reader: failed,
			context: context(4),
			allowDraft: false,
		});
		expect(failed.calls).toContain("commitRollups");
	});

	test("short-circuits merged rows before threads and checks", async () => {
		const reader = fakeReader({
			facts: { state: "MERGED", mergedAt: "2026-07-26T00:00:00Z" },
		});
		expect(
			(
				await readSnapshot({
					reader,
					context: context(5),
					allowDraft: false,
				})
			).kind,
		).toBe("merged");
		expect(reader.calls).toEqual(["pullRequest"]);
	});
});

test("waits on a draft while checks are pending, then reports the draft gate", async () => {
	const pending = await readSnapshot({
		reader: fakeReader({
			facts: { isDraft: true },
			fastPath: { kind: "checks", checks: [pendingCheck()] },
		}),
		context: context(12),
		allowDraft: false,
	});
	expect(classifyPr(pending).kind).toBe("waiting");

	const settled = await readSnapshot({
		reader: fakeReader({ facts: { isDraft: true } }),
		context: context(12),
		allowDraft: false,
	});
	expect(classifyPr(settled)).toMatchObject({
		kind: "blocker",
		blocker: { kind: "merge-gate", reason: "draft-pr" },
	});
});

describe("deadline clamp", () => {
	const deadline = {
		...options,
		interval: 60,
		timeout: 5,
	} satisfies PollingOptions;
	const retryableReader = {
		...fakeReader(),
		async pullRequest(): Promise<PullRequestFacts> {
			throw new WatcherQueryError({
				kind: "command-exit",
				retryable: true,
				detail: "rate limited",
				code: 1,
			});
		},
	} satisfies GitHubReader;
	const pendingReader = fakeReader({
		fastPath: { kind: "checks", checks: [pendingCheck("build")] },
	});

	test.each([
		["[control:wp-deadline-simple] the simple runner", pendingReader, []],
		["[control:wp-deadline-retry] a retry backoff", retryableReader, [5]],
	] as const)(
		"%s sleeps only the 5 s left before the deadline, says so in each RETRY and returns TIMEOUT",
		async (_name, reader, retries) => {
			let now = 0;
			const sleeps: number[] = [];
			const retryInSeconds: number[] = [];
			const dependencies = {
				reader,
				clock: {
					now: () => now,
					observedAt: () => "2026-07-26T00:00:00.000Z",
					async sleep(seconds: number) {
						sleeps.push(seconds);
						now += seconds;
					},
				},
				emit(verdict: ProgressVerdict) {
					if (verdict.kind === "RETRY")
						retryInSeconds.push(verdict.retryInSeconds);
				},
			};
			const verdict = await runSimple({
				dependencies,
				contexts: [context(60)],
				mode: "single",
				statusOnly: false,
				options: deadline,
			});
			expect(sleeps).toEqual([5]);
			expect(retryInSeconds).toEqual([...retries]);
			expect(verdict).toMatchObject({ kind: "TIMEOUT", exitCode: 5 });
		},
	);
});

test("uses the specified retry floor and cap", () => {
	expect(queryBackoffSeconds(1, 1)).toBe(60);
	expect(queryBackoffSeconds(1, 2)).toBe(120);
	expect(queryBackoffSeconds(60, 4)).toBe(300);
});

test("recognizes pending checks from the review bots in use", () => {
	expect(
		[
			"Greptile Review",
			"CodeRabbit",
			"claude-review",
			"Codex review",
			"Copilot code review",
			"Security Review",
			"PR Review Automation",
			"build",
			"lint",
		].map(isReviewAutomationCheck),
	).toEqual([true, true, true, true, true, true, true, false, false]);
});
