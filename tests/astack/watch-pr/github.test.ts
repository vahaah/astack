import { describe, expect, test } from "bun:test";
import {
	buildReviewThreads,
	ChecksUnavailable,
	mapRollupNode,
	orderStack,
	parseFastCheck,
	parsePullRequest,
	parseReviewThreadPage,
	resolveChecks,
	resolveContext,
	resolveReviewThreads,
	reviewBotOf,
	WatcherQueryError,
} from "../../../src/astack/watch-pr/github.ts";
import { parsePrNumber } from "../../../src/astack/watch-pr/types.ts";
import {
	failedCheck,
	fakeReader,
	passingCheck,
	pendingCheck,
} from "./fakes.ts";

const context = {
	owner: "owner",
	repo: "repo",
	number: parsePrNumber(42),
};

describe("checks fallback chain", () => {
	test("uses a non-empty fast-path result without a rollup query", async () => {
		const reader = fakeReader({
			fastPath: { kind: "checks", checks: [passingCheck("fast")] },
		});
		const read = await resolveChecks(reader, context);
		expect(read.source).toBe("gh-pr-checks");
		expect(read.checks.map((check) => check.name)).toEqual(["fast"]);
		expect(reader.calls).toEqual(["checksFastPath"]);
	});

	test("paginates GraphQL when the fast path is unusable", async () => {
		const reader = fakeReader({
			fastPath: { kind: "unusable", exitCode: 8, stderr: "" },
			rollupPages: [
				{ checks: [passingCheck("first")], endCursor: "next" },
				{ checks: [failedCheck("second")], endCursor: null },
			],
		});
		const read = await resolveChecks(reader, context);
		expect(read.source).toBe("graphql-rollup");
		expect(read.checks.map((check) => check.name)).toEqual(["first", "second"]);
		expect(reader.calls).toEqual([
			"checksFastPath",
			"checkRollupPage:null",
			"checkRollupPage:next",
		]);
	});

	test("falls back when valid fast-path JSON represented an empty list", async () => {
		const reader = fakeReader({
			fastPath: { kind: "checks", checks: [] },
			rollupPages: [{ checks: [pendingCheck("fallback")], endCursor: null }],
		});
		expect((await resolveChecks(reader, context)).checks[0].name).toBe(
			"fallback",
		);
		expect(reader.calls).toEqual(["checksFastPath", "checkRollupPage:null"]);
	});

	test("fails closed when both paths are empty", async () => {
		const reader = fakeReader({
			fastPath: {
				kind: "unusable",
				exitCode: 8,
				stderr: "credential cannot read checks",
			},
		});
		await expect(resolveChecks(reader, context)).rejects.toBeInstanceOf(
			ChecksUnavailable,
		);
		expect(reader.calls).toEqual(["checksFastPath", "checkRollupPage:null"]);
	});
});

