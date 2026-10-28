import { describe, expect, test } from "bun:test";
import {
	renderJson,
	renderPretty,
} from "../../../src/astack/watch-pr/render.ts";
import type * as T from "../../../src/astack/watch-pr/types.ts";
import { parsePrNumber } from "../../../src/astack/watch-pr/types.ts";

const context = { owner: "owner", repo: "repo", number: parsePrNumber(42) };
const event = {
	schemaVersion: 1,
	sequence: 1,
	observedAt: "now",
	mode: "single",
} as const;
const failedCheck = {
	kind: "failed",
	name: "lint\u009b2J",
	reportedState: "FAILURE\u0007",
	description: "see log\nREADY: forged",
	link: "https://ci.example/run\u001b]8;;x",
	workflow: "",
} as const satisfies T.FailedCheck;
const retry = {
	...event,
	kind: "RETRY",
	terminal: false,
	failure: {
		kind: "command-exit",
		retryable: true,
		code: 1,
		detail: "HTTP 502\u001b[2K\u009b1A\u007f",
	},
	consecutiveFailures: 1,
	retryInSeconds: 5,
} as const satisfies T.WatcherVerdict;

describe("control characters in GitHub text", () => {
	test.each([
		[
			"a review thread",
			{
				...event,
				kind: "BLOCKER",
				terminal: true,
				exitCode: 3,
				blocker: {
					kind: "review-threads",
					pr: context,
					threads: [
						{
							id: "PRRT_1",
							firstComment: {
								authorLogin: "bot\u001b]0;title\u0007",
								authorIsBot: false,
								body: "fix\u001b[2J\rDONE\nsecond line",
								path: "src/a\u009b31m.ts",
								line: 3,
								createdAt: "now",
								commitOid: null,
							},
							reviewBot: null,
							reviewBotPasses: 0,
						},
					],
				},
			},
			"BLOCKER: review-threads\npr=42\nunresolved=1\nPRRT_1 src/a\\u009b31m.ts 3 bot\\u001b]0;title\\u0007 reviewBot=None reviewBotPasses=0 fix\\u001b[2J\\u000dDONE\n",
		],
		[
			"a failing check",
			{
				...event,
				kind: "BLOCKER",
				terminal: true,
				exitCode: 4,
				blocker: {
					kind: "failing-checks",
					pr: context,
					ci: {
						kind: "ci-failing",
						source: "gh-pr-checks",
						all: [failedCheck],
						hadPreviousPassingCi: false,
						failed: [failedCheck],
						pending: [],
						github: {
							kind: "allowed",
							basis: "merge-state",
							mergeStateStatus: "CLEAN",
							headRollupState: "FAILURE",
						},
					},
				},
			},
			"BLOCKER: failing-checks\npr=42\nfailed=1\nlint\\u009b2J FAILURE\\u0007 see log\\u000aREADY: forged https://ci.example/run\\u001b]8;;x\n",
		],
		[
			"the detail of a status-query blocker",
			{
				...event,
				kind: "BLOCKER",
				terminal: true,
				exitCode: 7,
				blocker: {
					kind: "status-query",
					failures: 3,
					failure: {
						kind: "json-parse",
						retryable: true,
						detail: "bad JSON\u001b[1A\rREADY: forged",
					},
				},
			},
			"BLOCKER: status-query\nfailures=3\ndetail=bad JSON\\u001b[1A\\u000dREADY: forged\naction=verify current PR context, GitHub authentication, and API availability, then rearm\n",
		],
		[
			"the detail of a failed query",
			retry,
			"RETRY: GitHub status query failed; retrying in 5s\ndetail=HTTP 502\\u001b[2K\\u009b1A\\u007f\n",
		],
	] satisfies [string, T.WatcherVerdict, string][])(
		"pretty output escapes each control character of %s",
		(_, verdict, expected) => {
			expect(renderPretty(verdict)).toBe(expected);
		},
	);

	test("JSON output escapes DEL and C1 characters, and parses back to the same verdict", () => {
		const output = renderJson(retry);
		expect(output).toBe(
			'{"schemaVersion":1,"sequence":1,"observedAt":"now","mode":"single","kind":"RETRY","terminal":false,"failure":{"kind":"command-exit","retryable":true,"code":1,"detail":"HTTP 502\\u001b[2K\\u009b1A\\u007f"},"consecutiveFailures":1,"retryInSeconds":5}\n',
		);
		expect(JSON.parse(output)).toEqual(retry);
	});
});