describe("rollup node mapping", () => {
	test("maps terminal and non-terminal CheckRun states fail closed", () => {
		const cases = [
			["IN_PROGRESS", null, "pending", "PENDING"],
			["COMPLETED", "SUCCESS", "passed", "SUCCESS"],
			["COMPLETED", "NEUTRAL", "skipped", "NEUTRAL"],
			["COMPLETED", "SKIPPED", "skipped", "SKIPPED"],
			["COMPLETED", "ACTION_REQUIRED", "failed", "ACTION_REQUIRED"],
			["COMPLETED", "TIMED_OUT", "failed", "FAILURE"],
			["COMPLETED", "FUTURE_VALUE", "failed", "FAILURE"],
		] as const;
		for (const [status, conclusion, kind, reportedState] of cases) {
			expect(
				mapRollupNode({
					__typename: "CheckRun",
					name: "ci",
					status,
					conclusion,
				}),
			).toMatchObject({ kind, reportedState });
		}
	});

	test("classifies an in-progress Code Review Gate from the rollup as the gate", () => {
		expect(
			mapRollupNode({
				__typename: "CheckRun",
				name: "Code Review Gate",
				status: "IN_PROGRESS",
				conclusion: null,
			}),
		).toMatchObject({ kind: "code-review-gate" });
		expect(
			mapRollupNode({
				__typename: "StatusContext",
				context: "Code Review Gate",
				state: "PENDING",
			}),
		).toMatchObject({ kind: "code-review-gate" });
	});

	test("classifies a Code Review Gate waiting on an owner approval as the gate", () => {
		expect(
			mapRollupNode({
				__typename: "CheckRun",
				name: "Code Review Gate",
				status: "COMPLETED",
				conclusion: "ACTION_REQUIRED",
				description: "1 of 2 policies",
			}),
		).toMatchObject({
			kind: "code-review-gate",
			reportedState: "ACTION_REQUIRED",
		});
	});

	test("classifies a fast-path Code Review Gate waiting on an owner approval as the gate", () => {
		expect(
			parseFastCheck({
				name: "Code Review Gate",
				state: "ACTION_REQUIRED",
				bucket: "fail",
			}),
		).toMatchObject({
			kind: "code-review-gate",
			reportedState: "ACTION_REQUIRED",
		});
		expect(
			parseFastCheck({ name: "ci", state: "ACTION_REQUIRED", bucket: "fail" }),
		).toMatchObject({ kind: "failed", reportedState: "ACTION_REQUIRED" });
	});

	test("maps StatusContext states and drops unknown typenames", () => {
		expect(
			mapRollupNode({
				__typename: "StatusContext",
				context: "ci",
				state: "EXPECTED",
			}),
		).toMatchObject({ kind: "pending", reportedState: "PENDING" });
		expect(
			mapRollupNode({
				__typename: "StatusContext",
				context: "ci",
				state: "FUTURE_VALUE",
			}),
		).toMatchObject({ kind: "failed", reportedState: "FUTURE_VALUE" });
		expect(mapRollupNode({ __typename: "FutureNode" })).toBeNull();
	});
});

describe("closed enum parsing", () => {
	const rawPullRequest = {
		mergeable: "MERGEABLE",
		mergeStateStatus: "CLEAN",
		reviewDecision: "APPROVED",
		headRefOid: "head",
		headRefName: "feature",
		baseRefName: "main",
		state: "OPEN",
		mergedAt: null,
		isDraft: false,
	};

	test("accepts mergeStateStatus CONFLICTING", () => {
		expect(
			parsePullRequest(
				{ ...rawPullRequest, mergeStateStatus: "CONFLICTING" },
				context,
			).mergeStateStatus,
		).toBe("CONFLICTING");
	});

	test("reads gh's empty reviewDecision as no decision rather than a parse failure", () => {
		expect(
			parsePullRequest({ ...rawPullRequest, reviewDecision: "" }, context)
				.reviewDecision,
		).toBeNull();
	});

	test("still rejects an unknown reviewDecision", () => {
		expect(() =>
			parsePullRequest({ ...rawPullRequest, reviewDecision: "MAYBE" }, context),
		).toThrow(WatcherQueryError);
	});

	test("rejects unknown enum values as retryable errors carrying the raw value", () => {
		try {
			parsePullRequest(
				{ ...rawPullRequest, mergeStateStatus: "FUTURE_STATE" },
				context,
			);
			throw new Error("expected parser to throw");
		} catch (error) {
			expect(error).toBeInstanceOf(WatcherQueryError);
			if (!(error instanceof WatcherQueryError)) throw error;
			expect(error.failure).toMatchObject({
				kind: "missing-key",
				retryable: true,
				rawValue: '"FUTURE_STATE"',
			});
		}
	});
});

const threadNode = (
	id: string,
	isResolved: boolean,
	author: { __typename: string; login: string },
	commit: string | null,
) => ({
	id,
	isResolved,
	comments: {
		nodes: [
			{
				body: "finding",
				createdAt: "now",
				path: "a.ts",
				line: 1,
				author,
				originalCommit: commit === null ? null : { oid: commit },
			},
		],
	},
});
const reviewThreadResponse = (nodes: readonly unknown[]) => ({
	data: {
		repository: {
			pullRequest: {
				reviewThreads: {
					pageInfo: { hasNextPage: false, endCursor: null },
					nodes,
				},
			},
		},
	},
});
const greptile = { __typename: "Bot", login: "greptile-apps" };
const codex = { __typename: "Bot", login: "chatgpt-codex-connector" };

test("counts each review bot's passes by the distinct commits it reviewed", () => {
	const response = reviewThreadResponse([
		threadNode("g1", false, greptile, "aaa"),
		threadNode("g2", false, greptile, "bbb"),
		threadNode("g3", true, greptile, "ccc"),
		threadNode("c1", false, codex, "bbb"),
		threadNode("human", false, { __typename: "User", login: "octocat" }, "bbb"),
	]);
	const threads = buildReviewThreads(parseReviewThreadPage(response).threads);
	expect(
		threads.map((thread) => [
			thread.id,
			thread.reviewBot,
			thread.reviewBotPasses,
		]),
	).toEqual([
		["g1", "greptile-apps", 3],
		["g2", "greptile-apps", 3],
		["c1", "chatgpt-codex-connector", 1],
		["human", null, 0],
	]);
});

test("treats a bot thread with no reviewed commit as one pass", () => {
	const response = reviewThreadResponse([
		threadNode(
			"one",
			false,
			{ __typename: "Bot", login: "coderabbitai" },
			null,
		),
		threadNode(
			"two",
			false,
			{ __typename: "Bot", login: "coderabbitai" },
			null,
		),
	]);
	const threads = buildReviewThreads(parseReviewThreadPage(response).threads);
	expect(threads.map((thread) => thread.reviewBotPasses)).toEqual([1, 1]);
});

describe("reviewBotOf", () => {
	const comment = (authorLogin: string | null, authorIsBot: boolean) => ({
		authorLogin,
		authorIsBot,
		body: "finding",
		path: null,
		line: null,
		createdAt: "now",
		commitOid: null,
	});

	test("names bots by their login without the [bot] suffix", () => {
		expect(reviewBotOf(comment("claude", true))).toBe("claude");
		expect(reviewBotOf(comment("claude[bot]", false))).toBe("claude");
		expect(reviewBotOf(comment("Copilot-Pull-Request-Reviewer", true))).toBe(
			"copilot-pull-request-reviewer",
		);
	});

	test("never treats a human account as a review bot", () => {
		expect(reviewBotOf(comment("claude", false))).toBeNull();
		expect(reviewBotOf(comment(null, true))).toBeNull();
		expect(reviewBotOf(null)).toBeNull();
	});
});

describe("review thread pagination", () => {
	const thread = (id: string, resolved = false) => ({
		id,
		firstComment: {
			authorLogin: "someone",
			authorIsBot: false,
			body: "please fix",
			path: "a.ts",
			line: 1,
			createdAt: "now",
			commitOid: "abc",
		},
		resolved,
	});

	test("keeps walking pages until the cursor is exhausted", async () => {
		const reader = fakeReader({
			threadPages: [
				{ threads: [thread("one")], endCursor: "next" },
				{ threads: [thread("two")], endCursor: "last" },
				{ threads: [thread("three")], endCursor: null },
			],
		});
		const threads = await resolveReviewThreads(reader, context);
		expect(threads.map((item) => item.id)).toEqual(["one", "two", "three"]);
		expect(reader.calls).toEqual([
			"reviewThreadPage:null",
			"reviewThreadPage:next",
			"reviewThreadPage:last",
		]);
	});

	test("sees an unresolved thread that sits past the first page", async () => {
		const reader = fakeReader({
			threadPages: [
				{ threads: [thread("early", true)], endCursor: "next" },
				{ threads: [thread("late")], endCursor: null },
			],
		});
		const threads = await resolveReviewThreads(reader, context);
		expect(threads.map((item) => item.id)).toEqual(["late"]);
	});

	test("stops after a single page when the cursor is exhausted", async () => {
		const reader = fakeReader({
			threadPages: [{ threads: [thread("only")], endCursor: null }],
		});
		expect((await resolveReviewThreads(reader, context)).length).toBe(1);
		expect(reader.calls).toEqual(["reviewThreadPage:null"]);
	});

	test("counts review-bot passes across every page", async () => {
		const botThread = (id: string, commitOid: string) => ({
			id,
			firstComment: {
				authorLogin: "greptile-apps",
				authorIsBot: true,
				body: "finding",
				path: "a.ts",
				line: 1,
				createdAt: "now",
				commitOid,
			},
			resolved: false,
		});
		const reader = fakeReader({
			threadPages: [
				{ threads: [botThread("one", "head-1")], endCursor: "next" },
				{ threads: [botThread("two", "head-2")], endCursor: null },
			],
		});
		const threads = await resolveReviewThreads(reader, context);
		expect(threads.map((item) => item.reviewBotPasses)).toEqual([2, 2]);
	});

	test("drops resolved threads from later pages too", async () => {
		const reader = fakeReader({
			threadPages: [
				{ threads: [thread("one")], endCursor: "next" },
				{ threads: [thread("two", true)], endCursor: null },
			],
		});
		expect(
			(await resolveReviewThreads(reader, context)).map((item) => item.id),
		).toEqual(["one"]);
	});

	test("rejects a page that omits pageInfo instead of assuming one page", async () => {
		const response = {
			data: {
				repository: {
					pullRequest: { reviewThreads: { nodes: [] } },
				},
			},
		};
		expect(() => parseReviewThreadPage(response)).toThrow(WatcherQueryError);
	});
});

describe("context and stack discovery", () => {
	test("returns a fully explicit context without any reader call", async () => {
		const reader = fakeReader();
		expect(
			await resolveContext({
				reader,
				owner: "explicit",
				repo: "repo",
				pr: context.number,
			}),
		).toEqual({ owner: "explicit", repo: "repo", number: context.number });
		expect(reader.calls).toEqual([]);
	});

	test("uses the local origin before currentPr for an explicit number", async () => {
		const reader = fakeReader({ origin: { owner: "local", repo: "checkout" } });
		expect(
			await resolveContext({
				reader,
				owner: null,
				repo: null,
				pr: context.number,
			}),
		).toEqual({ owner: "local", repo: "checkout", number: context.number });
		expect(reader.calls).toEqual(["originRepo"]);
	});

	test("orders the connected stack bottom-to-top", () => {
		const ordered = orderStack(context, [
			{
				number: parsePrNumber(41),
				headRefName: "base-feature",
				baseRefName: "main",
				isCrossRepository: false,
			},
			{
				number: context.number,
				headRefName: "feature",
				baseRefName: "base-feature",
				isCrossRepository: false,
			},
			{
				number: parsePrNumber(43),
				headRefName: "upstack",
				baseRefName: "feature",
				isCrossRepository: false,
			},
		]);
		expect(ordered.map((item) => Number(item.number))).toEqual([41, 42, 43]);
	});

	test("ends the walk down the stack when the bases of open PRs form a cycle", () => {
		const ordered = orderStack(context, [
			{
				number: context.number,
				headRefName: "feature",
				baseRefName: "loop",
				isCrossRepository: false,
			},
			{
				number: parsePrNumber(7),
				headRefName: "loop",
				baseRefName: "feature",
				isCrossRepository: false,
			},
		]);
		expect(ordered.map((item) => Number(item.number))).toEqual([7, 42]);
	});

	test("leaves each PR from a fork out of the stack, also one whose head branch name matches a base", () => {
		const ordered = orderStack(context, [
			{
				number: parsePrNumber(41),
				headRefName: "base-feature",
				baseRefName: "main",
				isCrossRepository: false,
			},
			{
				number: parsePrNumber(99),
				headRefName: "base-feature",
				baseRefName: "main",
				isCrossRepository: true,
			},
			{
				number: context.number,
				headRefName: "feature",
				baseRefName: "base-feature",
				isCrossRepository: false,
			},
			{
				number: parsePrNumber(98),
				headRefName: "fork-upstack",
				baseRefName: "feature",
				isCrossRepository: true,
			},
		]);
		expect(ordered.map((item) => Number(item.number))).toEqual([41, 42]);
	});
});
